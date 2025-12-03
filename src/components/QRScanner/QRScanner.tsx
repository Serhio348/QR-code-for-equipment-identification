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
  const isProcessingRef = useRef(false); // Флаг для предотвращения повторных вызовов
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
      // Сбрасываем флаг при размонтировании
      isProcessingRef.current = false;
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
    // Защита от повторных вызовов
    if (isProcessingRef.current) {
      console.log('[QRScanner] Игнорируем повторный вызов handleScanSuccess');
      return;
    }
    
    console.log('[QRScanner] Отсканированный QR-код:', decodedText);
    
    // Устанавливаем флаг обработки
    isProcessingRef.current = true;
    
    // Парсим ID оборудования из QR-кода
    const equipmentIdOrDriveId = parseEquipmentId(decodedText);
    console.log('[QRScanner] Результат парсинга:', equipmentIdOrDriveId);

    if (!equipmentIdOrDriveId) {
      // Пробуем извлечь URL и проверить, может быть это прямой URL приложения
      const url = decodedText.trim();
      console.log('[QRScanner] Попытка извлечь ID из URL:', url);
      
      const equipmentMatch = url.match(/\/equipment\/([^/?\s]+)/i);
      
      if (equipmentMatch && equipmentMatch[1]) {
        const id = equipmentMatch[1];
        console.log('[QRScanner] Найден ID оборудования из URL:', id);
        stopScanning();
        onScanSuccess(id);
        if (autoCloseOnSuccess) {
          setTimeout(() => {
            // Сбрасываем флаг перед закрытием
            isProcessingRef.current = false;
            onClose?.();
          }, 500);
        } else {
          // Сбрасываем флаг, если не закрываем автоматически
          setTimeout(() => {
            isProcessingRef.current = false;
          }, 1000);
        }
        return;
      }
      
      // Пробуем найти Google Drive URL напрямую
      const driveMatch = url.match(/drive\.google\.com\/drive\/folders\/([^/?&\s]+)/i) ||
                         url.match(/[?&]id=([^&\s]+)/i);
      
      if (driveMatch && driveMatch[1]) {
        const driveId = driveMatch[1];
        console.log('[QRScanner] Найден Google Drive ID:', driveId);
        stopScanning();
        onScanSuccess(`DRIVE:${driveId}`);
        if (autoCloseOnSuccess) {
          setTimeout(() => {
            // Сбрасываем флаг перед закрытием
            isProcessingRef.current = false;
            onClose?.();
          }, 500);
        } else {
          // Сбрасываем флаг, если не закрываем автоматически
          setTimeout(() => {
            isProcessingRef.current = false;
          }, 1000);
        }
        return;
      }
      
      const errorMsg = `QR-код не содержит информацию об оборудовании.\n\nОтсканировано: ${decodedText}\n\nОжидается URL вида: /equipment/{id} или Google Drive URL`;
      console.error('[QRScanner] Ошибка парсинга QR-кода. Исходный текст:', decodedText);
      setError(errorMsg);
      onScanError?.(errorMsg);
      
      // Сбрасываем флаг при ошибке
      setTimeout(() => {
        isProcessingRef.current = false;
      }, 1000);
      return;
    }

    console.log('[QRScanner] Распознан ID оборудования или Drive ID:', equipmentIdOrDriveId);

    // Останавливаем сканирование
    stopScanning();

    // Вызываем callback с ID оборудования или Drive ID
    onScanSuccess(equipmentIdOrDriveId);

    // Автоматически закрываем сканер, если нужно
    if (autoCloseOnSuccess) {
      setTimeout(() => {
        // Сбрасываем флаг перед закрытием
        isProcessingRef.current = false;
        onClose?.();
      }, 500);
    } else {
      // Сбрасываем флаг, если не закрываем автоматически
      setTimeout(() => {
        isProcessingRef.current = false;
      }, 1000);
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

