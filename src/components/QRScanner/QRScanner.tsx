/**
 * Компонент сканера QR-кодов
 * Использует библиотеку html5-qrcode для сканирования QR-кодов с камеры
 */

import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { parseEquipmentId } from '../../utils/qrCodeParser';
import { requestCameraPermission, isCameraSupported, CameraPermissionStatus } from '../../utils/cameraPermissions';
import './QRScanner.css';

interface QRScannerProps {
  /** Callback при успешном сканировании QR-кода с ID оборудования */
  onScanSuccess: (equipmentId: string) => void;
  /** Callback при ошибке сканирования */
  onScanError?: (error: string) => void;
  /** Callback при закрытии сканера */
  onClose?: () => void;
  /** Автоматически закрывать сканер после успешного сканирования */
  autoCloseOnSuccess?: boolean;
}

const QRScanner: React.FC<QRScannerProps> = ({
  onScanSuccess,
  onScanError,
  onClose,
  autoCloseOnSuccess = true,
}) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<CameraPermissionStatus | null>(null);
  const scannerContainerId = 'qr-scanner-container';

  // Инициализация сканера
  useEffect(() => {
    if (!isCameraSupported()) {
      setError('Ваш браузер не поддерживает доступ к камере.');
      return;
    }

    const initScanner = async () => {
      try {
        // Проверяем разрешения
        const permission = await requestCameraPermission();
        setPermissionStatus(permission);

        if (permission.denied) {
          setError(permission.error || 'Доступ к камере запрещен.');
          return;
        }

        // Создаем экземпляр сканера
        const scanner = new Html5Qrcode(scannerContainerId);
        scannerRef.current = scanner;

        // Начинаем сканирование
        await startScanning(scanner);
      } catch (err: any) {
        const errorMessage = err.message || 'Ошибка при инициализации сканера';
        setError(errorMessage);
        onScanError?.(errorMessage);
      }
    };

    initScanner();

    // Очистка при размонтировании
    return () => {
      stopScanning();
    };
  }, []);

  /**
   * Начинает сканирование QR-кодов
   */
  const startScanning = async (scanner: Html5Qrcode) => {
    try {
      setIsScanning(true);
      setError(null);

      // Конфигурация сканера
      const config = {
        fps: 10, // Кадров в секунду
        qrbox: { width: 250, height: 250 }, // Размер области сканирования
        aspectRatio: 1.0, // Соотношение сторон
        disableFlip: false, // Разрешить переворот изображения
      };

      // Начинаем сканирование с задней камеры (если доступна)
      await scanner.start(
        { facingMode: 'environment' }, // Задняя камера
        config,
        (decodedText) => {
          // Успешное сканирование
          handleScanSuccess(decodedText);
        },
        () => {
          // Игнорируем ошибки сканирования (они нормальны, пока не найден QR-код)
        }
      );
    } catch (err: any) {
      // Если не удалось использовать заднюю камеру, пробуем переднюю
      if (err.message && err.message.includes('environment')) {
        try {
          await scanner.start(
            { facingMode: 'user' }, // Передняя камера
            {
              fps: 10,
              qrbox: { width: 250, height: 250 },
              aspectRatio: 1.0,
              disableFlip: false,
            },
            (decodedText) => {
              handleScanSuccess(decodedText);
            },
            () => {}
          );
        } catch (fallbackErr: any) {
          const errorMessage = fallbackErr.message || 'Не удалось запустить камеру';
          setError(errorMessage);
          setIsScanning(false);
          onScanError?.(errorMessage);
        }
      } else {
        const errorMessage = err.message || 'Ошибка при запуске сканера';
        setError(errorMessage);
        setIsScanning(false);
        onScanError?.(errorMessage);
      }
    }
  };

  /**
   * Останавливает сканирование
   */
  const stopScanning = async () => {
    if (scannerRef.current && isScanning) {
      try {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
      } catch (err) {
        console.error('Ошибка при остановке сканера:', err);
      }
      setIsScanning(false);
    }
  };

  /**
   * Обрабатывает успешное сканирование QR-кода
   */
  const handleScanSuccess = (decodedText: string) => {
    // Парсим ID оборудования из QR-кода
    const equipmentId = parseEquipmentId(decodedText);

    if (!equipmentId) {
      const errorMsg = 'QR-код не содержит информацию об оборудовании';
      setError(errorMsg);
      onScanError?.(errorMsg);
      return;
    }

    // Останавливаем сканирование
    stopScanning();

    // Вызываем callback с ID оборудования
    onScanSuccess(equipmentId);

    // Автоматически закрываем сканер, если нужно
    if (autoCloseOnSuccess) {
      setTimeout(() => {
        onClose?.();
      }, 500);
    }
  };

  /**
   * Обрабатывает закрытие сканера
   */
  const handleClose = async () => {
    await stopScanning();
    onClose?.();
  };

  return (
    <div className="qr-scanner">
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
          {permissionStatus?.denied && (
            <p className="qr-scanner-error-hint">
              Разрешите доступ к камере в настройках браузера и обновите страницу.
            </p>
          )}
        </div>
      )}

      {!error && permissionStatus?.prompt && (
        <div className="qr-scanner-permission-prompt">
          <p>Разрешите доступ к камере для сканирования QR-кода.</p>
        </div>
      )}

      <div 
        id={scannerContainerId} 
        className="qr-scanner-container"
        style={{ 
          display: isScanning && !error ? 'block' : 'none' 
        }}
      />

      {!isScanning && !error && (
        <div className="qr-scanner-loading">
          <div className="qr-scanner-spinner"></div>
          <p>Инициализация камеры...</p>
        </div>
      )}
    </div>
  );
};

export default QRScanner;

