/**
 * Страница сканера QR-кодов
 * Отображает сканер QR-кодов и обрабатывает переход к странице оборудования
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import QRScanner from '../components/QRScanner/QRScanner';
import { ROUTES, getEquipmentViewUrl } from '../utils/routes';
import LoadingSpinner from '../components/LoadingSpinner';
import './ScannerPage.css';

const ScannerPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, loading } = useAuth();

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
  const handleScanSuccess = (equipmentId: string) => {
    // Переходим на страницу оборудования
    navigate(getEquipmentViewUrl(equipmentId));
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

