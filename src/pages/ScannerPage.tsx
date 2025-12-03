/**
 * Страница сканера QR-кодов
 * Отображает сканер QR-кодов и обрабатывает переход к странице оборудования
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import QRScanner from '../components/QRScanner/QRScanner';
import { ROUTES, getEquipmentViewUrl } from '../utils/routes';
import LoadingSpinner from '../components/LoadingSpinner';
import { getAllEquipment } from '../services/equipmentApi';
import { Equipment } from '../types/equipment';
import './ScannerPage.css';

const ScannerPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, loading } = useAuth();
  const [searching, setSearching] = useState(false);

  // Показываем загрузку во время проверки авторизации
  if (loading) {
    return <LoadingSpinner text="Загрузка..." />;
  }

  // Если не авторизован, перенаправляем на страницу входа
  if (!isAuthenticated) {
    navigate(ROUTES.LOGIN);
    return null;
  }

  /**
   * Обрабатывает успешное сканирование QR-кода
   */
  const handleScanSuccess = async (equipmentIdOrDriveId: string) => {
    // Если это маркер Google Drive ID, ищем оборудование по Google Drive URL
    if (equipmentIdOrDriveId.startsWith('DRIVE:')) {
      const driveFolderId = equipmentIdOrDriveId.replace('DRIVE:', '');
      setSearching(true);
      
      try {
        // Загружаем все оборудование и ищем по Google Drive URL
        const allEquipment = await getAllEquipment() as Equipment[];
        
        if (!Array.isArray(allEquipment)) {
          throw new Error('Неверный формат данных от сервера');
        }
        
        const equipment = allEquipment.find(
          (eq) => {
            if (!eq || !eq.googleDriveUrl) return false;
            // Проверяем, содержит ли URL ID папки
            return eq.googleDriveUrl.includes(driveFolderId) || 
                   eq.googleDriveUrl.includes(`folders/${driveFolderId}`) ||
                   eq.googleDriveUrl.includes(`id=${driveFolderId}`);
          }
        );
        
        if (equipment) {
          navigate(getEquipmentViewUrl(equipment.id));
        } else {
          alert(`Оборудование с Google Drive URL (ID: ${driveFolderId}) не найдено. Проверьте, что QR-код содержит правильную ссылку.`);
          setSearching(false);
        }
      } catch (error: any) {
        console.error('Ошибка при поиске оборудования:', error);
        const errorMessage = error?.message || 'Неизвестная ошибка';
        alert(`Ошибка при поиске оборудования: ${errorMessage}. Попробуйте отсканировать QR-код еще раз.`);
        setSearching(false);
      }
    } else {
      // Обычный ID оборудования - переходим напрямую
      navigate(getEquipmentViewUrl(equipmentIdOrDriveId));
    }
  };

  /**
   * Обрабатывает ошибку сканирования
   */
  const handleScanError = (error: string) => {
    console.error('Ошибка сканирования QR-кода:', error);
    // Можно показать уведомление пользователю
  };

  /**
   * Обрабатывает закрытие сканера
   */
  const handleClose = () => {
    // Возвращаемся на главную страницу
    navigate(ROUTES.HOME);
  };

  return (
    <div className="scanner-page">
      {searching && <LoadingSpinner text="Поиск оборудования..." />}
      <div className="scanner-page-container">
        <QRScanner
          onScanSuccess={handleScanSuccess}
          onScanError={handleScanError}
          onClose={handleClose}
          autoCloseOnSuccess={true}
        />
      </div>
    </div>
  );
};

export default ScannerPage;

