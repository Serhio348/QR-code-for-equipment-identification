/**
 * Компонент сканера QR-кодов
 * Использует библиотеку html5-qrcode для сканирования QR-кодов с камеры
 *
 * Важно:
 * - Android/desktop: facingMode + aspectRatio (рабочий путь)
 * - iOS: только facingMode после primeCameraPermission() в клике открытия
 *   (getCameras()/deviceId на Safari часто ломает повторный start)
 */

import React, { useEffect, useId, useRef, useState } from 'react';
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

const ANDROID_SCANNER_CONFIG = {
  fps: 10,
  qrbox: { width: 250, height: 250 },
  aspectRatio: 1.0,
  disableFlip: false,
} as const;

const IOS_SCANNER_CONFIG = {
  fps: 10,
  qrbox: { width: 250, height: 250 },
  disableFlip: false,
} as const;

/** StrictMode: отменить первый mount до getUserMedia. */
const START_ABORT_MS = 120;

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

function normalizeCameraError(err: unknown): string {
  const name =
    err && typeof err === 'object' && 'name' in err
      ? String((err as { name: string }).name)
      : '';
  const message = err instanceof Error ? err.message : String(err);
  const blob = `${name} ${message}`;

  if (/notallowed|permission|denied|разреш/i.test(blob)) {
    return isIOS()
      ? 'Нет доступа к камере. Настройки → [это приложение] → Камера → Разрешить, затем откройте сканер снова.'
      : 'Нет доступа к камере. Разрешите камеру для этого сайта и откройте сканер снова.';
  }
  if (/notfound|devicesnotfound|камеры не найден/i.test(blob)) {
    return 'Камера не найдена на устройстве.';
  }
  if (/notreadable|could not start video source|track start error|abort/i.test(blob)) {
    return 'Не удалось открыть камеру. Закройте другие приложения с камерой и попробуйте снова.';
  }
  if (/secure|https|insecure context/i.test(blob)) {
    return 'Сканер камеры работает только в HTTPS-режиме.';
  }

  return message || 'Ошибка при запуске сканера';
}

const QRScanner: React.FC<QRScannerProps> = ({
  onScanSuccess,
  onScanError,
  onClose,
  isOpen,
}) => {
  const reactId = useId().replace(/:/g, '');
  const containerId = `qr-scanner-container-${reactId}`;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const startGenerationRef = useRef(0);
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

  const startScanning = async (generation: number): Promise<void> => {
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
            ? 'Разрешите доступ к камере: Настройки → [это приложение] → Камера'
            : 'Ваш браузер не поддерживает доступ к камере'
        );
      }

      await waitForPaint();

      if (generation !== startGenerationRef.current) {
        return;
      }

      const container = document.getElementById(containerId);
      if (!container) {
        throw new Error('Контейнер сканера не найден');
      }

      // Дать контейнеру ненулевой размер на iOS (после открытия модалки).
      if (container.clientWidth === 0 || container.clientHeight === 0) {
        await delay(50);
      }

      if (generation !== startGenerationRef.current) {
        return;
      }

      const scanner = new Html5Qrcode(containerId);
      scannerRef.current = scanner;

      const onDecode = (decodedText: string): void => {
        if (!isProcessingRef.current) {
          handleScanSuccess(decodedText);
        }
      };

      const config = isIOS() ? IOS_SCANNER_CONFIG : ANDROID_SCANNER_CONFIG;

      try {
        await scanner.start(
          { facingMode: 'environment' },
          config,
          onDecode,
          () => {}
        );
      } catch (err: unknown) {
        if (generation !== startGenerationRef.current) {
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        if (/environment|facing|camera|device|notreadable|readable/i.test(message)) {
          await delay(isIOS() ? 300 : 0);
          if (generation !== startGenerationRef.current) {
            return;
          }
          await scanner.start({ facingMode: 'user' }, config, onDecode, () => {});
        } else {
          throw err;
        }
      }
    } catch (err: unknown) {
      if (generation !== startGenerationRef.current) {
        return;
      }
      const errorMessage = normalizeCameraError(err);
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

    const generation = ++startGenerationRef.current;
    const timer = window.setTimeout(() => {
      void startScanning(generation);
    }, START_ABORT_MS);

    return () => {
      startGenerationRef.current += 1;
      window.clearTimeout(timer);
      void stopScanning();
    };
  }, [isOpen, containerId]);

  const handleClose = async (): Promise<void> => {
    startGenerationRef.current += 1;
    await stopScanning();
    isProcessingRef.current = false;
    onClose?.();
  };

  const handleRetry = (): void => {
    void (async () => {
      startGenerationRef.current += 1;
      await stopScanning();
      isProcessingRef.current = false;
      const generation = ++startGenerationRef.current;
      void startScanning(generation);
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

        <div id={containerId} className="qr-scanner-container" />

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
