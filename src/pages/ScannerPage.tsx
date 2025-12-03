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
    console.log('[ScannerPage] handleScanSuccess вызван с:', equipmentIdOrDriveId);
    
    // Если это маркер Google Drive ID, ищем оборудование по Google Drive URL
    if (equipmentIdOrDriveId.startsWith('DRIVE:')) {
      const driveFolderId = equipmentIdOrDriveId.replace('DRIVE:', '');
      console.log('[ScannerPage] Поиск оборудования по Drive ID:', driveFolderId);
      setSearching(true);
      
      try {
        console.log('[ScannerPage] Загрузка всего оборудования...');
        // Загружаем все оборудование и ищем по Google Drive URL
        const allEquipment = await getAllEquipment() as Equipment[];
        console.log('[ScannerPage] Получено оборудования:', allEquipment?.length || 0);
        
        if (!allEquipment) {
          throw new Error('Не удалось загрузить список оборудования');
        }
        
        if (!Array.isArray(allEquipment)) {
          console.error('[ScannerPage] Неверный формат данных:', typeof allEquipment, allEquipment);
          throw new Error('Неверный формат данных от сервера. Ожидается массив.');
        }
        
        console.log('[ScannerPage] Поиск оборудования с Drive ID:', driveFolderId);
        console.log('[ScannerPage] Всего оборудования для проверки:', allEquipment.length);
        
        // Логируем все Google Drive URL для отладки
        allEquipment.forEach((eq, index) => {
          console.log(`[ScannerPage] Оборудование ${index + 1}:`, {
            id: eq.id,
            name: eq.name,
            googleDriveUrl: eq.googleDriveUrl,
            containsId: eq.googleDriveUrl?.includes(driveFolderId)
          });
        });
        
        const equipment = allEquipment.find(
          (eq) => {
            if (!eq || !eq.googleDriveUrl) {
              return false;
            }
            
            const url = eq.googleDriveUrl.toLowerCase();
            const searchId = driveFolderId.toLowerCase();
            
            // Проверяем разные форматы URL
            const matches = url.includes(searchId) || 
                           url.includes(`folders/${searchId}`) ||
                           url.includes(`id=${searchId}`) ||
                           url.endsWith(`/${searchId}`) ||
                           url.includes(`/${searchId}/`);
            
            if (matches) {
              console.log('[ScannerPage] Найдено совпадение:', eq.name, eq.id);
            }
            
            return matches;
          }
        );
        
        if (equipment) {
          console.log('[ScannerPage] Оборудование найдено, переход на страницу:', equipment.id);
          navigate(getEquipmentViewUrl(equipment.id));
        } else {
          console.warn('[ScannerPage] Оборудование не найдено для Drive ID:', driveFolderId);
          alert(`Оборудование с Google Drive URL (ID: ${driveFolderId}) не найдено.\n\nПроверьте консоль браузера для подробностей.`);
          setSearching(false);
        }
      } catch (error: any) {
        console.error('[ScannerPage] Ошибка при поиске оборудования:', error);
        console.error('[ScannerPage] Stack trace:', error?.stack);
        const errorMessage = error?.message || 'Неизвестная ошибка';
        alert(`Ошибка при поиске оборудования: ${errorMessage}\n\nПроверьте консоль браузера для подробностей.`);
        setSearching(false);
      }
    } else {
      // Обычный ID оборудования - переходим напрямую
      console.log('[ScannerPage] Прямой переход по ID:', equipmentIdOrDriveId);
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

