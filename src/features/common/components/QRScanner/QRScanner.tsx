/**
 * Компонент сканера QR-кодов
 * Использует библиотеку html5-qrcode для сканирования QR-кодов с камеры
 *
 * Важно: пути камеры разделены по платформам.
 * - Android/desktop: facingMode (как до iOS-фикса — рабочий путь)
 * - iOS: waitForPaint + getCameras()/deviceId (facingMode на Safari ненадёжен)
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

const SCANNER_CONTAINER_ID = 'qr-scanner-container';

/** Конфиг Android/desktop — как в рабочей версии до 6805a1c. */
const ANDROID_SCANNER_CONFIG = {
  fps: 10,
  qrbox: { width: 250, height: 250 },
  aspectRatio: 1.0,
  disableFlip: false,
} as const;

/** Конфиг iOS — без aspectRatio (на Safari часто ломает старт). */
const IOS_SCANNER_CONFIG = {
  fps: 10,
  qrbox: { width: 250, height: 250 },
  disableFlip: false,
} as const;

function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
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

/** Только для iOS: deviceId через enumerate. */
async function resolveIosCameraConfig(): Promise<string | MediaTrackConstraints> {
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
    console.warn('[QRScanner] iOS getCameras failed, fallback to facingMode:', err);
  }

  return { facingMode: 'environment' };
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

  useEffect(() => {
    if (!isOpen) {
      void stopScanning();
      setError(null);
      setIsInitializing(false);
      isProcessingRef.current = false;
      return;
    }

    if (!scannerRef.current) {
      void startScanning();
    }

    return () => {
      void stopScanning();
    };
  }, [isOpen]);

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

      // Контейнер должен быть в DOM и отрисован до new Html5Qrcode (критично для iOS).
      await waitForPaint();

      const scanner = new Html5Qrcode(SCANNER_CONTAINER_ID);
      scannerRef.current = scanner;

      const onDecode = (decodedText: string): void => {
        if (!isProcessingRef.current) {
          handleScanSuccess(decodedText);
        }
      };

      if (isIOS()) {
        // iOS Safari: facingMode часто не работает — берём deviceId.
        const cameraConfig = await resolveIosCameraConfig();
        try {
          await scanner.start(cameraConfig, IOS_SCANNER_CONFIG, onDecode, () => {});
        } catch (startErr: unknown) {
          const message = startErr instanceof Error ? startErr.message : String(startErr);
          if (/environment|facing|camera|device/i.test(message)) {
            await scanner.start(
              { facingMode: 'user' },
              IOS_SCANNER_CONFIG,
              onDecode,
              () => {}
            );
          } else {
            throw startErr;
          }
        }
      } else {
        // Android/desktop: рабочий путь до iOS-фикса — только facingMode, без getCameras().
        try {
          await scanner.start(
            { facingMode: 'environment' },
            ANDROID_SCANNER_CONFIG,
            onDecode,
            () => {}
          );
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          if (message.includes('environment')) {
            await scanner.start(
              { facingMode: 'user' },
              ANDROID_SCANNER_CONFIG,
              onDecode,
              () => {}
            );
          } else {
            throw err;
          }
        }
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

  const handleClose = async (): Promise<void> => {
    await stopScanning();
    isProcessingRef.current = false;
    onClose?.();
  };

  const handleRetry = (): void => {
    void (async () => {
      await stopScanning();
      isProcessingRef.current = false;
      void startScanning();
    })();
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
            <button onClick={handleRetry} className="qr-scanner-retry-button" type="button">
              Попробовать снова
            </button>
          </div>
        )}

        {/* Контейнер всегда в DOM — Safari не стартует камеру в display:none */}
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
