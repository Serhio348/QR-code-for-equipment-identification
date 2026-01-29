import React, { useState, useEffect } from 'react';
import { EquipmentSpecs } from '../types/equipment';
import { getAllSpecFieldsForType } from '../constants/equipmentSpecFields';
import QRCodeComponent from '../../common/components/QRCode';
import { formatDate } from '@/shared/utils/dateFormatting';
import './EquipmentPlate.css';

interface EquipmentPlateProps {
  specs: EquipmentSpecs;
  equipmentName?: string; // Название оборудования (если не указано, используется specs.name)
  equipmentType?: string; // Тип оборудования для определения полей
  filterNumber?: number;
  commissioningDate?: string;
  lastMaintenanceDate?: string;
  qrCodeUrl?: string; // Уникальный URL для QR-кода
}

const EquipmentPlate: React.FC<EquipmentPlateProps> = ({ 
  specs, 
  equipmentName,
  equipmentType = 'other',
  commissioningDate, 
  lastMaintenanceDate,
  qrCodeUrl
}) => {
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  
  // Используем переданный URL или дефолтный
  const defaultUrl = 'https://drive.google.com/drive/folders/1t90itk12veviwYM1LH7DZ15G4slpPnon';
  const urlForQR = qrCodeUrl || defaultUrl;
  
  // Используем переданное название оборудования или название из specs
  const displayName = equipmentName || specs.name || 'Оборудование';
  
  // Получаем список полей для текущего типа оборудования
  const specFields = getAllSpecFieldsForType(equipmentType as any);
  
  const handleQRClick = () => {
    setIsQRModalOpen(true);
  };
  
  const handleCloseModal = () => {
    setIsQRModalOpen(false);
  };
  
  const handleModalBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      handleCloseModal();
    }
  };
  
  // Закрытие по Escape и блокировка прокрутки
  useEffect(() => {
    if (isQRModalOpen) {
      // Блокируем прокрутку body
      document.body.style.overflow = 'hidden';
      
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          handleCloseModal();
        }
      };
      
      window.addEventListener('keydown', handleEscape);
      
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleEscape);
      };
    }
  }, [isQRModalOpen]);

  return (
    <div className="equipment-plate" id="equipment-plate" data-plate-element="container">
      <div className="plate-header" data-plate-element="header">
        <h1 className="equipment-name">{displayName}</h1>
      </div>
      
      <div className="plate-content">
        <div className="specs-table" data-plate-element="specs-table">
          <table>
            <tbody>
              {/* Динамически рендерим все поля из конфигурации для текущего типа оборудования */}
              {specFields.map(field => {
                const value = specs[field.key];
                // Пропускаем поля без значения (кроме дат, которые обрабатываются отдельно)
                if (!value && field.key !== 'nextTestDate') {
                  return null;
                }
                
                // Специальная обработка для даты следующего испытания
                if (field.key === 'nextTestDate') {
                  return value ? (
                    <tr key={field.key} data-plate-field={field.key}>
                      <td className="spec-label">{field.label}:</td>
                      <td className="spec-value">{formatDate(value as string)}</td>
                    </tr>
                  ) : null;
                }
                
                // Обычные поля
                return (
                  <tr key={field.key} data-plate-field={field.key}>
                    <td className="spec-label">{field.label}:</td>
                    <td className="spec-value" style={field.key === 'additionalNotes' ? { whiteSpace: 'pre-wrap', wordBreak: 'break-word' } : undefined}>
                      {String(value)}
                    </td>
                  </tr>
                );
              })}
              
              {/* Даты ввода в эксплуатацию и последнего обслуживания (всегда показываются, если есть) */}
              {commissioningDate && (
                <tr className="date-row" data-plate-field="commissioningDate">
                  <td className="spec-label">Дата ввода в эксплуатацию:</td>
                  <td className="spec-value">{formatDate(commissioningDate)}</td>
                </tr>
              )}
              {lastMaintenanceDate && (
                <tr className="date-row" data-plate-field="lastMaintenanceDate">
                  <td className="spec-label">Дата последнего обслуживания:</td>
                  <td className="spec-value">{formatDate(lastMaintenanceDate)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        <div className="qr-section" data-plate-element="qr-section">
          <div className="qr-code-clickable" onClick={handleQRClick}>
            <QRCodeComponent url={urlForQR} />
          </div>
          <p className="qr-label">Отсканируйте для получения дополнительной информации</p>
        </div>
      </div>
      
      {/* Модальное окно с увеличенным QR-кодом */}
      {isQRModalOpen && (
        <div className="qr-modal-overlay" onClick={handleModalBackdropClick}>
          <div className="qr-modal-content">
            <button 
              className="qr-modal-close" 
              onClick={handleCloseModal}
              aria-label="Закрыть"
            >
              ×
            </button>
            <div className="qr-modal-qr">
              <QRCodeComponent url={urlForQR} size={400} />
            </div>
            <p className="qr-modal-label">Отсканируйте для получения полной информации</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default EquipmentPlate;

