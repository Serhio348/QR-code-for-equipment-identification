/**
 * Компонент списка оборудования
 * Отображает все оборудование из базы данных в виде списка
 */

import React, { useState, useMemo } from 'react';
import { Equipment } from '../types/equipment';
import { formatDate } from '../../../shared/utils/dateFormatting';
import { EQUIPMENT_TYPE_OPTIONS } from '../constants/equipmentTypes';
import { useEquipmentData } from '../hooks/useEquipmentData';
import { useWorkshops } from '../../workshops/hooks/useWorkshops';
import { isDriveId } from '../../../shared/utils/qrCodeParser';
import StatusBadge from '../../common/components/StatusBadge';
import QRScanner from '../../common/components/QRScanner/QRScanner';
import './EquipmentList.css';

interface EquipmentListProps {
  onSelectEquipment?: (equipment: Equipment) => void;
}

const EquipmentList: React.FC<EquipmentListProps> = ({ onSelectEquipment }) => {
  // Используем хук для загрузки данных (с кешированием)
  const { data: equipmentListData, loading, error, refetch } = useEquipmentData();
  const { workshops: workshopOptions = [] } = useWorkshops();
  
  // Преобразуем данные в массив (если это список)
  const equipmentList = useMemo(() => {
    if (!equipmentListData) return [];
    return Array.isArray(equipmentListData) ? equipmentListData : [];
  }, [equipmentListData]);
  
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterWorkshop, setFilterWorkshop] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 6;

  /**
   * Поиск оборудования по ID или Google Drive URL
   */
  const findEquipmentById = (id: string): Equipment | null => {
    if (isDriveId(id)) {
      // Поиск по Google Drive ID
      const driveFolderId = id.replace('DRIVE:', '');
      return equipmentList.find(eq => {
        if (!eq.googleDriveUrl) return false;
        const url = eq.googleDriveUrl.toLowerCase();
        const searchId = driveFolderId.toLowerCase();
        return url.includes(searchId) || 
               url.includes(`folders/${searchId}`) ||
               url.includes(`id=${searchId}`);
      }) || null;
    } else {
      // Поиск по прямому ID
      return equipmentList.find(eq => eq.id === id) || null;
    }
  };

  /**
   * Обработка успешного сканирования QR-кода
   */
  const handleScanSuccess = (scannedId: string) => {
    console.debug('[EquipmentList] Отсканирован ID:', scannedId);
    
    // Ищем оборудование в списке
    const equipment = findEquipmentById(scannedId);
    
    if (equipment) {
      console.debug('[EquipmentList] Оборудование найдено:', equipment.name);
      
      // Закрываем сканер
      setIsScannerOpen(false);
      
      // Автоматически открываем карточку оборудования
      if (onSelectEquipment) {
        onSelectEquipment(equipment);
      }
    } else {
      // Оборудование не найдено - показываем сообщение
      alert(`Оборудование с ID "${scannedId}" не найдено в списке.\n\nВозможно, список нужно обновить.`);
      setIsScannerOpen(false);
    }
  };

  /**
   * Обработка ошибки сканирования
   */
  const handleScanError = (error: string) => {
    console.error('[EquipmentList] Ошибка сканирования:', error);
  };

  // Фильтрация оборудования
  const filteredEquipment = useMemo(() => {
    return equipmentList.filter(eq => {
      // Фильтр по типу
      if (filterType !== 'all' && eq.type !== filterType) {
        return false;
      }
      
      // Фильтр по статусу
      if (filterStatus !== 'all' && eq.status !== filterStatus) {
        return false;
      }
      
      // Фильтр по участку
      if (filterWorkshop !== 'all') {
        const equipmentWorkshop = eq.specs?.workshop || eq.specs?.location || '';
        if (equipmentWorkshop !== filterWorkshop) {
          return false;
        }
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
  }, [equipmentList, filterType, filterStatus, filterWorkshop, searchQuery]);

  // Пагинация
  const totalPages = Math.ceil(filteredEquipment.length / itemsPerPage);
  const paginatedEquipment = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredEquipment.slice(startIndex, endIndex);
  }, [filteredEquipment, currentPage, itemsPerPage]);

  // Сброс страницы при изменении фильтров
  React.useEffect(() => {
    setCurrentPage(1);
  }, [filterType, filterStatus, searchQuery]);



  if (loading) {
    return (
      <div className="equipment-list">
        <div className="loading-message">
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div className="spinner" style={{ 
              width: '40px', 
              height: '40px', 
              border: '4px solid #f3f3f3', 
              borderTop: '4px solid #667eea', 
              borderRadius: '50%', 
              animation: 'spin 1s linear infinite',
              margin: '0 auto 20px'
            }}></div>
            <p>Загрузка списка оборудования...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="equipment-list">
        <div className="error-message">
          <p style={{ marginBottom: '10px', fontWeight: '600' }}>Ошибка загрузки данных</p>
          <p style={{ marginBottom: '20px' }}>{error}</p>
          <button onClick={refetch} className="retry-button">
          Попробовать снова
        </button>
        </div>
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
          
          {/* Кнопка сканера QR-кода - только на мобильных */}
          <button
            className="qr-scanner-button"
            onClick={() => setIsScannerOpen(true)}
            type="button"
            title="Сканировать QR-код"
          >
            📱 Сканировать QR
          </button>
          
          {/* Фильтр по участку */}
          <select
            value={filterWorkshop}
            onChange={(e) => setFilterWorkshop(e.target.value)}
            className="filter-select"
          >
            <option value="all">Все участки</option>
            {workshopOptions && workshopOptions.length > 0 ? (
              workshopOptions.map((workshop: string) => (
                <option key={workshop} value={workshop}>
                  {workshop}
                </option>
              ))
            ) : (
              <option disabled>Загрузка участков...</option>
            )}
          </select>
          
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

      {/* Сканер QR-кодов */}
      <QRScanner
        isOpen={isScannerOpen}
        onScanSuccess={handleScanSuccess}
        onScanError={handleScanError}
        onClose={() => setIsScannerOpen(false)}
      />

      <div className="list-info">
        Найдено: {filteredEquipment.length} из {equipmentList.length}
        {totalPages > 1 && ` (Страница ${currentPage} из ${totalPages})`}
      </div>

      {filteredEquipment.length === 0 ? (
        <div className="empty-message">
          {equipmentList.length === 0 
            ? 'Оборудование не найдено. Добавьте новое оборудование.'
            : 'Нет оборудования, соответствующего фильтрам.'}
        </div>
      ) : (
        <>
          <div className="equipment-cards">
            {paginatedEquipment.map((equipment) => (
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

          {/* Пагинация */}
          {totalPages > 1 && (
            <div className="pagination">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="pagination-button"
              >
                ← Назад
              </button>
              <span className="pagination-info">
                Страница {currentPage} из {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="pagination-button"
              >
                Вперед →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default EquipmentList;

