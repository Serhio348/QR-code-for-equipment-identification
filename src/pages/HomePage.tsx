/**
 * Главная страница - список всего оборудования
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import EquipmentList from '../components/EquipmentList';
import { Equipment } from '../types/equipment';
import { ROUTES, getEquipmentViewUrl } from '../utils/routes';
import './HomePage.css';

const HomePage: React.FC = () => {
  const navigate = useNavigate();

  const handleSelectEquipment = (equipment: Equipment) => {
    // Переход на страницу оборудования
    navigate(getEquipmentViewUrl(equipment.id));
  };

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

