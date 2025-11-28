/**
 * Форма добавления/редактирования оборудования
 * Поддерживает режимы создания и редактирования
 */

import React from 'react';
import { Equipment, EquipmentType, EquipmentStatus } from '../types/equipment';
import { useEquipmentForm } from '../hooks/useEquipmentForm';
import { SpecFieldsRenderer } from './EquipmentForm/SpecFields/SpecFieldsRenderer';
import { EQUIPMENT_TYPE_OPTIONS } from '../constants/equipmentTypes';
import './EquipmentForm.css';

interface EquipmentFormProps {
  equipmentId?: string; // Если передан - режим редактирования, иначе - создание
  onSave?: (equipment: Equipment) => void;
  onCancel?: () => void;
}

const EquipmentForm: React.FC<EquipmentFormProps> = ({ equipmentId, onSave, onCancel }) => {
  const {
    name,
    type,
    status,
    googleDriveUrl,
    qrCodeUrl,
    commissioningDate,
    specs,
    loading,
    saving,
    error,
    success,
    isEditMode,
    setName,
    setStatus,
    setGoogleDriveUrl,
    setQrCodeUrl,
    setCommissioningDate,
    handleTypeChange,
    handleSpecChange,
    handleSubmit,
    handleCancel,
  } = useEquipmentForm({ equipmentId, onSave, onCancel });

  if (loading) {
    return (
      <div className="equipment-form">
        <div className="loading-message">Загрузка данных оборудования...</div>
      </div>
    );
  }

  return (
    <div className="equipment-form">
      <div className="form-header">
        <h2>{isEditMode ? 'Редактирование оборудования' : 'Добавление оборудования'}</h2>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Основные поля */}
        <div className="form-section">
          <h3>Основная информация</h3>
          
          <div className="form-group">
            <label>Название оборудования *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Фильтр обезжелезивания ФО-0,8-1,5 №1"
              required
            />
          </div>

          <div className="form-group">
            <label>Тип оборудования *</label>
            <select
              value={type}
              onChange={(e) => handleTypeChange(e.target.value as EquipmentType)}
              required
            >
              {EQUIPMENT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Статус *</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as EquipmentStatus)}
              required
            >
              <option value="active">Активен</option>
              <option value="inactive">Неактивен</option>
            </select>
          </div>

          <div className="form-group">
            <label>URL Google Drive {isEditMode ? '*' : '(оставьте пустым для автоматического создания)'}</label>
            <input
              type="url"
              value={googleDriveUrl}
              onChange={(e) => setGoogleDriveUrl(e.target.value)}
              placeholder={isEditMode 
                ? "https://drive.google.com/drive/folders/..." 
                : "Оставьте пустым - папка создастся автоматически на сервере"}
              required={isEditMode}
            />
            {!isEditMode && (
              <small>Если оставить пустым, папка будет создана автоматически на сервере с названием оборудования. Это решает проблему CORS.</small>
            )}
          </div>

          <div className="form-group">
            <label>URL для QR-кода {isEditMode ? '*' : '(заполнится автоматически)'}</label>
            <input
              type="url"
              value={qrCodeUrl}
              onChange={(e) => setQrCodeUrl(e.target.value)}
              placeholder={isEditMode 
                ? "https://drive.google.com/drive/folders/..." 
                : "Заполнится автоматически на основе Google Drive URL"}
              required={isEditMode}
              disabled={!isEditMode && !googleDriveUrl.trim()}
            />
            <small>Обычно совпадает с URL Google Drive. {!isEditMode && 'Заполнится автоматически при создании папки.'}</small>
          </div>

          <div className="form-group">
            <label>Дата ввода в эксплуатацию</label>
            <input
              type="date"
              value={commissioningDate}
              onChange={(e) => {
                setCommissioningDate(e.target.value || '');
              }}
            />
          </div>
        </div>

        {/* Характеристики */}
        <div className="form-section">
          <h3>Характеристики</h3>
          <SpecFieldsRenderer
            type={type}
            specs={specs}
            onSpecChange={handleSpecChange}
          />
        </div>

        {/* Сообщения об ошибках и успехе */}
        {error && (
          <div className="error-message">
            <span className="error-icon">⚠</span> {error}
          </div>
        )}
        {success && (
          <div className="success-message">
            <span className="success-icon">✓</span> Оборудование успешно {isEditMode ? 'обновлено' : 'добавлено'}!
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
            {saving ? 'Сохранение...' : (isEditMode ? 'Сохранить изменения' : 'Добавить оборудование')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default EquipmentForm;
