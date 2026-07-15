/**
 * Компонент сканера QR-кодов
 *
 * Критично для Android:
 * 1) getUserMedia вызывается сразу в обработчике клика (без await до него),
 *    иначе браузер «теряет» user gesture и камера падает с NotReadableError.
 * 2) Если live-камера недоступна — запасной путь: снимок через capture + decode.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { parseEquipmentId } from '../../../../shared/utils/qrCodeParser';
import { isIOS } from '@/shared/utils/deviceDetection';
import './QRScanner.css';

interface QRScannerProps {
  onScanSuccess: (equipmentId: string) => void;
  onScanError?: (error: string) => void;
  onClose?: () => void;
  isOpen: boolean;
}

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
};

type BarcodeDetectorConstructor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorLike;

function getBarcodeDetectorConstructor(): BarcodeDetectorConstructor | null {
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor })
    .BarcodeDetector;
  return ctor ?? null;
}

function stopMediaStream(stream: MediaStream | null): void {
  if (!stream) {
    return;
  }
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

function getErrorName(err: unknown): string {
  if (err && typeof err === 'object' && 'name' in err) {
    return String((err as { name: string }).name);
  }
  return '';
}

function normalizeScannerError(err: unknown): string {
  const name = getErrorName(err);
  const message = err instanceof Error ? err.message : String(err);
  const blob = `${name} ${message}`;

  if (/notallowed|permission|denied|разреш/i.test(blob)) {
    return 'Нет доступа к камере. Разрешите камеру для этого сайта в настройках браузера.';
  }
  if (/notfound|devicesnotfound/i.test(blob)) {
    return 'Камера не найдена на устройстве.';
  }
  if (/notreadable|could not start video source|track start error|abort/i.test(blob)) {
    return 'Не удалось открыть live-камеру. Используйте кнопку «Сфотографировать QR» ниже — это работает без постоянного доступа к камере.';
  }
  if (/secure|https|insecure context/i.test(blob)) {
    return 'Сканер камеры работает только в HTTPS-режиме.';
  }

  return message || 'Ошибка при запуске сканера';
}

async function decodeQrFromFile(file: File): Promise<string> {
  const BarcodeDetectorCtor = getBarcodeDetectorConstructor();
  if (BarcodeDetectorCtor && typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    try {
      const detector = new BarcodeDetectorCtor({ formats: ['qr_code'] });
      const codes = await detector.detect(bitmap);
      if (codes[0]?.rawValue) {
        return codes[0].rawValue;
      }
    } finally {
      bitmap.close();
    }
  }

  // Fallback: html5-qrcode умеет декодировать из файла без live-камеры.
  const scanner = new Html5Qrcode('qr-scanner-file-decode-host');
  try {
    return await scanner.scanFile(file, false);
  } finally {
    try {
      scanner.clear();
    } catch {
      // ignore
    }
  }
}

const QRScanner: React.FC<QRScannerProps> = ({
  onScanSuccess,
  onScanError,
  onClose,
  isOpen,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isProcessingRef = useRef(false);
  const aliveRef = useRef(false);
  /** Promise getUserMedia, запущенный синхронно из onClick. */
  const pendingStreamRef = useRef<Promise<MediaStream> | null>(null);

  const [isStarting, setIsStarting] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isDecodingFile, setIsDecodingFile] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearScanTimer = (): void => {
    if (scanTimerRef.current !== null) {
      window.clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }
  };

  const releaseCamera = (): void => {
    clearScanTimer();
    aliveRef.current = false;
    pendingStreamRef.current = null;

    const video = videoRef.current;
    if (video) {
      try {
        video.pause();
      } catch {
        // ignore
      }
      video.srcObject = null;
    }

    stopMediaStream(streamRef.current);
    streamRef.current = null;
    setIsCameraActive(false);
  };

  const finishWithEquipmentId = (decodedText: string): void => {
    if (isProcessingRef.current) {
      return;
    }
    isProcessingRef.current = true;

    console.log('[QRScanner] Отсканированный QR-код:', decodedText);
    const equipmentId = parseEquipmentId(decodedText);

    if (!equipmentId) {
      const errorMsg = `QR-код не содержит информацию об оборудовании.\n\nОтсканировано: ${decodedText}`;
      setError(errorMsg);
      onScanError?.(errorMsg);
      isProcessingRef.current = false;
      return;
    }

    console.log('[QRScanner] Распознан ID оборудования:', equipmentId);
    releaseCamera();
    onScanSuccess(equipmentId);
  };

  const startBarcodeDetectorLoop = (detector: BarcodeDetectorLike): void => {
    const tick = async (): Promise<void> => {
      if (!aliveRef.current || isProcessingRef.current) {
        return;
      }

      const video = videoRef.current;
      if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        try {
          const codes = await detector.detect(video);
          if (codes.length > 0 && codes[0]?.rawValue) {
            finishWithEquipmentId(codes[0].rawValue);
            return;
          }
        } catch (err) {
          console.warn('[QRScanner] BarcodeDetector.detect failed:', err);
        }
      }

      scanTimerRef.current = window.setTimeout(() => {
        void tick();
      }, 120);
    };

    void tick();
  };

  /**
   * Важно: этот вызов должен происходить синхронно в стеке click-обработчика,
   * до любых await — иначе Android Chrome часто отдаёт NotReadableError.
   */
  const beginGetUserMediaFromUserGesture = (): Promise<MediaStream> => {
    const attempts: MediaStreamConstraints[] = [
      { audio: false, video: true },
      { audio: false, video: { facingMode: 'environment' } },
      { audio: false, video: { facingMode: { ideal: 'environment' } } },
      { audio: false, video: { facingMode: 'user' } },
    ];

    const tryNext = async (index: number): Promise<MediaStream> => {
      if (index >= attempts.length) {
        throw new Error('Не удалось получить доступ к камере');
      }
      try {
        return await navigator.mediaDevices.getUserMedia(attempts[index]);
      } catch (err) {
        // NotReadable на одной камере — пробуем следующий constraint без паузы.
        if (index === attempts.length - 1) {
          throw err;
        }
        return tryNext(index + 1);
      }
    };

    return tryNext(0);
  };

  const handleEnableCamera = (): void => {
    if (isStarting || isCameraActive) {
      return;
    }

    setError(null);
    isProcessingRef.current = false;

    if (!navigator.mediaDevices?.getUserMedia) {
      const msg = isIOS()
        ? 'Разрешите доступ к камере: Настройки → Safari → Камера'
        : 'Ваш браузер не поддерживает доступ к камере. Используйте «Сфотографировать QR».';
      setError(msg);
      onScanError?.(msg);
      return;
    }

    const isLocalhost =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname === '[::1]';
    if (!window.isSecureContext && !isLocalhost) {
      const msg = 'Сканер камеры работает только в HTTPS-режиме.';
      setError(msg);
      onScanError?.(msg);
      return;
    }

    // Сразу из click — до await release/delay.
    releaseCamera();
    aliveRef.current = true;
    setIsStarting(true);
    const streamPromise = beginGetUserMediaFromUserGesture();
    pendingStreamRef.current = streamPromise;

    void (async () => {
      try {
        const stream = await streamPromise;
        if (!aliveRef.current || pendingStreamRef.current !== streamPromise) {
          stopMediaStream(stream);
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) {
          throw new Error('Видеоэлемент сканера не готов');
        }

        video.srcObject = stream;
        video.muted = true;
        video.setAttribute('playsinline', 'true');
        await video.play();

        const BarcodeDetectorCtor = getBarcodeDetectorConstructor();
        if (!BarcodeDetectorCtor) {
          // Live-decode без BarcodeDetector на части Safari — надёжнее фото.
          stopMediaStream(stream);
          streamRef.current = null;
          video.srcObject = null;
          setError(
            'Live-распознавание в этом браузере недоступно. Нажмите «Сфотографировать QR» — так сканер работает стабильно.'
          );
          return;
        }

        const detector = new BarcodeDetectorCtor({ formats: ['qr_code'] });
        setIsCameraActive(true);
        startBarcodeDetectorLoop(detector);
      } catch (err) {
        console.error('[QRScanner] live camera failed:', getErrorName(err), err);
        releaseCamera();
        const errorMessage = normalizeScannerError(err);
        setError(errorMessage);
        onScanError?.(errorMessage);
      } finally {
        setIsStarting(false);
      }
    })();
  };

  const handlePhotoCaptureClick = (): void => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (
    event: React.ChangeEvent<HTMLInputElement>
  ): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    setIsDecodingFile(true);
    setError(null);
    try {
      const text = await decodeQrFromFile(file);
      finishWithEquipmentId(text);
    } catch (err) {
      console.error('[QRScanner] file decode failed:', err);
      const msg =
        'Не удалось распознать QR на фото. Сделайте снимок ближе и ровнее, чтобы код был в кадре.';
      setError(msg);
      onScanError?.(msg);
    } finally {
      setIsDecodingFile(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      releaseCamera();
      setError(null);
      setIsStarting(false);
      setIsDecodingFile(false);
      isProcessingRef.current = false;
      return;
    }

    return () => {
      releaseCamera();
    };
  }, [isOpen]);

  const handleClose = (): void => {
    releaseCamera();
    isProcessingRef.current = false;
    onClose?.();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="qr-scanner-overlay" onClick={handleClose}>
      <div className="qr-scanner-modal" onClick={(e) => e.stopPropagation()}>
        <div className="qr-scanner-header">
          <h2 className="qr-scanner-title">Сканирование QR-кода</h2>
          <button
            className="qr-scanner-close-button"
            onClick={handleClose}
            type="button"
            aria-label="Закрыть сканер"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="qr-scanner-error">
            <p>{error}</p>
          </div>
        )}

        <div className="qr-scanner-viewport">
          <video
            ref={videoRef}
            className="qr-scanner-video"
            playsInline
            muted
            autoPlay
          />

          {/* Скрытый host для html5-qrcode.scanFile */}
          <div id="qr-scanner-file-decode-host" className="qr-scanner-file-host" />

          {!isCameraActive && !isStarting && (
            <div className="qr-scanner-start-panel">
              <p className="qr-scanner-start-hint">
                Нажмите «Включить камеру» для live-сканирования или сделайте фото QR-кода
              </p>
              <button
                type="button"
                className="qr-scanner-start-button"
                onClick={handleEnableCamera}
              >
                Включить камеру
              </button>
              <button
                type="button"
                className="qr-scanner-secondary-button"
                onClick={handlePhotoCaptureClick}
              >
                Сфотографировать QR
              </button>
            </div>
          )}

          {(isStarting || isDecodingFile) && (
            <div className="qr-scanner-loading qr-scanner-loading-overlay">
              <div className="qr-scanner-spinner" />
              <p>{isDecodingFile ? 'Распознаём QR на фото...' : 'Запуск камеры...'}</p>
            </div>
          )}
        </div>

        {(error || isCameraActive) && (
          <div className="qr-scanner-footer-actions">
            {error && (
              <button
                type="button"
                className="qr-scanner-retry-button"
                onClick={handleEnableCamera}
                disabled={isStarting}
              >
                Повторить live-камеру
              </button>
            )}
            <button
              type="button"
              className="qr-scanner-secondary-button"
              onClick={handlePhotoCaptureClick}
              disabled={isDecodingFile}
            >
              Сфотографировать QR
            </button>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="qr-scanner-file-input"
          onChange={(e) => void handleFileSelected(e)}
        />
      </div>
    </div>
  );
};

export default QRScanner;
