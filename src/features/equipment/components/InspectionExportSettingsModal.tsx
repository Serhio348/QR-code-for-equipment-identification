/**
 * Модальное окно настроек экспорта акта технического освидетельствования
 */

import React, { useState, useEffect } from 'react';
import { InspectionExportSettings, InspectionSize, DEFAULT_INSPECTION_EXPORT_SETTINGS } from '@/shared/types/inspectionExport';
import './InspectionExportSettingsModal.css';

interface InspectionExportSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (settings: InspectionExportSettings) => void;
  actNumber: string;
}

const InspectionExportSettingsModal: React.FC<InspectionExportSettingsModalProps> = ({
  isOpen,
  onClose,
  onExport,
  actNumber: _actNumber,
}) => {
  const [settings, setSettings] = useState<InspectionExportSettings>(DEFAULT_INSPECTION_EXPORT_SETTINGS);
  const [customWidth, setCustomWidth] = useState<number>(210); // A4 width in mm
  const [customHeight, setCustomHeight] = useState<number>(297); // A4 height in mm

  useEffect(() => {
    if (isOpen) {
      // Сбрасываем настройки при открытии
      setSettings({ ...DEFAULT_INSPECTION_EXPORT_SETTINGS });
      setCustomWidth(210);
      setCustomHeight(297);
    }
  }, [isOpen]);

  const handleSizeChange = (size: InspectionSize) => {
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

  const handlePaddingChange = (side: 'Top' | 'Bottom' | 'Left' | 'Right', value: number) => {
    setSettings({
      ...settings,
      [`padding${side}`]: value,
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
    <div className="inspection-export-modal-overlay" onClick={onClose}>
      <div className="inspection-export-modal" onClick={(e) => e.stopPropagation()}>
        <div className="inspection-export-modal-header">
          <h2>Настройки экспорта акта освидетельствования</h2>
          <button className="inspection-export-modal-close" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>

        <div className="inspection-export-modal-content">
          {/* Выбор размера */}
          <div className="export-setting-group">
            <label className="export-setting-label">Размер документа:</label>
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

          {/* Настройки отступов */}
          <div className="export-setting-group">
            <label className="export-setting-label">Отступы (мм):</label>
            <div className="padding-inputs">
              <div className="padding-input-row">
                <div className="padding-input">
                  <label>Сверху:</label>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    value={settings.paddingTop || DEFAULT_INSPECTION_EXPORT_SETTINGS.paddingTop}
                    onChange={(e) => handlePaddingChange('Top', Number(e.target.value))}
                  />
                </div>
                <div className="padding-input">
                  <label>Снизу:</label>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    value={settings.paddingBottom || DEFAULT_INSPECTION_EXPORT_SETTINGS.paddingBottom}
                    onChange={(e) => handlePaddingChange('Bottom', Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="padding-input-row">
                <div className="padding-input">
                  <label>Слева:</label>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    value={settings.paddingLeft || DEFAULT_INSPECTION_EXPORT_SETTINGS.paddingLeft}
                    onChange={(e) => handlePaddingChange('Left', Number(e.target.value))}
                  />
                </div>
                <div className="padding-input">
                  <label>Справа:</label>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    value={settings.paddingRight || DEFAULT_INSPECTION_EXPORT_SETTINGS.paddingRight}
                    onChange={(e) => handlePaddingChange('Right', Number(e.target.value))}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="inspection-export-modal-footer">
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

export default InspectionExportSettingsModal;
