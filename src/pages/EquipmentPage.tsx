/**
 * Страница просмотра конкретного оборудования
 * Отображает табличку оборудования с возможностью редактирования дат
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import EquipmentPlate from '../components/EquipmentPlate';
import DriveFilesList from '../components/DriveFilesList';
import { filterSpecs, FilterSpecs } from '../types/equipment';
import { updateEquipment, deleteEquipment } from '../services/equipmentApi';
import { useEquipmentData, updateEquipmentCache, clearEquipmentCache } from '../hooks/useEquipmentData';
import { exportToPDF } from '../utils/pdfExport';
import { ROUTES, getEquipmentEditUrl } from '../utils/routes';
import { normalizeDate } from '../utils/dateNormalization';
import './EquipmentPage.css';

const EquipmentPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  // Используем хук для загрузки данных (с кешированием)
  const { data: equipmentData, loading, error: loadError } = useEquipmentData(id && id !== 'new' ? id : undefined);
  
  // Преобразуем данные в один объект (если это одно оборудование)
  const currentEquipment = equipmentData && !Array.isArray(equipmentData) ? equipmentData : null;
  
  // Локальные состояния для операций сохранения/удаления
  const [saving, setSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  
  const [commissioningDate, setCommissioningDate] = useState<string>('');
  const [lastMaintenanceDate, setLastMaintenanceDate] = useState<string>('');
  
  // Объединяем ошибки загрузки и операций
  const error = loadError || operationError;

  // Устанавливаем даты при загрузке оборудования
  useEffect(() => {
    if (currentEquipment) {
      const normalizedCommissioning = normalizeDate(currentEquipment.commissioningDate);
      const normalizedMaintenance = normalizeDate(currentEquipment.lastMaintenanceDate);
      
      setCommissioningDate(normalizedCommissioning);
      setLastMaintenanceDate(normalizedMaintenance);
    }
  }, [currentEquipment]);

  // Сохранение дат через API (ручное сохранение по кнопке)
  const saveDatesToAPI = async () => {
    if (!currentEquipment) {
      return;
    }
    
    setSaving(true);
    setSaveSuccess(false);
    setOperationError(null);
    
    try {
      // input type="date" уже возвращает YYYY-MM-DD, просто убираем возможное время для гарантии
      const normalizedCommissioning = commissioningDate ? commissioningDate.split('T')[0].trim() : undefined;
      const normalizedMaintenance = lastMaintenanceDate ? lastMaintenanceDate.split('T')[0].trim() : undefined;
      
      console.log('💾 Сохранение дат:', {
        исходная_commissioning: commissioningDate,
        нормализованная_commissioning: normalizedCommissioning,
        исходная_maintenance: lastMaintenanceDate,
        нормализованная_maintenance: normalizedMaintenance
      });
      
      const updated = await updateEquipment(currentEquipment.id, {
        commissioningDate: normalizedCommissioning,
        lastMaintenanceDate: normalizedMaintenance
      });
      // Обновляем кеш после сохранения
      updateEquipmentCache(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error: any) {
      console.error('Ошибка сохранения:', error);
      setOperationError(`Ошибка сохранения: ${error.message || 'Не удалось сохранить данные'}`);
      setTimeout(() => setOperationError(null), 5000);
    } finally {
      setSaving(false);
    }
  };

  const handleExportPDF = async () => {
    try {
      await exportToPDF('equipment-plate', `${currentEquipment?.name || 'Оборудование'}-табличка.pdf`);
    } catch (error) {
      alert('Ошибка при экспорте в PDF. Попробуйте еще раз.');
      console.error(error);
    }
  };

  // Удаление оборудования
  const handleDelete = async () => {
    if (!currentEquipment) return;

    const confirmMessage = `Вы уверены, что хотите удалить оборудование "${currentEquipment.name}"?\n\nЭто действие удалит оборудование и папку в Google Drive. Это действие нельзя отменить.`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setDeleting(true);
    setOperationError(null);

    try {
      await deleteEquipment(currentEquipment.id);
      // Очищаем кеш после удаления
      clearEquipmentCache(currentEquipment.id);
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        // Перенаправляем на список после удаления
        navigate(ROUTES.HOME);
      }, 1500);
    } catch (err: any) {
      console.error('Ошибка удаления:', err);
      setOperationError(`Ошибка удаления: ${err.message || 'Не удалось удалить оборудование'}`);
    } finally {
      setDeleting(false);
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
        <Link to={ROUTES.HOME} className="back-link">← Назад к списку</Link>
        <h1>{currentEquipment?.name || 'Оборудование'}</h1>
        {currentEquipment && (
          <div className="header-actions">
            <button
              className="edit-button"
              onClick={() => navigate(getEquipmentEditUrl(currentEquipment.id))}
            >
              Редактировать
            </button>
            <button
              className="delete-button"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Удаление...' : '🗑️ Удалить'}
            </button>
          </div>
        )}
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
                    onChange={(e) => {
                      // input type="date" всегда возвращает YYYY-MM-DD, просто сохраняем как есть
                      setCommissioningDate(e.target.value || '');
                    }}
                    className="date-input"
                    disabled={saving}
                  />
                </label>
                <label>
                  Дата последнего обслуживания:
                  <input
                    type="date"
                    value={lastMaintenanceDate}
                    onChange={(e) => {
                      // input type="date" всегда возвращает YYYY-MM-DD, просто сохраняем как есть
                      setLastMaintenanceDate(e.target.value || '');
                    }}
                    className="date-input"
                    disabled={saving}
                  />
                </label>
                <button 
                  onClick={saveDatesToAPI} 
                  className="save-button"
                  disabled={saving}
                >
                  {saving ? 'Сохранение...' : '💾 Сохранить даты'}
                </button>
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
              equipmentName={currentEquipment?.name}
              filterNumber={getFilterNumber()}
              commissioningDate={commissioningDate}
              lastMaintenanceDate={lastMaintenanceDate}
              qrCodeUrl={currentEquipment?.qrCodeUrl}
            />
            
            {currentEquipment?.googleDriveUrl && (
              <DriveFilesList 
                folderUrl={currentEquipment.googleDriveUrl}
                equipmentName={currentEquipment.name}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default EquipmentPage;

