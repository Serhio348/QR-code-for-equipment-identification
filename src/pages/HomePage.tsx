/**
 * Главная страница - список всего оборудования
 * Доступна только для администраторов
 * Для обычных пользователей на мобильных устройствах показывается PWA меню
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useDeviceDetection } from '../hooks/useDeviceDetection';
import EquipmentList from '../components/EquipmentList';
import PWAMenu from '../components/PWAMenu/PWAMenu';
import { Equipment } from '../types/equipment';
import { ROUTES, getEquipmentViewUrl } from '../utils/routes';
import './HomePage.css';

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { isAdmin, loading } = useAuth();
  const { isMobile, isStandalone } = useDeviceDetection();

  const handleSelectEquipment = (equipment: Equipment) => {
    // Переход на страницу оборудования
    navigate(getEquipmentViewUrl(equipment.id));
  };

  const handleScanQR = () => {
    // Открыть сканер QR-кода
    // TODO: Реализовать переход на страницу сканера
    navigate('/scanner');
  };

  // Показываем загрузку во время проверки прав
  if (loading) {
    return (
      <div className="home-page">
        <div style={{ padding: '20px', textAlign: 'center' }}>Загрузка...</div>
      </div>
    );
  }

  // Если не администратор И (мобильное устройство ИЛИ PWA режим) → показываем PWA меню
  if (!isAdmin && (isMobile || isStandalone)) {
    return <PWAMenu onScanQR={handleScanQR} />;
  }

  // Если не администратор на десктопе, показываем сообщение
  if (!isAdmin) {
    return (
      <div className="home-page">
        <div style={{ 
          padding: '40px', 
          textAlign: 'center',
          maxWidth: '600px',
          margin: '0 auto'
        }}>
          <h2>Доступ ограничен</h2>
          <p>Эта страница доступна только для администраторов.</p>
          <p>Обычные пользователи могут просматривать оборудование по QR-коду и заполнять журнал обслуживания.</p>
          <p style={{ marginTop: '20px', fontSize: '14px', color: '#666' }}>
            Для доступа к функциям используйте мобильное устройство или установите PWA приложение.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="home-page">
      <div className="home-page-header">
        <h1>Список оборудования</h1>
        <button 
          className="add-button"
          onClick={() => navigate(ROUTES.EQUIPMENT_NEW)}
        >
          + Добавить оборудование
        </button>
      </div>
      <div className="home-page-content">
        <EquipmentList onSelectEquipment={handleSelectEquipment} />
      </div>
    </div>
  );
};

export default HomePage;

