/**
 * Компонент сканера QR-кодов
 * Использует библиотеку html5-qrcode для сканирования QR-кодов с камеры
 */

import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { parseEquipmentId } from '../../../../shared/utils/qrCodeParser';
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

const QRScanner: React.FC<QRScannerProps> = ({
  onScanSuccess,
  onScanError,
  onClose,
  isOpen,
}) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scannerContainerId = 'qr-scanner-container';
  const isProcessingRef = useRef(false);

  // Инициализация и остановка сканера
  useEffect(() => {
    if (!isOpen) {
      // Если сканер закрыт, останавливаем его
      stopScanning();
      return;
    }

    // Если сканер открыт, запускаем его
    if (isOpen && !scannerRef.current) {
      startScanning();
    }

    // Очистка при размонтировании
    return () => {
      stopScanning();
    };
  }, [isOpen]);

  /**
   * Начинает сканирование QR-кодов
   */
  const startScanning = async () => {
    if (scannerRef.current) {
      return; // Уже запущен
    }

    try {
      setIsScanning(true);
      setError(null);
      isProcessingRef.current = false;

      // Проверяем поддержку камеры
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Ваш браузер не поддерживает доступ к камере');
      }

      // Создаем экземпляр сканера
      const scanner = new Html5Qrcode(scannerContainerId);
      scannerRef.current = scanner;

      // Конфигурация сканера
      const config = {
        fps: 10, // Кадров в секунду
        qrbox: { width: 250, height: 250 }, // Размер области сканирования
        aspectRatio: 1.0, // Соотношение сторон
        disableFlip: false, // Разрешить переворот изображения
      };

      // Начинаем сканирование с задней камеры (если доступна)
      try {
        await scanner.start(
          { facingMode: 'environment' }, // Задняя камера
          config,
          (decodedText) => {
            // Успешное сканирование
            if (!isProcessingRef.current) {
              handleScanSuccess(decodedText);
            }
          },
          () => {
            // Игнорируем ошибки сканирования (они нормальны, пока не найден QR-код)
          }
        );
      } catch (err: any) {
        // Если не удалось использовать заднюю камеру, пробуем переднюю
        if (err.message && err.message.includes('environment')) {
          await scanner.start(
            { facingMode: 'user' }, // Передняя камера
            config,
            (decodedText) => {
              if (!isProcessingRef.current) {
                handleScanSuccess(decodedText);
              }
            },
            () => {}
          );
        } else {
          throw err;
        }
      }
    } catch (err: any) {
      const errorMessage = err.message || 'Ошибка при запуске сканера';
      setError(errorMessage);
      setIsScanning(false);
      onScanError?.(errorMessage);
    }
  };

  /**
   * Останавливает сканирование
   */
  const stopScanning = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
      } catch (err) {
        // Игнорируем ошибки остановки
        console.log('[QRScanner] Сканер уже остановлен');
      }
      scannerRef.current = null;
      setIsScanning(false);
    }
  };

  /**
   * Обрабатывает успешное сканирование QR-кода
   */
  const handleScanSuccess = (decodedText: string) => {
    if (isProcessingRef.current) {
      return; // Уже обрабатывается
    }

    console.log('[QRScanner] Отсканированный QR-код:', decodedText);
    
    isProcessingRef.current = true;

    // Парсим ID оборудования из QR-кода
    const equipmentId = parseEquipmentId(decodedText);
    
    if (!equipmentId) {
      const errorMsg = `QR-код не содержит информацию об оборудовании.\n\nОтсканировано: ${decodedText}`;
      setError(errorMsg);
      onScanError?.(errorMsg);
      
      // Сбрасываем флаг через 2 секунды, чтобы можно было попробовать снова
      setTimeout(() => {
        isProcessingRef.current = false;
      }, 2000);
      return;
    }

    console.log('[QRScanner] Распознан ID оборудования:', equipmentId);

    // Останавливаем сканирование
    stopScanning();

    // Вызываем callback с ID оборудования
    onScanSuccess(equipmentId);
  };

  /**
   * Обрабатывает закрытие сканера
   */
  const handleClose = async () => {
    await stopScanning();
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
            <button onClick={startScanning} className="qr-scanner-retry-button">
              Попробовать снова
            </button>
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
    </div>
  );
};

export default QRScanner;

