/**
 * Форма создания/редактирования точки отбора проб
 * Поддерживает режимы создания и редактирования
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import type {
  SamplingPointInput,
  SamplingFrequency,
} from '../types/waterQuality';
import { useSamplingPointManagement, useSamplingPoint } from '../hooks/useSamplingPoints';
import { ROUTES } from '@/shared/utils/routes';
import './SamplingPointForm.css';

interface SamplingPointFormProps {
  pointId?: string; // Если передан - режим редактирования, иначе - создание
  onSave?: () => void;
  onCancel?: () => void;
}

const SamplingPointForm: React.FC<SamplingPointFormProps> = ({ pointId, onSave, onCancel }) => {
  const navigate = useNavigate();
  const isEditMode = !!pointId;
  const { create, update, error } = useSamplingPointManagement();
  const { samplingPoint: existingPoint, loading: loadingPoint } = useSamplingPoint(isEditMode ? pointId || null : null);

  // Основные поля
  const [code, setCode] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [equipmentId, setEquipmentId] = useState<string>('');
  const [location, setLocation] = useState<string>('');
  const [samplingFrequency, setSamplingFrequency] = useState<SamplingFrequency | ''>('');
  const [responsiblePerson, setResponsiblePerson] = useState<string>('');
  const [isActive, setIsActive] = useState<boolean>(true);

  const [saving, setSaving] = useState<boolean>(false);

  // Загрузка данных для редактирования
  useEffect(() => {
    if (isEditMode && existingPoint) {
      setCode(existingPoint.code);
      setName(existingPoint.name);
      setDescription(existingPoint.description || '');
      setEquipmentId(existingPoint.equipmentId || '');
      setLocation(existingPoint.location || '');
      setSamplingFrequency(existingPoint.samplingFrequency || '');
      setResponsiblePerson(existingPoint.responsiblePerson || '');
      setIsActive(existingPoint.isActive);
    }
  }, [isEditMode, existingPoint]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!code.trim()) {
      toast.error('Укажите код точки отбора проб');
      return;
    }

    if (code.trim().length < 2) {
      toast.error('Код должен содержать минимум 2 символа');
      return;
    }

    if (!name.trim()) {
      toast.error('Укажите название точки отбора проб');
      return;
    }

    if (name.trim().length < 2) {
      toast.error('Название должно содержать минимум 2 символа');
      return;
    }

    setSaving(true);

    try {
      const pointInput: SamplingPointInput = {
        code: code.trim(),
        name: name.trim(),
        description: description.trim() || undefined,
        equipmentId: equipmentId.trim() || undefined,
        location: location.trim() || undefined,
        samplingFrequency: samplingFrequency || undefined,
        responsiblePerson: responsiblePerson.trim() || undefined,
        isActive,
      };

      let savedPoint;
      if (isEditMode && pointId) {
        savedPoint = await update(pointId, pointInput);
      } else {
        savedPoint = await create(pointInput);
      }

      if (!savedPoint) {
        throw new Error('Не удалось сохранить точку отбора проб');
      }

      toast.success(`Точка отбора проб успешно ${isEditMode ? 'обновлена' : 'создана'}!`);
      
      if (onSave) {
        onSave();
      } else {
        navigate(ROUTES.WATER_QUALITY_SAMPLING_POINTS);
      }
    } catch (err: any) {
      console.error('[SamplingPointForm] Ошибка сохранения:', err);
      toast.error(err.message || 'Не удалось сохранить точку отбора проб');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      navigate(ROUTES.WATER_QUALITY_SAMPLING_POINTS);
    }
  };

  if (loadingPoint) {
    return (
      <div className="sampling-point-form">
        <div className="loading-message">
          Загрузка данных точки отбора проб...
        </div>
      </div>
    );
  }

  return (
    <div className="sampling-point-form">
      <div className="form-header">
        <h2>{isEditMode ? 'Редактирование точки отбора проб' : 'Создание точки отбора проб'}</h2>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Основная информация */}
        <div className="form-section">
          <h3>Основная информация</h3>

          <div className="form-row">
            <div className="form-group">
              <label>Код *</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Например: ПТ-001"
                required
                maxLength={50}
              />
              <small>Уникальный код точки отбора проб (2-50 символов)</small>
            </div>

            <div className="form-group">
              <label>Название *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например: Точка отбора на входе"
                required
                maxLength={200}
              />
              <small>Название точки отбора проб (2-200 символов)</small>
            </div>
          </div>

          <div className="form-group">
            <label>Описание</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Дополнительное описание точки отбора проб..."
              rows={3}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>ID оборудования</label>
              <input
                type="text"
                value={equipmentId}
                onChange={(e) => setEquipmentId(e.target.value)}
                placeholder="ID связанного оборудования"
              />
            </div>

            <div className="form-group">
              <label>Местоположение</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Например: Цех №1, линия 2"
              />
            </div>
          </div>
        </div>

        {/* Параметры отбора проб */}
        <div className="form-section">
          <h3>Параметры отбора проб</h3>

          <div className="form-row">
            <div className="form-group">
              <label>Частота отбора</label>
              <select
                value={samplingFrequency}
                onChange={(e) => setSamplingFrequency(e.target.value as SamplingFrequency | '')}
              >
                <option value="">Не указана</option>
                <option value="daily">Ежедневно</option>
                <option value="weekly">Еженедельно</option>
                <option value="monthly">Ежемесячно</option>
                <option value="custom">По расписанию</option>
              </select>
            </div>

            <div className="form-group">
              <label>Ответственное лицо</label>
              <input
                type="text"
                value={responsiblePerson}
                onChange={(e) => setResponsiblePerson(e.target.value)}
                placeholder="ФИО ответственного лица"
              />
            </div>
          </div>
        </div>

        {/* Статус */}
        <div className="form-section">
          <h3>Статус</h3>

          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <span>Точка отбора проб активна</span>
            </label>
            <small>Неактивные точки не отображаются в списках для выбора</small>
          </div>
        </div>

        {/* Сообщения об ошибках */}
        {error && (
          <div className="error-message">
            <span className="error-icon">⚠</span> {error}
          </div>
        )}

        {/* Кнопки */}
        <div className="form-actions">
          <button
            type="button"
            onClick={handleCancel}
            className="cancel-button"
            disabled={saving}
          >
            Отмена
          </button>
          <button
            type="submit"
            className="submit-button"
            disabled={saving}
          >
            {saving ? 'Сохранение...' : (isEditMode ? 'Сохранить изменения' : 'Создать точку отбора')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default SamplingPointForm;
