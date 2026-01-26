/**
 * Модальное окно настроек экспорта таблички оборудования
 */

import React, { useState, useEffect } from 'react';
import { PlateExportSettings, PlateSize, PlateTemplate, DEFAULT_EXPORT_SETTINGS, PLATE_TEMPLATES } from '@/shared/types/plateExport';
import { FilterSpecs } from '../types/equipment';
import './PlateExportSettingsModal.css';

interface PlateExportSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (settings: PlateExportSettings) => void;
  equipmentName: string;
  specs: FilterSpecs;
}

const PlateExportSettingsModal: React.FC<PlateExportSettingsModalProps> = ({
  isOpen,
  onClose,
  onExport,
  equipmentName: _equipmentName,
  specs,
}) => {
  const [settings, setSettings] = useState<PlateExportSettings>(DEFAULT_EXPORT_SETTINGS);
  const [customWidth, setCustomWidth] = useState<number>(210); // A4 width in mm
  const [customHeight, setCustomHeight] = useState<number>(297); // A4 height in mm

  // Список доступных полей характеристик
  const availableSpecFields = [
    { key: 'inventoryNumber', label: 'Инвентарный номер' },
    { key: 'height', label: 'Высота' },
    { key: 'diameter', label: 'Диаметр' },
    { key: 'capacity', label: 'Производительность' },
    { key: 'filtrationArea', label: 'Площадь фильтрации' },
    { key: 'filtrationSpeed', label: 'Скорость фильтрации' },
    { key: 'fillingMaterial', label: 'Засыпка' },
    { key: 'fillingVolume', label: 'Объем засыпки' },
    { key: 'power', label: 'Мощность' },
    { key: 'voltage', label: 'Напряжение' },
    { key: 'current', label: 'Ток' },
    { key: 'equipmentType', label: 'Тип оборудования' },
    { key: 'protectionClass', label: 'Класс защиты' },
    { key: 'fanType', label: 'Тип вентилятора' },
    { key: 'pressure', label: 'Напор' },
    { key: 'material', label: 'Материал' },
    { key: 'workingPressure', label: 'Рабочее давление' },
    { key: 'temperature', label: 'Температура' },
    { key: 'head', label: 'Напор' },
    { key: 'volume', label: 'Объем' },
    { key: 'valveType', label: 'Тип клапана' },
    { key: 'serialNumber', label: 'Заводской номер' },
    { key: 'additionalNotes', label: 'Дополнительные характеристики' },
  ];

  // Фильтруем только те поля, которые есть в specs
  const visibleSpecFields = availableSpecFields.filter(field => {
    const value = specs[field.key];
    return value !== undefined && value !== null && value !== '';
  });

  useEffect(() => {
    if (isOpen) {
      // Сбрасываем настройки при открытии
      const defaultSettings = { ...DEFAULT_EXPORT_SETTINGS };
      // Если selectedSpecFields не определен, инициализируем всеми видимыми полями
      // Это позволяет различать undefined (показать все) и [] (скрыть все)
      if (defaultSettings.selectedSpecFields === undefined) {
        // При открытии модального окна инициализируем всеми видимыми полями
        // чтобы пользователь видел все чекбоксы отмеченными по умолчанию
        defaultSettings.selectedSpecFields = visibleSpecFields.map(f => f.key);
      }
      setSettings(defaultSettings);
    }
  }, [isOpen]);

  const handleTemplateChange = (template: PlateTemplate) => {
    const templateSettings = PLATE_TEMPLATES[template];
    setSettings({
      ...settings,
      ...templateSettings,
      template,
    });
  };

  const handleSizeChange = (size: PlateSize) => {
    setSettings({
      ...settings,
      size,
    });
  };

  const handleCustomSizeChange = (width: number, height: number) => {
    setCustomWidth(width);
    setCustomHeight(height);
    setSettings({
      ...settings,
      customWidth: width,
      customHeight: height,
    });
  };

  const handleFieldToggle = (fieldKey: string) => {
    // Если selectedSpecFields undefined, инициализируем всеми видимыми полями
    // Это происходит только если пользователь начал взаимодействовать с чекбоксами
    // до того, как они были инициализированы в useEffect
    const currentFields = settings.selectedSpecFields ?? visibleSpecFields.map(f => f.key);
    const newFields = currentFields.includes(fieldKey)
      ? currentFields.filter(f => f !== fieldKey)
      : [...currentFields, fieldKey];
    
    setSettings({
      ...settings,
      selectedSpecFields: newFields,
    });
  };

  const handleSelectAllSpecFields = () => {
    setSettings({
      ...settings,
      selectedSpecFields: visibleSpecFields.map(f => f.key),
    });
  };

  const handleDeselectAllSpecFields = () => {
    setSettings({
      ...settings,
      selectedSpecFields: [],
    });
  };

  const handleExport = () => {
    const finalSettings = {
      ...settings,
      customWidth: settings.size === 'custom' ? customWidth : undefined,
      customHeight: settings.size === 'custom' ? customHeight : undefined,
    };
    onExport(finalSettings);
  };

  if (!isOpen) return null;

  return (
    <div className="plate-export-modal-overlay" onClick={onClose}>
      <div className="plate-export-modal" onClick={(e) => e.stopPropagation()}>
        <div className="plate-export-modal-header">
          <h2>Настройки экспорта таблички</h2>
          <button className="plate-export-modal-close" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>

        <div className="plate-export-modal-content">
          {/* Выбор шаблона */}
          <div className="export-setting-group">
            <label className="export-setting-label">Шаблон таблички:</label>
            <div className="template-buttons">
              <button
                type="button"
                className={`template-button ${settings.template === 'full' ? 'active' : ''}`}
                onClick={() => handleTemplateChange('full')}
              >
                Полный
              </button>
              <button
                type="button"
                className={`template-button ${settings.template === 'minimal' ? 'active' : ''}`}
                onClick={() => handleTemplateChange('minimal')}
              >
                Минималистичный
              </button>
              <button
                type="button"
                className={`template-button ${settings.template === 'qr-only' ? 'active' : ''}`}
                onClick={() => handleTemplateChange('qr-only')}
              >
                Только QR-код
              </button>
            </div>
          </div>

          {/* Выбор размера */}
          <div className="export-setting-group">
            <label className="export-setting-label">Размер таблички:</label>
            <div className="size-buttons">
              <button
                type="button"
                className={`size-button ${settings.size === 'A4' ? 'active' : ''}`}
                onClick={() => handleSizeChange('A4')}
              >
                A4 (210×297 мм)
              </button>
              <button
                type="button"
                className={`size-button ${settings.size === 'A5' ? 'active' : ''}`}
                onClick={() => handleSizeChange('A5')}
              >
                A5 (148×210 мм)
              </button>
              <button
                type="button"
                className={`size-button ${settings.size === 'custom' ? 'active' : ''}`}
                onClick={() => handleSizeChange('custom')}
              >
                Произвольный
              </button>
            </div>
            {settings.size === 'custom' && (
              <div className="custom-size-inputs">
                <div className="custom-size-input">
                  <label>Ширина (мм):</label>
                  <input
                    type="number"
                    min="50"
                    max="500"
                    value={customWidth}
                    onChange={(e) => handleCustomSizeChange(Number(e.target.value), customHeight)}
                  />
                </div>
                <div className="custom-size-input">
                  <label>Высота (мм):</label>
                  <input
                    type="number"
                    min="50"
                    max="500"
                    value={customHeight}
                    onChange={(e) => handleCustomSizeChange(customWidth, Number(e.target.value))}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Выбор отображаемых элементов */}
          <div className="export-setting-group">
            <label className="export-setting-label">Отображаемые элементы:</label>
            <div className="field-checkboxes">
              <label className="field-checkbox">
                <input
                  type="checkbox"
                  checked={settings.showName}
                  onChange={(e) => setSettings({ ...settings, showName: e.target.checked })}
                />
                <span>Название оборудования</span>
              </label>
              <label className="field-checkbox">
                <input
                  type="checkbox"
                  checked={settings.showInventoryNumber}
                  onChange={(e) => setSettings({ ...settings, showInventoryNumber: e.target.checked })}
                />
                <span>Инвентарный номер</span>
              </label>
              <label className="field-checkbox">
                <input
                  type="checkbox"
                  checked={settings.showSpecs}
                  onChange={(e) => setSettings({ ...settings, showSpecs: e.target.checked })}
                />
                <span>Характеристики</span>
              </label>
              {settings.showSpecs && visibleSpecFields.length > 0 && (
                <div className="spec-fields-selection">
                  <div className="spec-fields-actions">
                    <button
                      type="button"
                      className="spec-field-action-button"
                      onClick={handleSelectAllSpecFields}
                    >
                      Выбрать все
                    </button>
                    <button
                      type="button"
                      className="spec-field-action-button"
                      onClick={handleDeselectAllSpecFields}
                    >
                      Снять все
                    </button>
                  </div>
                  <div className="spec-fields-list">
                    {visibleSpecFields.map(field => (
                      <label key={field.key} className="field-checkbox spec-field-checkbox">
                        <input
                          type="checkbox"
                          checked={(settings.selectedSpecFields || []).includes(field.key)}
                          onChange={() => handleFieldToggle(field.key)}
                        />
                        <span>{field.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <label className="field-checkbox">
                <input
                  type="checkbox"
                  checked={settings.showCommissioningDate}
                  onChange={(e) => setSettings({ ...settings, showCommissioningDate: e.target.checked })}
                />
                <span>Дата ввода в эксплуатацию</span>
              </label>
              <label className="field-checkbox">
                <input
                  type="checkbox"
                  checked={settings.showLastMaintenanceDate}
                  onChange={(e) => setSettings({ ...settings, showLastMaintenanceDate: e.target.checked })}
                />
                <span>Дата последнего обслуживания</span>
              </label>
              <label className="field-checkbox">
                <input
                  type="checkbox"
                  checked={settings.showQRCode}
                  onChange={(e) => setSettings({ ...settings, showQRCode: e.target.checked })}
                />
                <span>QR-код</span>
              </label>
              {settings.showQRCode && (
                <div className="qr-size-input">
                  <label>Размер QR-кода (пиксели):</label>
                  <input
                    type="number"
                    min="50"
                    max="500"
                    value={settings.qrCodeSize || 200}
                    onChange={(e) => setSettings({ ...settings, qrCodeSize: Number(e.target.value) })}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="plate-export-modal-footer">
          <button
            type="button"
            className="export-cancel-button"
            onClick={onClose}
          >
            Отмена
          </button>
          <button
            type="button"
            className="export-confirm-button"
            onClick={handleExport}
          >
            Экспортировать
          </button>
        </div>
      </div>
    </div>
  );
};

export default PlateExportSettingsModal;
