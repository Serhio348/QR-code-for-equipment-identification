/**
 * Компонент сканера QR-кодов
 * Использует библиотеку html5-qrcode для сканирования QR-кодов с камеры
 */

import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, type CameraDevice } from 'html5-qrcode';
import { parseEquipmentId } from '../../../../shared/utils/qrCodeParser';
import { isIOS } from '@/shared/utils/deviceDetection';
import './QRScanner.css';

interface QRScannerProps {
  /** Callback при успешном сканировании QR-кода с ID оборудования */
  onScanSuccess: (equipmentId: string) => void;
  /** Callback при ошибке сканирования */
  onScanError?: (error: string) => void;
  /** Callback при закрытии сканера */
  onClose?: () => void;
  /** Открыт ли сканер */
  isOpen: boolean;
}

const SCANNER_CONFIG = {
  fps: 10,
  qrbox: { width: 250, height: 250 },
  disableFlip: false,
} as const;

const SCANNER_CONTAINER_ID = 'qr-scanner-container';
type CameraConfig = string | MediaTrackConstraints;

/** Дождаться отрисовки контейнера (критично для iOS Safari). */
function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

/** Выбрать заднюю камеру — на iOS facingMode ненадёжен. */
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

function cameraConfigKey(cameraConfig: CameraConfig): string {
  if (typeof cameraConfig === 'string') {
    return `id:${cameraConfig}`;
  }
  return `constraints:${JSON.stringify(cameraConfig)}`;
}

async function stopAndClearScanner(scanner: Html5Qrcode): Promise<void> {
  try {
    await scanner.stop();
  } catch {
    // stop() ожидаемо падает, если сканер не успел перейти в running state
  }

  try {
    await scanner.clear();
  } catch {
    // clear() может падать, если DOM уже размонтирован — игнорируем
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function stopMediaStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

function normalizeScannerError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);

  if (/notallowed|permission|denied|разреш/i.test(message)) {
    return 'Нет доступа к камере. Разрешите камеру в настройках браузера.';
  }
  if (/notfound|devicesnotfound|камера.*не найд/i.test(message)) {
    return 'Камера не найдена на устройстве';
  }
  if (/notreadable|could not start video source|track start error/i.test(message)) {
    return 'Не удалось запустить камеру. Закройте другие приложения с доступом к камере и попробуйте снова.';
  }
  if (/secure|https|insecure context/i.test(message)) {
    return 'Сканер камеры работает только в HTTPS-режиме';
  }

  return message || 'Ошибка при запуске сканера';
}

async function ensureCameraPermission(): Promise<void> {
  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: true,
    });
  } finally {
    if (stream) {
      stopMediaStream(stream);
      // На некоторых Android-устройствах нужно немного времени,
      // чтобы освободить камеру перед следующим открытием.
      await delay(120);
    }
  }
}

async function getCandidateCameraConfigs(): Promise<CameraConfig[]> {
  const cameraConfigs: CameraConfig[] = [];

  try {
    const cameras = await Html5Qrcode.getCameras();
    if (cameras.length > 0) {
      const rearCameraId = pickRearCameraId(cameras);
      if (rearCameraId) {
        cameraConfigs.push(rearCameraId);
      }
      for (const camera of cameras) {
        cameraConfigs.push(camera.id);
      }
    }
  } catch (err) {
    console.warn('[QRScanner] getCameras failed, will use facingMode fallback:', err);
  }

  cameraConfigs.push({ facingMode: 'environment' });
  cameraConfigs.push({ facingMode: 'user' });

  const uniqueCameraConfigs: CameraConfig[] = [];
  const seenConfigs = new Set<string>();
  for (const cameraConfig of cameraConfigs) {
    const key = cameraConfigKey(cameraConfig);
    if (!seenConfigs.has(key)) {
      uniqueCameraConfigs.push(cameraConfig);
      seenConfigs.add(key);
    }
  }

  return uniqueCameraConfigs;
}

const QRScanner: React.FC<QRScannerProps> = ({
  onScanSuccess,
  onScanError,
  onClose,
  isOpen,
}) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isProcessingRef = useRef(false);

  const stopScanning = async (): Promise<void> => {
    if (!scannerRef.current) {
      return;
    }

    const scanner = scannerRef.current;
    scannerRef.current = null;

    await stopAndClearScanner(scanner);
  };

  const handleScanSuccess = (decodedText: string): void => {
    if (isProcessingRef.current) {
      return;
    }

    console.log('[QRScanner] Отсканированный QR-код:', decodedText);
    isProcessingRef.current = true;

    const equipmentId = parseEquipmentId(decodedText);

    if (!equipmentId) {
      const errorMsg = `QR-код не содержит информацию об оборудовании.\n\nОтсканировано: ${decodedText}`;
      setError(errorMsg);
      onScanError?.(errorMsg);
      setTimeout(() => {
        isProcessingRef.current = false;
      }, 2000);
      return;
    }

    console.log('[QRScanner] Распознан ID оборудования:', equipmentId);
    void stopScanning();
    onScanSuccess(equipmentId);
  };

  const startScanning = async (): Promise<void> => {
    if (scannerRef.current) {
      return;
    }

    setIsInitializing(true);
    setError(null);
    isProcessingRef.current = false;

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

      await ensureCameraPermission();
      await waitForPaint();

      const onDecode = (decodedText: string): void => {
        if (!isProcessingRef.current) {
          handleScanSuccess(decodedText);
        }
      };

      const uniqueCameraConfigs = await getCandidateCameraConfigs();

      let lastStartError: unknown = null;
      for (const cameraConfig of uniqueCameraConfigs) {
        const scanner = new Html5Qrcode(SCANNER_CONTAINER_ID);
        scannerRef.current = scanner;
        try {
          await scanner.start(cameraConfig, SCANNER_CONFIG, onDecode, () => {});
          lastStartError = null;
          break;
        } catch (startErr: unknown) {
          lastStartError = startErr;
          console.warn('[QRScanner] start failed for config:', cameraConfig, startErr);
          await stopAndClearScanner(scanner);
          if (scannerRef.current === scanner) {
            scannerRef.current = null;
          }
        }
      }

      if (lastStartError) {
        throw lastStartError;
      }
    } catch (err: unknown) {
      const errorMessage = normalizeScannerError(err);
      setError(errorMessage);
      onScanError?.(errorMessage);
      await stopScanning();
    } finally {
      setIsInitializing(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      void stopScanning();
      setError(null);
      setIsInitializing(false);
      isProcessingRef.current = false;
      return;
    }

    void startScanning();

    return () => {
      void stopScanning();
    };
  }, [isOpen]);

  const handleClose = async (): Promise<void> => {
    await stopScanning();
    isProcessingRef.current = false;
    onClose?.();
  };

  const handleRetry = async (): Promise<void> => {
    await stopScanning();
    isProcessingRef.current = false;
    void startScanning();
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
            <button onClick={() => void handleRetry()} className="qr-scanner-retry-button" type="button">
              Попробовать снова
            </button>
          </div>
        )}

        <div id={SCANNER_CONTAINER_ID} className="qr-scanner-container" />

        {isInitializing && !error && (
          <div className="qr-scanner-loading qr-scanner-loading-overlay">
            <div className="qr-scanner-spinner" />
            <p>Инициализация камеры...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default QRScanner;
