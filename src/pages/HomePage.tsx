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
    return <PWAMenu />;
  }

  // Если не администратор на десктопе, показываем список оборудования для просмотра документации и журнала
  if (!isAdmin) {
    return (
      <div className="home-page">
        <div className="home-page-header">
          <h1>Оборудование</h1>
        </div>
        <div className="home-page-content">
          <div style={{ 
            padding: '20px',
            maxWidth: '1200px',
            margin: '0 auto',
            width: '100%'
          }}>
            <p style={{ 
              marginBottom: '20px', 
              color: '#666',
              fontSize: '16px'
            }}>
              Выберите оборудование для просмотра документации и журнала обслуживания
            </p>
            <EquipmentList onSelectEquipment={handleSelectEquipment} />
          </div>
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

