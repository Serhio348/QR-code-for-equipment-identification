/**
 * DevicePassportModal
 *
 * Модальное окно паспорта счётчика: отображение и редактирование
 * основных и паспортных данных, печать, сохранение в PDF.
 * Поддерживает перетаскивание за заголовок.
 */

import React from 'react';
import { BeliotDevice } from '../services/beliotDeviceApi';
import { PassportData } from '../hooks/useDevicePassport';

interface DevicePassportModalProps {
  passportDevice: BeliotDevice;
  passportData: PassportData;
  setPassportData: (data: PassportData) => void;
  passportSaving: boolean;
  passportModalPosition: { x: number; y: number };
  isDraggingPassport: boolean;
  getDeviceName: (device: BeliotDevice) => string;
  handleClosePassport: () => void;
  handleSavePassport: () => Promise<void>;
  handlePassportModalMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  handlePrintPassport: () => void;
  handleSavePassportAsPDF: () => Promise<void>;
}

const DevicePassportModal: React.FC<DevicePassportModalProps> = ({
  passportDevice,
  passportData,
  setPassportData,
  passportSaving,
  passportModalPosition,
  isDraggingPassport,
  getDeviceName,
  handleClosePassport,
  handleSavePassport,
  handlePassportModalMouseDown,
  handlePrintPassport,
  handleSavePassportAsPDF,
}) => {
  return (
    <>
      {/* Затемнённый фон */}
      <div
        className="passport-modal-overlay"
        onClick={handleClosePassport}
      />

      {/* Модальное окно */}
      <div
        className="passport-modal"
        style={{
          transform:
            passportModalPosition.x !== 0 || passportModalPosition.y !== 0
              ? `translate(calc(-50% + ${passportModalPosition.x}px), calc(-50% + ${passportModalPosition.y}px))`
              : 'translate(-50%, -50%)',
          cursor: isDraggingPassport ? 'grabbing' : 'default',
        }}
      >
        {/* Заголовок с кнопками — поддерживает drag */}
        <div
          className="passport-modal-header"
          onMouseDown={handlePassportModalMouseDown}
          style={{ cursor: isDraggingPassport ? 'grabbing' : 'grab' }}
        >
          <button
            className="passport-btn-back"
            onClick={handleClosePassport}
            title="Назад к списку счетчиков"
            onMouseDown={(e) => e.stopPropagation()}
          >
            ← Назад
          </button>
          <h3>Паспорт счетчика: {getDeviceName(passportDevice)}</h3>
          <div className="passport-modal-header-actions">
            <button
              className="passport-btn-print"
              onClick={handlePrintPassport}
              title="Печать"
              onMouseDown={(e) => e.stopPropagation()}
            >
              🖨️ Печать
            </button>
            <button
              className="passport-btn-pdf"
              onClick={handleSavePassportAsPDF}
              title="Сохранить в PDF"
              onMouseDown={(e) => e.stopPropagation()}
            >
              📄 PDF
            </button>
            <button
              className="passport-modal-close"
              onClick={handleClosePassport}
              title="Закрыть"
              onMouseDown={(e) => e.stopPropagation()}
            >
              ×
            </button>
          </div>
        </div>

        <div className="passport-modal-content">
          {/* Основные данные */}
          <div className="passport-section">
            <h4>Основные данные</h4>
            <div className="passport-form-grid">
              <div className="passport-form-field">
                <label>Название счетчика:</label>
                <input
                  type="text"
                  className="passport-input"
                  value={passportData.name}
                  onChange={(e) => setPassportData({ ...passportData, name: e.target.value })}
                  placeholder="Введите название"
                />
              </div>

              <div className="passport-form-field">
                <label>Серийный номер:</label>
                <input
                  type="text"
                  className="passport-input"
                  value={passportData.serialNumber}
                  onChange={(e) => setPassportData({ ...passportData, serialNumber: e.target.value })}
                  placeholder="Введите серийный номер"
                />
              </div>

              <div className="passport-form-field">
                <label>Объект:</label>
                <input
                  type="text"
                  className="passport-input"
                  value={passportData.object}
                  onChange={(e) => setPassportData({ ...passportData, object: e.target.value })}
                  placeholder="Введите объект"
                />
              </div>

              <div className="passport-form-field">
                <label>Роль в водном балансе:</label>
                <select
                  className="passport-input"
                  value={passportData.deviceRole}
                  onChange={(e) =>
                    setPassportData({
                      ...passportData,
                      deviceRole: e.target.value as 'source' | 'production' | 'domestic' | '',
                    })
                  }
                >
                  <option value="">— не указана —</option>
                  <option value="source">🚰 Источник (скважина)</option>
                  <option value="production">🏭 Производство</option>
                  <option value="domestic">🏠 Хоз-питьевое водоснабжение</option>
                </select>
              </div>
            </div>
          </div>

          {/* Паспортные данные */}
          <div className="passport-section">
            <h4>Паспортные данные</h4>
            <div className="passport-form-grid">
              <div className="passport-form-field">
                <label>Дата выпуска:</label>
                <input
                  type="date"
                  className="passport-input"
                  value={passportData.manufactureDate}
                  onChange={(e) => setPassportData({ ...passportData, manufactureDate: e.target.value })}
                />
              </div>

              <div className="passport-form-field">
                <label>Производитель:</label>
                <input
                  type="text"
                  className="passport-input"
                  value={passportData.manufacturer}
                  onChange={(e) => setPassportData({ ...passportData, manufacturer: e.target.value })}
                  placeholder="Введите производителя"
                />
              </div>

              <div className="passport-form-field">
                <label>Дата поверки:</label>
                <input
                  type="date"
                  className="passport-input"
                  value={passportData.verificationDate}
                  onChange={(e) => setPassportData({ ...passportData, verificationDate: e.target.value })}
                />
              </div>

              <div className="passport-form-field">
                <label>Дата следующей поверки:</label>
                <input
                  type="date"
                  className="passport-input"
                  value={passportData.nextVerificationDate}
                  onChange={(e) =>
                    setPassportData({ ...passportData, nextVerificationDate: e.target.value })
                  }
                />
              </div>
            </div>
          </div>

          {/* Кнопки действий */}
          <div className="passport-modal-actions">
            <button
              className="passport-btn-save"
              onClick={handleSavePassport}
              disabled={passportSaving}
            >
              {passportSaving ? 'Сохранение...' : '💾 Сохранить'}
            </button>
            <button
              className="passport-btn-cancel"
              onClick={handleClosePassport}
              disabled={passportSaving}
            >
              Отмена
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default DevicePassportModal;
