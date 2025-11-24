/**
 * Страница просмотра конкретного оборудования
 * Отображает табличку оборудования с возможностью редактирования дат
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import EquipmentPlate from '../components/EquipmentPlate';
import { filterSpecs, Equipment, FilterSpecs } from '../types/equipment';
import { getEquipmentById, updateEquipment, deleteEquipment } from '../services/equipmentApi';
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
  const [deleting, setDeleting] = useState<boolean>(false);
  
  const [commissioningDate, setCommissioningDate] = useState<string>('');
  const [lastMaintenanceDate, setLastMaintenanceDate] = useState<string>('');

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

  // Нормализация даты в формат YYYY-MM-DD для input type="date"
  // ВАЖНО: Не используем new Date() для парсинга, чтобы избежать проблем с часовыми поясами
  const normalizeDate = (dateString?: string): string => {
    if (!dateString) return '';
    
    // Убираем возможное время из строки даты
    // Например: "2024-01-15T00:00:00.000Z" -> "2024-01-15"
    // Или: "2024-01-15 12:00:00" -> "2024-01-15"
    const dateOnly = dateString.split('T')[0].split(' ')[0].trim();
    
    // Проверяем, что это формат YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
      // Просто возвращаем как есть, без использования new Date()
      return dateOnly;
    }
    
    // Если формат не YYYY-MM-DD, пытаемся извлечь дату другим способом
    // Но НЕ используем new Date(), чтобы избежать смещения из-за часовых поясов
    const match = dateOnly.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return match[0]; // Возвращаем YYYY-MM-DD
    }
    
    // Если не удалось распарсить, возвращаем пустую строку
    console.warn('Не удалось нормализовать дату:', dateString);
    return '';
  };

  const loadEquipment = async (equipmentId: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const equipment = await getEquipmentById(equipmentId);
      if (equipment) {
        setCurrentEquipment(equipment);
        // Нормализуем даты перед установкой в state
        const normalizedCommissioning = normalizeDate(equipment.commissioningDate);
        const normalizedMaintenance = normalizeDate(equipment.lastMaintenanceDate);
        
        // Логируем для отладки
        if (equipment.commissioningDate) {
          console.log('📅 Обработка даты на странице:', {
            id: equipment.id,
            name: equipment.name,
            исходная_дата: equipment.commissioningDate,
            нормализованная_дата: normalizedCommissioning
          });
        }
        
        setCommissioningDate(normalizedCommissioning);
        setLastMaintenanceDate(normalizedMaintenance);
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

  // Сохранение дат через API (ручное сохранение по кнопке)
  const saveDatesToAPI = async () => {
    if (!currentEquipment) {
      return;
    }
    
    setSaving(true);
    setSaveSuccess(false);
    setError(null);
    
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
      setCurrentEquipment(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error: any) {
      console.error('Ошибка сохранения:', error);
      setError(`Ошибка сохранения: ${error.message || 'Не удалось сохранить данные'}`);
      setTimeout(() => setError(null), 5000);
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
    setError(null);

    try {
      await deleteEquipment(currentEquipment.id);
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        // Перенаправляем на список после удаления
        navigate('/');
      }, 1500);
    } catch (err: any) {
      console.error('Ошибка удаления:', err);
      setError(`Ошибка удаления: ${err.message || 'Не удалось удалить оборудование'}`);
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
        <Link to="/" className="back-link">← Назад к списку</Link>
        <h1>{currentEquipment?.name || 'Оборудование'}</h1>
        {currentEquipment && (
          <div className="header-actions">
            <button
              className="edit-button"
              onClick={() => navigate(`/equipment/${currentEquipment.id}/edit`)}
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
          </>
        )}
      </div>
    </div>
  );
};

export default EquipmentPage;

