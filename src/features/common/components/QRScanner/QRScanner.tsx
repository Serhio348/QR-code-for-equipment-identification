/**
 * Компонент сканера QR-кодов
 *
 * Android/Chrome: свой getUserMedia + BarcodeDetector (без html5-qrcode start),
 * чтобы не ловить NotReadableError от двойного открытия камеры.
 *
 * Старт только по кнопке (user gesture) — обходит React StrictMode double-mount
 * и требования мобильных браузеров к жесту для камеры.
 *
 * Fallback (Safari и др.): html5-qrcode, тоже только по кнопке, одна попытка за раз.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Html5Qrcode,
  Html5QrcodeScannerState,
  type CameraDevice,
} from 'html5-qrcode';
import { parseEquipmentId } from '../../../../shared/utils/qrCodeParser';
import { isAndroid, isIOS } from '@/shared/utils/deviceDetection';
import './QRScanner.css';

interface QRScannerProps {
  onScanSuccess: (equipmentId: string) => void;
  onScanError?: (error: string) => void;
  onClose?: () => void;
  isOpen: boolean;
}

const HTML5_SCANNER_ID = 'qr-scanner-html5-region';

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

function pickRearCameraId(cameras: CameraDevice[]): string | null {
  const back = cameras.find((camera) =>
    /back|rear|environment|задн/i.test(camera.label)
  );
  if (back) {
    return back.id;
  }
  if (cameras.length > 1) {
    return cameras[cameras.length - 1].id;
  }
  return cameras[0]?.id ?? null;
}

function normalizeScannerError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);

  if (/notallowed|permission|denied|разреш/i.test(message)) {
    return 'Нет доступа к камере. Разрешите камеру в настройках браузера для этого сайта и нажмите «Включить камеру».';
  }
  if (/notfound|devicesnotfound|камера.*не найд/i.test(message)) {
    return 'Камера не найдена на устройстве';
  }
  if (/notreadable|could not start video source|track start error|abort/i.test(message)) {
    return 'Камера занята или не освободилась. Закройте другие вкладки с камерой, полностью закройте приложение браузера и откройте снова, затем нажмите «Включить камеру».';
  }
  if (/secure|https|insecure context/i.test(message)) {
    return 'Сканер камеры работает только в HTTPS-режиме';
  }

  return message || 'Ошибка при запуске сканера';
}

async function stopHtml5Scanner(scanner: Html5Qrcode | null): Promise<void> {
  if (!scanner) {
    return;
  }
  try {
    const state = scanner.getState();
    if (
      state === Html5QrcodeScannerState.SCANNING ||
      state === Html5QrcodeScannerState.PAUSED
    ) {
      await scanner.stop();
    }
  } catch {
    // ignore
  }
  try {
    scanner.clear();
  } catch {
    // ignore
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
  const html5ScannerRef = useRef<Html5Qrcode | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const isProcessingRef = useRef(false);
  const aliveRef = useRef(false);

  const [isStarting, setIsStarting] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useHtml5Fallback, setUseHtml5Fallback] = useState(false);

  const clearScanTimer = (): void => {
    if (scanTimerRef.current !== null) {
      window.clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }
  };

  const releaseCamera = async (): Promise<void> => {
    clearScanTimer();
    aliveRef.current = false;

    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }

    stopMediaStream(streamRef.current);
    streamRef.current = null;

    await stopHtml5Scanner(html5ScannerRef.current);
    html5ScannerRef.current = null;

    setIsCameraActive(false);
  };

  const finishWithEquipmentId = async (decodedText: string): Promise<void> => {
    if (isProcessingRef.current || !aliveRef.current) {
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
    await releaseCamera();
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
            await finishWithEquipmentId(codes[0].rawValue);
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

  const openNativeCamera = async (): Promise<void> => {
    const BarcodeDetectorCtor = getBarcodeDetectorConstructor();
    if (!BarcodeDetectorCtor) {
      throw new Error('NO_BARCODE_DETECTOR');
    }

    const constraintAttempts: MediaStreamConstraints[] = [
      {
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      },
      {
        audio: false,
        video: { facingMode: 'environment' },
      },
      {
        audio: false,
        video: true,
      },
    ];

    let stream: MediaStream | null = null;
    let lastError: unknown = null;

    for (const constraints of constraintAttempts) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!stream) {
      throw lastError ?? new Error('Не удалось получить доступ к камере');
    }

    streamRef.current = stream;

    const video = videoRef.current;
    if (!video) {
      stopMediaStream(stream);
      streamRef.current = null;
      throw new Error('Видеоэлемент сканера не готов');
    }

    video.srcObject = stream;
    video.setAttribute('playsinline', 'true');
    video.muted = true;
    await video.play();

    const detector = new BarcodeDetectorCtor({ formats: ['qr_code'] });
    setIsCameraActive(true);
    startBarcodeDetectorLoop(detector);
  };

  const openHtml5Camera = async (): Promise<void> => {
    setUseHtml5Fallback(true);
    // Дождаться, пока React покажет контейнер #qr-scanner-html5-region
    await delay(100);
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    const region = document.getElementById(HTML5_SCANNER_ID);
    if (!region) {
      throw new Error('Контейнер сканера не готов');
    }

    const scanner = new Html5Qrcode(HTML5_SCANNER_ID, {
      verbose: false,
      useBarCodeDetectorIfSupported: true,
    });
    html5ScannerRef.current = scanner;

    const onDecode = (decodedText: string): void => {
      void finishWithEquipmentId(decodedText);
    };

    const configs: Array<string | MediaTrackConstraints> = [];

    if (isAndroid()) {
      configs.push({ facingMode: 'environment' });
      configs.push({ facingMode: 'user' });
    } else {
      try {
        const cameras = await Html5Qrcode.getCameras();
        const rearId = pickRearCameraId(cameras);
        if (rearId) {
          configs.push(rearId);
        }
      } catch (err) {
        console.warn('[QRScanner] getCameras failed:', err);
      }
      configs.push({ facingMode: 'environment' });
      configs.push({ facingMode: 'user' });
    }

    let lastError: unknown = null;
    for (let i = 0; i < configs.length; i += 1) {
      if (!aliveRef.current) {
        return;
      }
      try {
        await scanner.start(
          configs[i],
          {
            fps: 10,
            qrbox: (w, h) => {
              const edge = Math.min(w, h);
              const size = Math.max(160, Math.floor(edge * 0.72));
              return { width: size, height: size };
            },
          },
          onDecode,
          () => {}
        );
        setIsCameraActive(true);
        return;
      } catch (err) {
        lastError = err;
        console.warn('[QRScanner] html5 start failed:', configs[i], err);
        try {
          const state = scanner.getState();
          if (
            state === Html5QrcodeScannerState.SCANNING ||
            state === Html5QrcodeScannerState.PAUSED
          ) {
            await scanner.stop();
          }
        } catch {
          // ignore
        }
        await delay(isAndroid() ? 600 : 200);
      }
    }

    throw lastError ?? new Error('Не удалось запустить камеру');
  };

  const handleEnableCamera = async (): Promise<void> => {
    if (isStarting) {
      return;
    }

    setIsStarting(true);
    setError(null);
    isProcessingRef.current = false;

    // Полный сброс перед новой попыткой (важно после NotReadableError).
    await releaseCamera();
    setUseHtml5Fallback(false);
    await delay(isAndroid() ? 400 : 100);
    aliveRef.current = true;

    try {
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

      // Предпочитаем native path: один getUserMedia без html5-qrcode.
      try {
        await openNativeCamera();
      } catch (nativeErr) {
        const message =
          nativeErr instanceof Error ? nativeErr.message : String(nativeErr);
        if (message !== 'NO_BARCODE_DETECTOR') {
          console.warn('[QRScanner] native camera path failed, fallback html5:', nativeErr);
        }
        await releaseCamera();
        await delay(isAndroid() ? 400 : 100);
        aliveRef.current = true;
        await openHtml5Camera();
      }
    } catch (err) {
      const errorMessage = normalizeScannerError(err);
      setError(errorMessage);
      onScanError?.(errorMessage);
      await releaseCamera();
    } finally {
      setIsStarting(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      void releaseCamera();
      setError(null);
      setIsStarting(false);
      setUseHtml5Fallback(false);
      isProcessingRef.current = false;
      return;
    }

    // Камеру НЕ стартуем автоматически — только UI.
    // Auto-start + React.StrictMode на Android = NotReadableError.
    return () => {
      void releaseCamera();
    };
  }, [isOpen]);

  const handleClose = async (): Promise<void> => {
    await releaseCamera();
    isProcessingRef.current = false;
    onClose?.();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="qr-scanner-overlay" onClick={() => void handleClose()}>
      <div className="qr-scanner-modal" onClick={(e) => e.stopPropagation()}>
        <div className="qr-scanner-header">
          <h2 className="qr-scanner-title">Сканирование QR-кода</h2>
          <button
            className="qr-scanner-close-button"
            onClick={() => void handleClose()}
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
            style={{ display: useHtml5Fallback ? 'none' : 'block' }}
          />
          <div
            id={HTML5_SCANNER_ID}
            className="qr-scanner-container"
            style={{ display: useHtml5Fallback ? 'block' : 'none' }}
          />

          {!isCameraActive && !isStarting && (
            <div className="qr-scanner-start-panel">
              <p className="qr-scanner-start-hint">
                Нажмите кнопку, чтобы открыть камеру и отсканировать QR-код оборудования
              </p>
              <button
                type="button"
                className="qr-scanner-start-button"
                onClick={() => void handleEnableCamera()}
              >
                Включить камеру
              </button>
            </div>
          )}

          {isStarting && (
            <div className="qr-scanner-loading qr-scanner-loading-overlay">
              <div className="qr-scanner-spinner" />
              <p>Запуск камеры...</p>
            </div>
          )}
        </div>

        {error && (
          <div className="qr-scanner-footer-actions">
            <button
              type="button"
              className="qr-scanner-retry-button"
              onClick={() => void handleEnableCamera()}
              disabled={isStarting}
            >
              Попробовать снова
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default QRScanner;
