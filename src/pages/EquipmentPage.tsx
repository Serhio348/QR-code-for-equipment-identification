/**
 * Страница просмотра конкретного оборудования
 * Отображает табличку оборудования с возможностью редактирования дат
 */

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import EquipmentPlate from '../components/EquipmentPlate';
import { filterSpecs, Equipment, FilterSpecs } from '../types/equipment';
import { getEquipmentById, updateEquipment, addEquipment, getEquipmentByType } from '../services/equipmentApi';
import { exportToPDF } from '../utils/pdfExport';
import './EquipmentPage.css';

const EquipmentPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [currentEquipment, setCurrentEquipment] = useState<Equipment | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  
  const [commissioningDate, setCommissioningDate] = useState<string>('');
  const [lastMaintenanceDate, setLastMaintenanceDate] = useState<string>('');
  
  const saveTimeoutRef = useRef<number | null>(null);
  const isInitialLoadRef = useRef<boolean>(true);

  // Загрузка оборудования при монтировании
  useEffect(() => {
    if (id && id !== 'new') {
      loadEquipment(id);
    } else {
      // Для нового оборудования используем дефолтные данные
      setCurrentEquipment(null);
      setLoading(false);
    }
  }, [id]);

  const loadEquipment = async (equipmentId: string) => {
    setLoading(true);
    setError(null);
    isInitialLoadRef.current = true;
    
    try {
      const equipment = await getEquipmentById(equipmentId);
      if (equipment) {
        setCurrentEquipment(equipment);
        setCommissioningDate(equipment.commissioningDate || '');
        setLastMaintenanceDate(equipment.lastMaintenanceDate || '');
      } else {
        setError('Оборудование не найдено');
      }
    } catch (err: any) {
      console.error('Ошибка загрузки оборудования:', err);
      setError('Не удалось загрузить данные оборудования');
    } finally {
      setLoading(false);
    }
  };

  // Сохранение дат через API
  const saveDatesToAPI = async (commissioning: string, maintenance: string) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = window.setTimeout(async () => {
      setSaving(true);
      setSaveSuccess(false);
      setError(null);
      
      try {
        if (currentEquipment) {
          const updated = await updateEquipment(currentEquipment.id, {
            commissioningDate: commissioning || undefined,
            lastMaintenanceDate: maintenance || undefined
          });
          setCurrentEquipment(updated);
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 3000);
        }
      } catch (error: any) {
        console.error('Ошибка сохранения:', error);
        setError(`Ошибка сохранения: ${error.message || 'Не удалось сохранить данные'}`);
        setTimeout(() => setError(null), 5000);
      } finally {
        setSaving(false);
      }
    }, 1000);
  };

  // Сохраняем даты при изменении
  useEffect(() => {
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      return;
    }
    
    if (loading || !currentEquipment) {
      return;
    }
    
    saveDatesToAPI(commissioningDate, lastMaintenanceDate);
  }, [commissioningDate, lastMaintenanceDate, loading]);

  const handleExportPDF = async () => {
    try {
      await exportToPDF('equipment-plate', `${currentEquipment?.name || 'Оборудование'}-табличка.pdf`);
    } catch (error) {
      alert('Ошибка при экспорте в PDF. Попробуйте еще раз.');
      console.error(error);
    }
  };

  // Извлечение номера фильтра из названия
  const getFilterNumber = (): number => {
    if (!currentEquipment) return 1;
    const match = currentEquipment.name.match(/№(\d+)/);
    return match ? parseInt(match[1]) : 1;
  };

  return (
    <div className="equipment-page">
      <div className="page-header">
        <Link to="/" className="back-link">← Назад к списку</Link>
        <h1>{currentEquipment?.name || 'Оборудование'}</h1>
      </div>

      <div className="plate-container">
        {/* Индикаторы состояния */}
        {saving && (
          <div className="saving-message">
            <span className="saving-spinner">⏳</span> Сохранение данных...
          </div>
        )}
        {saveSuccess && (
          <div className="success-message">
            <span className="success-icon">✓</span> Данные успешно сохранены
          </div>
        )}
        {error && !loading && (
          <div className="error-message">
            <span className="error-icon">⚠</span> {error}
          </div>
        )}
        
        {loading ? (
          <div className="loading-message">Загрузка данных оборудования...</div>
        ) : (
          <>
            <div className="controls">
              <div className="controls-left">
                <label>
                  Дата ввода в эксплуатацию:
                  <input
                    type="date"
                    value={commissioningDate}
                    onChange={(e) => setCommissioningDate(e.target.value)}
                    className="date-input"
                    disabled={saving}
                  />
                </label>
                <label>
                  Дата последнего обслуживания:
                  <input
                    type="date"
                    value={lastMaintenanceDate}
                    onChange={(e) => setLastMaintenanceDate(e.target.value)}
                    className="date-input"
                    disabled={saving}
                  />
                </label>
              </div>
              <button 
                onClick={handleExportPDF} 
                className="export-button"
                disabled={saving}
              >
                Экспортировать в PDF
              </button>
            </div>
            <EquipmentPlate 
              specs={(currentEquipment?.specs as FilterSpecs) || filterSpecs} 
              filterNumber={getFilterNumber()}
              commissioningDate={commissioningDate}
              lastMaintenanceDate={lastMaintenanceDate}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default EquipmentPage;

