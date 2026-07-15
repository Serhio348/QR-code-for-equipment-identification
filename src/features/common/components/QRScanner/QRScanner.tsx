/**
 * Компонент сканера QR-кодов
 *
 * UX: открыл → сразу камера → навёл на QR → распознал.
 * Без кнопки «Включить камеру».
 *
 * Android + React.StrictMode: первый mount эффекта отменяется через короткий
 * delay до getUserMedia, иначе двойной старт даёт NotReadableError.
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

/** Дать StrictMode отменить первый mount до открытия камеры. */
const STRICT_MODE_ABORT_MS = 120;

function getBarcodeDetectorConstructor(): BarcodeDetectorConstructor | null {
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor })
    .BarcodeDetector;
  return ctor ?? null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
    return 'Нет доступа к камере. Разрешите камеру для этого сайта и откройте сканер снова.';
  }
  if (/notfound|devicesnotfound/i.test(blob)) {
    return 'Камера не найдена на устройстве.';
  }
  if (/notreadable|could not start video source|track start error|abort/i.test(blob)) {
    return 'Не удалось открыть камеру. Полностью закройте браузер и откройте приложение снова.';
  }
  if (/secure|https|insecure context/i.test(blob)) {
    return 'Сканер камеры работает только в HTTPS-режиме.';
  }

  return message || 'Ошибка при запуске сканера';
}

async function requestCameraStream(): Promise<MediaStream> {
  const attempts: MediaStreamConstraints[] = [
    { audio: false, video: { facingMode: { ideal: 'environment' } } },
    { audio: false, video: { facingMode: 'environment' } },
    { audio: false, video: true },
    { audio: false, video: { facingMode: 'user' } },
  ];

  let lastError: unknown = null;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error('Не удалось получить доступ к камере');
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
  const sessionRef = useRef(0);

  const [isInitializing, setIsInitializing] = useState(false);
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
    sessionRef.current += 1;
    releaseCamera();
    onScanSuccess(equipmentId);
  };

  const startBarcodeDetectorLoop = (
    detector: BarcodeDetectorLike,
    session: number
  ): void => {
    const tick = async (): Promise<void> => {
      if (session !== sessionRef.current || isProcessingRef.current) {
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

  const startLiveCamera = async (session: number): Promise<void> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        isIOS()
          ? 'Разрешите доступ к камере: Настройки → Safari → Камера'
          : 'Ваш браузер не поддерживает доступ к камере'
      );
    }

    const isLocalhost =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname === '[::1]';
    if (!window.isSecureContext && !isLocalhost) {
      throw new Error('Сканер камеры работает только в HTTPS-режиме');
    }

    // Ждём paint + abort-окно для StrictMode, только потом getUserMedia.
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    await delay(STRICT_MODE_ABORT_MS);
    if (session !== sessionRef.current) {
      return;
    }

    const stream = await requestCameraStream();
    if (session !== sessionRef.current) {
      stopMediaStream(stream);
      return;
    }

    streamRef.current = stream;
    const video = videoRef.current;
    if (!video) {
      stopMediaStream(stream);
      throw new Error('Видеоэлемент сканера не готов');
    }

    video.srcObject = stream;
    video.muted = true;
    video.setAttribute('playsinline', 'true');
    await video.play();

    if (session !== sessionRef.current) {
      releaseCamera();
      return;
    }

    const BarcodeDetectorCtor = getBarcodeDetectorConstructor();
    if (!BarcodeDetectorCtor) {
      // Без BarcodeDetector live-decode нестабилен — оставляем preview и просим фото.
      setIsCameraActive(true);
      setError(
        'Автораспознавание в этом браузере недоступно. Нажмите «Сфотографировать QR».'
      );
      return;
    }

    const detector = new BarcodeDetectorCtor({ formats: ['qr_code'] });
    setIsCameraActive(true);
    startBarcodeDetectorLoop(detector, session);
  };

  useEffect(() => {
    if (!isOpen) {
      sessionRef.current += 1;
      releaseCamera();
      setError(null);
      setIsInitializing(false);
      setIsDecodingFile(false);
      isProcessingRef.current = false;
      return;
    }

    const session = ++sessionRef.current;
    isProcessingRef.current = false;
    setError(null);
    setIsInitializing(true);
    setIsCameraActive(false);

    void (async () => {
      try {
        await startLiveCamera(session);
      } catch (err) {
        if (session !== sessionRef.current) {
          return;
        }
        console.error('[QRScanner] live camera failed:', getErrorName(err), err);
        releaseCamera();
        const errorMessage = normalizeScannerError(err);
        setError(errorMessage);
        onScanError?.(errorMessage);
      } finally {
        if (session === sessionRef.current) {
          setIsInitializing(false);
        }
      }
    })();

    return () => {
      sessionRef.current += 1;
      releaseCamera();
    };
  }, [isOpen]);

  const handleRetry = (): void => {
    if (!isOpen || isInitializing) {
      return;
    }

    const session = ++sessionRef.current;
    releaseCamera();
    isProcessingRef.current = false;
    setError(null);
    setIsInitializing(true);

    void (async () => {
      try {
        // Небольшая пауза, чтобы ОС отпустила камеру после ошибки.
        await delay(400);
        if (session !== sessionRef.current) {
          return;
        }
        await startLiveCamera(session);
      } catch (err) {
        if (session !== sessionRef.current) {
          return;
        }
        releaseCamera();
        const errorMessage = normalizeScannerError(err);
        setError(errorMessage);
        onScanError?.(errorMessage);
      } finally {
        if (session === sessionRef.current) {
          setIsInitializing(false);
        }
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
    try {
      const text = await decodeQrFromFile(file);
      finishWithEquipmentId(text);
    } catch (err) {
      console.error('[QRScanner] file decode failed:', err);
      const msg =
        'Не удалось распознать QR на фото. Сделайте снимок ближе, чтобы код был в кадре.';
      setError(msg);
      onScanError?.(msg);
    } finally {
      setIsDecodingFile(false);
    }
  };

  const handleClose = (): void => {
    sessionRef.current += 1;
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
          <div id="qr-scanner-file-decode-host" className="qr-scanner-file-host" />

          {isCameraActive && !error && (
            <div className="qr-scanner-aim" aria-hidden="true">
              <div className="qr-scanner-aim-frame" />
              <p className="qr-scanner-aim-hint">Наведите камеру на QR-код</p>
            </div>
          )}

          {(isInitializing || isDecodingFile) && (
            <div className="qr-scanner-loading qr-scanner-loading-overlay">
              <div className="qr-scanner-spinner" />
              <p>{isDecodingFile ? 'Распознаём QR на фото...' : 'Запуск камеры...'}</p>
            </div>
          )}
        </div>

        {error && (
          <div className="qr-scanner-footer-actions">
            <button
              type="button"
              className="qr-scanner-retry-button"
              onClick={handleRetry}
              disabled={isInitializing}
            >
              Повторить
            </button>
            <button
              type="button"
              className="qr-scanner-secondary-button qr-scanner-secondary-button-light"
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
