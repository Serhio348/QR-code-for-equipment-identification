/**
 * Главная страница - список всего оборудования
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import EquipmentList from '../components/EquipmentList';
import { Equipment } from '../types/equipment';
import './HomePage.css';

const HomePage: React.FC = () => {
  const navigate = useNavigate();

  const handleSelectEquipment = (equipment: Equipment) => {
    // Переход на страницу оборудования
    navigate(`/equipment/${equipment.id}`);
  };

  return (
    <div className="home-page">
      <div className="page-header">
        <h1>Список оборудования</h1>
        <button 
          className="add-button"
          onClick={() => navigate('/equipment/new')}
        >
          + Добавить оборудование
        </button>
      </div>
      <EquipmentList onSelectEquipment={handleSelectEquipment} />
    </div>
  );
};

export default HomePage;

