/**
 * Компонент сканера QR-кодов
 * Использует библиотеку html5-qrcode для сканирования QR-кодов с камеры
 *
 * Важно (html5-qrcode docs / mobile):
 * - НЕ делать отдельный getUserMedia warmup перед start() —
 *   двойное открытие камеры на Android даёт NotReadableError.
 * - Android: сразу start({ facingMode: "environment" }).
 * - iOS: Html5Qrcode.getCameras() → start(deviceId).
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
  /** Callback при успешном сканировании QR-кода с ID оборудования */
  onScanSuccess: (equipmentId: string) => void;
  /** Callback при ошибке сканирования */
  onScanError?: (error: string) => void;
  /** Callback при закрытии сканера */
  onClose?: () => void;
  /** Открыт ли сканер */
  isOpen: boolean;
}

const SCANNER_CONTAINER_ID = 'qr-scanner-container';
type CameraConfig = string | MediaTrackConstraints;

const SCANNER_CONFIG = {
  fps: 10,
  disableFlip: false,
  /** Адаптивный qrbox — фиксированные 250px ломают узкие экраны. */
  qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
    const edge = Math.min(viewfinderWidth, viewfinderHeight);
    const size = Math.max(160, Math.floor(edge * 0.72));
    return { width: size, height: size };
  },
} as const;

/** Дождаться отрисовки контейнера (критично для iOS Safari). */
function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForContainerReady(): Promise<void> {
  await waitForPaint();

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const el = document.getElementById(SCANNER_CONTAINER_ID);
    const rect = el?.getBoundingClientRect();
    if (rect && rect.width >= 160 && rect.height >= 160) {
      return;
    }
    await delay(50);
  }
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

function resetScannerContainer(): void {
  const el = document.getElementById(SCANNER_CONTAINER_ID);
  if (el) {
    el.innerHTML = '';
  }
}

async function stopAndClearScanner(scanner: Html5Qrcode): Promise<void> {
  try {
    const state = scanner.getState();
    if (
      state === Html5QrcodeScannerState.SCANNING ||
      state === Html5QrcodeScannerState.PAUSED
    ) {
      await scanner.stop();
    }
  } catch {
    // stop() ожидаемо падает, если сканер не успел перейти в running state
  }

  try {
    scanner.clear();
  } catch {
    // clear() может падать, если DOM уже размонтирован — игнорируем
  }

  resetScannerContainer();
}

function normalizeScannerError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);

  if (/notallowed|permission|denied|разреш/i.test(message)) {
    return 'Нет доступа к камере. Разрешите камеру в настройках браузера для этого сайта.';
  }
  if (/notfound|devicesnotfound|камера.*не найд/i.test(message)) {
    return 'Камера не найдена на устройстве';
  }
  if (/notreadable|could not start video source|track start error|abort/i.test(message)) {
    return 'Не удалось запустить камеру. Закройте другие вкладки/приложения с камерой, обновите страницу и попробуйте снова.';
  }
  if (/secure|https|insecure context/i.test(message)) {
    return 'Сканер камеры работает только в HTTPS-режиме';
  }

  return message || 'Ошибка при запуске сканера';
}

function dedupeCameraConfigs(cameraConfigs: CameraConfig[]): CameraConfig[] {
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

/**
 * Кандидаты камеры без предварительного getUserMedia warmup.
 * Warmup → stop → html5-qrcode.start() на Android даёт NotReadableError.
 */
async function getCandidateCameraConfigs(): Promise<CameraConfig[]> {
  if (isAndroid()) {
    // Docs/wiki: сразу facingMode. Enumerate — только fallback.
    const cameraConfigs: CameraConfig[] = [
      { facingMode: 'environment' },
      { facingMode: 'user' },
    ];

    try {
      const cameras = await Html5Qrcode.getCameras();
      const rearCameraId = pickRearCameraId(cameras);
      if (rearCameraId) {
        cameraConfigs.push(rearCameraId);
      }
    } catch (err) {
      console.warn('[QRScanner] Android getCameras fallback skipped:', err);
    }

    return dedupeCameraConfigs(cameraConfigs);
  }

  // iOS / desktop: deviceId надёжнее facingMode (особенно Safari).
  const cameraConfigs: CameraConfig[] = [];
  try {
    const cameras = await Html5Qrcode.getCameras();
    if (cameras.length === 0) {
      throw new Error('Камеры не найдены на устройстве');
    }
    const rearCameraId = pickRearCameraId(cameras);
    if (rearCameraId) {
      cameraConfigs.push(rearCameraId);
    }
    for (const camera of cameras) {
      cameraConfigs.push(camera.id);
    }
  } catch (err) {
    console.warn('[QRScanner] getCameras failed, fallback to facingMode:', err);
  }

  cameraConfigs.push({ facingMode: 'environment' });
  cameraConfigs.push({ facingMode: 'user' });
  return dedupeCameraConfigs(cameraConfigs);
}

function createScanner(): Html5Qrcode {
  return new Html5Qrcode(SCANNER_CONTAINER_ID, {
    verbose: false,
    useBarCodeDetectorIfSupported: true,
  });
}

const QRScanner: React.FC<QRScannerProps> = ({
  onScanSuccess,
  onScanError,
  onClose,
  isOpen,
}) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const startGenerationRef = useRef(0);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isProcessingRef = useRef(false);

  const stopScanning = async (): Promise<void> => {
    if (!scannerRef.current) {
      resetScannerContainer();
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

    const generation = ++startGenerationRef.current;

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

      await waitForContainerReady();
      if (generation !== startGenerationRef.current) {
        return;
      }

      const onDecode = (decodedText: string): void => {
        if (!isProcessingRef.current) {
          handleScanSuccess(decodedText);
        }
      };

      const uniqueCameraConfigs = await getCandidateCameraConfigs();
      if (generation !== startGenerationRef.current) {
        return;
      }

      let lastStartError: unknown = null;
      for (let index = 0; index < uniqueCameraConfigs.length; index += 1) {
        if (generation !== startGenerationRef.current) {
          return;
        }

        const cameraConfig = uniqueCameraConfigs[index];
        resetScannerContainer();
        await waitForPaint();

        const scanner = createScanner();
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
          // После NotReadableError камере нужно время освободиться.
          if (index < uniqueCameraConfigs.length - 1) {
            await delay(isAndroid() ? 450 : 150);
          }
        }
      }

      if (generation !== startGenerationRef.current) {
        return;
      }

      if (lastStartError) {
        throw lastStartError;
      }
    } catch (err: unknown) {
      if (generation !== startGenerationRef.current) {
        return;
      }
      const errorMessage = normalizeScannerError(err);
      setError(errorMessage);
      onScanError?.(errorMessage);
      await stopScanning();
    } finally {
      if (generation === startGenerationRef.current) {
        setIsInitializing(false);
      }
    }
  };

  useEffect(() => {
    if (!isOpen) {
      startGenerationRef.current += 1;
      void stopScanning();
      setError(null);
      setIsInitializing(false);
      isProcessingRef.current = false;
      return;
    }

    void startScanning();

    return () => {
      startGenerationRef.current += 1;
      void stopScanning();
    };
  }, [isOpen]);

  const handleClose = async (): Promise<void> => {
    startGenerationRef.current += 1;
    await stopScanning();
    isProcessingRef.current = false;
    onClose?.();
  };

  const handleRetry = async (): Promise<void> => {
    startGenerationRef.current += 1;
    await stopScanning();
    // Дать камере полностью освободиться после ошибки NotReadable.
    await delay(isAndroid() ? 500 : 200);
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
