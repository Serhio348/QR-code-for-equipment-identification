/**
 * Компонент сканера QR-кодов
 * Использует библиотеку html5-qrcode для сканирования QR-кодов с камеры
 */

import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, type CameraDevice } from 'html5-qrcode';
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

async function resolveCameraConfig(): Promise<string | MediaTrackConstraints> {
  try {
    const cameras = await Html5Qrcode.getCameras();
    if (cameras.length === 0) {
      throw new Error('Камеры не найдены на устройстве');
    }
    const cameraId = pickRearCameraId(cameras);
    if (cameraId) {
      return cameraId;
    }
  } catch (err) {
    console.warn('[QRScanner] getCameras failed, fallback to facingMode:', err);
  }

  return { facingMode: 'environment' };
}

function cameraConfigKey(cameraConfig: CameraConfig): string {
  if (typeof cameraConfig === 'string') {
    return `id:${cameraConfig}`;
  }
  return `constraints:${JSON.stringify(cameraConfig)}`;
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

    try {
      await scanner.stop();
      await scanner.clear();
    } catch {
      console.log('[QRScanner] Сканер уже остановлен');
    }
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

      await waitForPaint();

      const onDecode = (decodedText: string): void => {
        if (!isProcessingRef.current) {
          handleScanSuccess(decodedText);
        }
      };

      const cameraConfigs: CameraConfig[] = [];

      if (isAndroid()) {
        // На Android после неуспешного старта scanner может застревать в промежуточном состоянии.
        // Поэтому пробуем несколько конфигов последовательно, создавая новый экземпляр на каждую попытку.
        cameraConfigs.push({ facingMode: 'environment' });
        cameraConfigs.push({ facingMode: 'user' });
        cameraConfigs.push(await resolveCameraConfig());
      } else {
        cameraConfigs.push(await resolveCameraConfig());
        cameraConfigs.push({ facingMode: 'user' });
      }

      const uniqueCameraConfigs: CameraConfig[] = [];
      const seenConfigs = new Set<string>();
      for (const cameraConfig of cameraConfigs) {
        const key = cameraConfigKey(cameraConfig);
        if (!seenConfigs.has(key)) {
          uniqueCameraConfigs.push(cameraConfig);
          seenConfigs.add(key);
        }
      }

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
          await stopScanning();
        }
      }

      if (lastStartError) {
        throw lastStartError;
      }
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : 'Ошибка при запуске сканера';
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
