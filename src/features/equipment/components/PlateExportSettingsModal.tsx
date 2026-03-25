/**
 * Модальное окно настроек экспорта таблички оборудования
 */

import React, { useRef, useState, useEffect, useMemo } from 'react';
import { PlateExportSettings, PlateSize, PlateTemplate, DEFAULT_EXPORT_SETTINGS, PLATE_TEMPLATES } from '@/shared/types/plateExport';
import { EquipmentType, EquipmentSpecs } from '../types/equipment';
import { getAllSpecFieldsForType } from '../constants/equipmentSpecFields';
import './PlateExportSettingsModal.css';

interface PlateExportSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (settings: PlateExportSettings) => void;
  equipmentName: string;
  specs: EquipmentSpecs;
  equipmentType: EquipmentType;
}

const PlateExportSettingsModal: React.FC<PlateExportSettingsModalProps> = ({
  isOpen,
  onClose,
  onExport,
  equipmentName: _equipmentName,
  specs,
  equipmentType,
}) => {
  const [settings, setSettings] = useState<PlateExportSettings>(DEFAULT_EXPORT_SETTINGS);
  const [customWidth, setCustomWidth] = useState<number>(210); // A4 width in mm
  const [customHeight, setCustomHeight] = useState<number>(297); // A4 height in mm
  const [customWidthInput, setCustomWidthInput] = useState<string>('210');
  const [customHeightInput, setCustomHeightInput] = useState<string>('297');
  const backdropMouseDown = useRef(false);

  // Мемоизируем список полей для текущего типа оборудования
  const availableSpecFields = useMemo(() => {
    return getAllSpecFieldsForType(equipmentType);
  }, [equipmentType]);

  // Фильтруем только те поля, которые есть в specs (имеют значение)
  const visibleSpecFields = useMemo(() => {
    return availableSpecFields.filter(field => {
      const value = specs[field.key];
      return value !== undefined && value !== null && value !== '';
    });
  }, [availableSpecFields, specs]);

  // Мемоизируем строку ключей для стабильного сравнения в useEffect
  const visibleSpecFieldKeysString = useMemo(() => {
    return visibleSpecFields.map(f => f.key).join(',');
  }, [visibleSpecFields]);

  useEffect(() => {
    if (isOpen) {
      // Сбрасываем настройки при открытии
      const defaultSettings = { ...DEFAULT_EXPORT_SETTINGS };
      // При открытии модального окна инициализируем всеми видимыми полями
      defaultSettings.selectedSpecFields = visibleSpecFieldKeysString ? visibleSpecFieldKeysString.split(',') : [];
      setSettings(defaultSettings);
    }
  }, [isOpen, visibleSpecFieldKeysString]);

  useEffect(() => {
    if (isOpen) {
      setCustomWidthInput(customWidth.toString());
      setCustomHeightInput(customHeight.toString());
    }
  }, [customHeight, customWidth, isOpen]);

  const handleTemplateChange = (template: PlateTemplate) => {
    const templateSettings = PLATE_TEMPLATES[template];
    setSettings((prev) => ({
      ...prev,
      ...templateSettings,
      template,
    }));
  };

  const handleSizeChange = (size: PlateSize) => {
    setSettings((prev) => ({
      ...prev,
      size,
    }));
  };

  const handleCustomSizeChange = (width: number, height: number) => {
    setCustomWidth(width);
    setCustomHeight(height);
    setCustomWidthInput(width.toString());
    setCustomHeightInput(height.toString());
    setSettings((prev) => ({
      ...prev,
      size: 'custom',
      customWidth: width,
      customHeight: height,
    }));
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
    <div
      className="plate-export-modal-overlay"
      onMouseDown={(e) => {
        backdropMouseDown.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e) => {
        const isBackdrop = e.target === e.currentTarget;
        if (backdropMouseDown.current && isBackdrop) {
          onClose();
        }
        backdropMouseDown.current = false;
      }}
    >
      <div className="plate-export-modal" onClick={(e) => e.stopPropagation()}>
        <div className="plate-export-modal-header">
          <h2>Настройки экспорта таблички</h2>
          <button className="plate-export-modal-close" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>

        <div className="plate-export-modal-content">
          {/* Выбор шаблона */}
          <div className="plate-export-setting-group">
            <label className="plate-export-setting-label">Шаблон таблички:</label>
            <div className="plate-export-template-buttons">
              <button
                type="button"
                className={`plate-export-template-button ${settings.template === 'full' ? 'active' : ''}`}
                onClick={() => handleTemplateChange('full')}
              >
                Полный
              </button>
              <button
                type="button"
                className={`plate-export-template-button ${settings.template === 'minimal' ? 'active' : ''}`}
                onClick={() => handleTemplateChange('minimal')}
              >
                Минималистичный
              </button>
              <button
                type="button"
                className={`plate-export-template-button ${settings.template === 'qr-only' ? 'active' : ''}`}
                onClick={() => handleTemplateChange('qr-only')}
              >
                Только QR-код
              </button>
            </div>
          </div>

          {/* Выбор размера */}
          <div className="plate-export-setting-group">
            <label className="plate-export-setting-label">Размер таблички:</label>
            <div className="plate-export-size-buttons">
              <button
                type="button"
                className={`plate-export-size-button ${settings.size === 'A4' ? 'active' : ''}`}
                onClick={() => handleSizeChange('A4')}
              >
                A4 (210×297 мм)
              </button>
              <button
                type="button"
                className={`plate-export-size-button ${settings.size === 'A5' ? 'active' : ''}`}
                onClick={() => handleSizeChange('A5')}
              >
                A5 (148×210 мм)
              </button>
              <button
                type="button"
                className={`plate-export-size-button ${settings.size === 'custom' ? 'active' : ''}`}
                onClick={() => handleSizeChange('custom')}
              >
                Произвольный
              </button>
            </div>
            {settings.size === 'custom' && (
              <div className="plate-export-custom-size-inputs">
                <div className="plate-export-custom-size-input">
                  <label>Ширина (мм):</label>
                  <input
                    type="number"
                    min="10"
                    max="500"
                    placeholder="210"
                    value={customWidthInput}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setCustomWidthInput(raw);
                      if (raw === '') return;
                      const parsed = Number.parseInt(raw, 10);
                      if (Number.isFinite(parsed) && parsed > 0) {
                        handleCustomSizeChange(parsed, customHeight);
                      }
                    }}
                  />
                </div>
                <div className="plate-export-custom-size-input">
                  <label>Высота (мм):</label>
                  <input
                    type="number"
                    min="10"
                    max="500"
                    placeholder="297"
                    value={customHeightInput}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setCustomHeightInput(raw);
                      if (raw === '') return;
                      const parsed = Number.parseInt(raw, 10);
                      if (Number.isFinite(parsed) && parsed > 0) {
                        handleCustomSizeChange(customWidth, parsed);
                      }
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Выбор отображаемых элементов */}
          <div className="plate-export-setting-group">
            <label className="plate-export-setting-label">Отображаемые элементы:</label>
            <div className="plate-export-field-checkboxes">
              <label className="plate-export-field-checkbox">
                <input
                  type="checkbox"
                  checked={settings.showName}
                  onChange={(e) => setSettings((prev) => ({ ...prev, showName: e.target.checked }))}
                />
                <span>Название оборудования</span>
              </label>
              <label className="plate-export-field-checkbox">
                <input
                  type="checkbox"
                  checked={settings.showInventoryNumber}
                  onChange={(e) => setSettings((prev) => ({ ...prev, showInventoryNumber: e.target.checked }))}
                />
                <span>Инвентарный номер</span>
              </label>
              <label className="plate-export-field-checkbox">
                <input
                  type="checkbox"
                  checked={settings.showSpecs}
                  onChange={(e) => setSettings((prev) => ({ ...prev, showSpecs: e.target.checked }))}
                />
                <span>Характеристики</span>
              </label>
              {settings.showSpecs && visibleSpecFields.length > 0 && (
                <div className="plate-export-spec-fields-selection">
                  <div className="plate-export-spec-fields-actions">
                    <button
                      type="button"
                      className="plate-export-spec-field-action-button"
                      onClick={handleSelectAllSpecFields}
                    >
                      Выбрать все
                    </button>
                    <button
                      type="button"
                      className="plate-export-spec-field-action-button"
                      onClick={handleDeselectAllSpecFields}
                    >
                      Снять все
                    </button>
                  </div>
                  <div className="plate-export-spec-fields-list">
                    {visibleSpecFields.map(field => (
                      <label key={field.key} className="plate-export-field-checkbox plate-export-spec-field-checkbox">
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
              <label className="plate-export-field-checkbox">
                <input
                  type="checkbox"
                  checked={settings.showCommissioningDate}
                  onChange={(e) => setSettings((prev) => ({ ...prev, showCommissioningDate: e.target.checked }))}
                />
                <span>Дата ввода в эксплуатацию</span>
              </label>
              <label className="plate-export-field-checkbox">
                <input
                  type="checkbox"
                  checked={settings.showLastMaintenanceDate}
                  onChange={(e) => setSettings((prev) => ({ ...prev, showLastMaintenanceDate: e.target.checked }))}
                />
                <span>Дата последнего обслуживания</span>
              </label>
              <label className="plate-export-field-checkbox">
                <input
                  type="checkbox"
                  checked={settings.showQRCode}
                  onChange={(e) => setSettings((prev) => ({ ...prev, showQRCode: e.target.checked }))}
                />
                <span>QR-код</span>
              </label>
              {settings.showQRCode && (
                <div className="plate-export-qr-size-input">
                  <label className="plate-export-field-checkbox" style={{ margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={settings.qrCodeAuto}
                      onChange={(e) => setSettings((prev) => ({ ...prev, qrCodeAuto: e.target.checked }))}
                    />
                    <span>Авто размер QR</span>
                  </label>
                  <label style={{ marginTop: 8 }}>Размер QR-кода (пиксели):</label>
                  <input
                    type="number"
                    min="10"
                    max="500"
                    placeholder="200"
                    value={settings.qrCodeSize ?? ''}
                    disabled={settings.qrCodeAuto}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === '') {
                        setSettings((prev) => ({ ...prev, qrCodeSize: undefined }));
                        return;
                      }
                      const parsed = Number.parseInt(raw, 10);
                      setSettings((prev) => ({ ...prev, qrCodeSize: Number.isFinite(parsed) ? parsed : undefined }));
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="plate-export-modal-footer">
          <button
            type="button"
            className="plate-export-cancel-button"
            onClick={onClose}
          >
            Отмена
          </button>
          <button
            type="button"
            className="plate-export-confirm-button"
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
