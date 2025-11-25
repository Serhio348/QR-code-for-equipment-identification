/**
 * Компонент списка оборудования
 * Отображает все оборудование из базы данных в виде списка
 */

import React, { useState, useEffect } from 'react';
import { getAllEquipment } from '../services/equipmentApi';
import { Equipment } from '../types/equipment';
import { formatDate } from '../utils/dateFormatting';
import './EquipmentList.css';

interface EquipmentListProps {
  onSelectEquipment?: (equipment: Equipment) => void;
}

const EquipmentList: React.FC<EquipmentListProps> = ({ onSelectEquipment }) => {
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Загрузка оборудования при монтировании компонента
  useEffect(() => {
    loadEquipment();
  }, []);

  const loadEquipment = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const allEquipment = await getAllEquipment();
      
      // НЕ нормализуем даты - используем их как есть с сервера
      // Нормализация может привести к потере данных или изменению даты
      // Если дата приходит в формате YYYY-MM-DD, она уже правильная
      const normalizedEquipment = allEquipment.map(eq => {
        // Просто убираем время, если оно есть, но не меняем саму дату
        const commissioningDate = eq.commissioningDate ? String(eq.commissioningDate).split('T')[0].split(' ')[0].trim() : '';
        const lastMaintenanceDate = eq.lastMaintenanceDate ? String(eq.lastMaintenanceDate).split('T')[0].split(' ')[0].trim() : '';
        
        return {
          ...eq,
          commissioningDate: commissioningDate,
          lastMaintenanceDate: lastMaintenanceDate
        };
      });
      
      setEquipmentList(normalizedEquipment);
    } catch (err: any) {
      console.error('Ошибка загрузки оборудования:', err);
      setError('Не удалось загрузить список оборудования');
    } finally {
      setLoading(false);
    }
  };

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


  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="status-badge status-active">Активен</span>;
      case 'inactive':
        return <span className="status-badge status-inactive">Неактивен</span>;
      default:
        return <span className="status-badge">{status}</span>;
    }
  };

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
        <button onClick={loadEquipment} className="retry-button">
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
            <option value="filter">Фильтры</option>
            <option value="pump">Насосы</option>
            <option value="tank">Резервуары</option>
            <option value="valve">Клапаны</option>
            <option value="electrical">Электрооборудование</option>
            <option value="ventilation">Вентиляционное оборудование</option>
            <option value="plumbing">Сантехническое оборудование</option>
            <option value="industrial">Прочее промышленное оборудование</option>
            <option value="other">Другое</option>
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
                {getStatusBadge(equipment.status)}
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

