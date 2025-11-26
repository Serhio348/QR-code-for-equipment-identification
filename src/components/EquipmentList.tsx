/**
 * Компонент списка оборудования
 * Отображает все оборудование из базы данных в виде списка
 */

import React, { useState, useMemo } from 'react';
import { Equipment } from '../types/equipment';
import { formatDate } from '../utils/dateFormatting';
import { EQUIPMENT_TYPE_OPTIONS } from '../constants/equipmentTypes';
import { useEquipmentData } from '../hooks/useEquipmentData';
import StatusBadge from './StatusBadge';
import './EquipmentList.css';

interface EquipmentListProps {
  onSelectEquipment?: (equipment: Equipment) => void;
}

const EquipmentList: React.FC<EquipmentListProps> = ({ onSelectEquipment }) => {
  // Используем хук для загрузки данных (с кешированием)
  const { data: equipmentListData, loading, error, refetch } = useEquipmentData();
  
  // Преобразуем данные в массив (если это список)
  const equipmentList = useMemo(() => {
    if (!equipmentListData) return [];
    return Array.isArray(equipmentListData) ? equipmentListData : [];
  }, [equipmentListData]);
  
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Фильтрация оборудования
  const filteredEquipment = equipmentList.filter(eq => {
    // Фильтр по типу
    if (filterType !== 'all' && eq.type !== filterType) {
      return false;
    }
    
    // Фильтр по статусу
    if (filterStatus !== 'all' && eq.status !== filterStatus) {
      return false;
    }
    
    // Исключаем архивные из списка
    if (eq.status === 'archived') {
      return false;
    }
    
    // Поиск по названию
    if (searchQuery && !eq.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    
    return true;
  });



  if (loading) {
    return (
      <div className="equipment-list">
        <div className="loading-message">Загрузка списка оборудования...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="equipment-list">
        <div className="error-message">{error}</div>
        <button onClick={refetch} className="retry-button">
          Попробовать снова
        </button>
      </div>
    );
  }

  return (
    <div className="equipment-list">
      <div className="list-header">
        <div className="list-controls">
          {/* Поиск */}
          <div className="search-box">
            <input
              type="text"
              placeholder="Поиск по названию..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>
          
          {/* Фильтр по типу */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="filter-select"
          >
            <option value="all">Все типы</option>
            {EQUIPMENT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          
          {/* Фильтр по статусу */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="filter-select"
          >
            <option value="all">Все статусы</option>
            <option value="active">Активные</option>
            <option value="inactive">Неактивные</option>
          </select>
        </div>
      </div>

      <div className="list-info">
        Найдено: {filteredEquipment.length} из {equipmentList.length}
      </div>

      {filteredEquipment.length === 0 ? (
        <div className="empty-message">
          {equipmentList.length === 0 
            ? 'Оборудование не найдено. Добавьте новое оборудование.'
            : 'Нет оборудования, соответствующего фильтрам.'}
        </div>
      ) : (
        <div className="equipment-cards">
          {filteredEquipment.map((equipment) => (
            <div
              key={equipment.id}
              className="equipment-card"
              onClick={() => onSelectEquipment?.(equipment)}
            >
              <div className="card-header">
                <h3 className="equipment-name">{equipment.name}</h3>
                <StatusBadge status={equipment.status} />
              </div>
              
              <div className="card-body">
                <div className="card-info">
                  <span className="info-value info-value-bold">{equipment.name}</span>
                </div>
                
                {equipment.specs?.inventoryNumber && (
                  <div className="card-info">
                    <span className="info-label">Инвентарный номер:</span>
                    <span className="info-value">{equipment.specs.inventoryNumber}</span>
                  </div>
                )}
                
                {equipment.commissioningDate && (
                  <div className="card-info">
                    <span className="info-label">Ввод в эксплуатацию:</span>
                    <span className="info-value">{formatDate(equipment.commissioningDate)}</span>
                  </div>
                )}
                
                {equipment.lastMaintenanceDate && (
                  <div className="card-info">
                    <span className="info-label">Последнее обслуживание:</span>
                    <span className="info-value">{formatDate(equipment.lastMaintenanceDate)}</span>
                  </div>
                )}
              </div>
              
              <div className="card-footer">
                <span className="equipment-id">ID: {equipment.id.substring(0, 8)}...</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default EquipmentList;

