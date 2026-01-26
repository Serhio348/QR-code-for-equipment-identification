import React, { useState, useEffect } from 'react';
import { FilterSpecs } from '../types/equipment';
import QRCodeComponent from '../../common/components/QRCode';
import { formatDate } from '../../../utils/dateFormatting';
import './EquipmentPlate.css';

interface EquipmentPlateProps {
  specs: FilterSpecs;
  equipmentName?: string; // Название оборудования (если не указано, используется specs.name)
  filterNumber?: number;
  commissioningDate?: string;
  lastMaintenanceDate?: string;
  qrCodeUrl?: string; // Уникальный URL для QR-кода
}

const EquipmentPlate: React.FC<EquipmentPlateProps> = ({ 
  specs, 
  equipmentName,
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
              {specs.inventoryNumber && (
                <tr data-plate-field="inventoryNumber">
                  <td className="spec-label">Инвентарный номер:</td>
                  <td className="spec-value">{specs.inventoryNumber}</td>
                </tr>
              )}
              {specs.height && (
                <tr data-plate-field="height">
                  <td className="spec-label">Высота:</td>
                  <td className="spec-value">{specs.height}</td>
                </tr>
              )}
              {specs.diameter && (
                <tr data-plate-field="diameter">
                  <td className="spec-label">Диаметр:</td>
                  <td className="spec-value">{specs.diameter}</td>
                </tr>
              )}
              {specs.capacity && (
                <tr data-plate-field="capacity">
                  <td className="spec-label">Производительность:</td>
                  <td className="spec-value">{specs.capacity}</td>
                </tr>
              )}
              {specs.filtrationArea && (
                <tr data-plate-field="filtrationArea">
                  <td className="spec-label">Площадь фильтрации:</td>
                  <td className="spec-value">{specs.filtrationArea}</td>
                </tr>
              )}
              {specs.filtrationSpeed && (
                <tr data-plate-field="filtrationSpeed">
                  <td className="spec-label">Скорость фильтрации:</td>
                  <td className="spec-value">{specs.filtrationSpeed}</td>
                </tr>
              )}
              {specs.fillingMaterial && (
                <tr data-plate-field="fillingMaterial">
                  <td className="spec-label">Засыпка:</td>
                  <td className="spec-value">{specs.fillingMaterial}</td>
                </tr>
              )}
              {specs.fillingVolume && (
                <tr data-plate-field="fillingVolume">
                  <td className="spec-label">Объем засыпки:</td>
                  <td className="spec-value">{specs.fillingVolume}</td>
                </tr>
              )}
              {specs.power && (
                <tr data-plate-field="power">
                  <td className="spec-label">Мощность:</td>
                  <td className="spec-value">{specs.power}</td>
                </tr>
              )}
              {specs.voltage && (
                <tr data-plate-field="voltage">
                  <td className="spec-label">Напряжение:</td>
                  <td className="spec-value">{specs.voltage}</td>
                </tr>
              )}
              {specs.current && (
                <tr data-plate-field="current">
                  <td className="spec-label">Ток:</td>
                  <td className="spec-value">{specs.current}</td>
                </tr>
              )}
              {specs.equipmentType && (
                <tr data-plate-field="equipmentType">
                  <td className="spec-label">Тип оборудования:</td>
                  <td className="spec-value">{specs.equipmentType}</td>
                </tr>
              )}
              {specs.protectionClass && (
                <tr data-plate-field="protectionClass">
                  <td className="spec-label">Класс защиты:</td>
                  <td className="spec-value">{specs.protectionClass}</td>
                </tr>
              )}
              {specs.fanType && (
                <tr data-plate-field="fanType">
                  <td className="spec-label">Тип вентилятора:</td>
                  <td className="spec-value">{specs.fanType}</td>
                </tr>
              )}
              {specs.pressure && (
                <tr data-plate-field="pressure">
                  <td className="spec-label">Напор:</td>
                  <td className="spec-value">{specs.pressure}</td>
                </tr>
              )}
              {specs.material && (
                <tr data-plate-field="material">
                  <td className="spec-label">Материал:</td>
                  <td className="spec-value">{specs.material}</td>
                </tr>
              )}
              {specs.workingPressure && (
                <tr data-plate-field="workingPressure">
                  <td className="spec-label">Рабочее давление:</td>
                  <td className="spec-value">{specs.workingPressure}</td>
                </tr>
              )}
              {specs.temperature && (
                <tr data-plate-field="temperature">
                  <td className="spec-label">Температура:</td>
                  <td className="spec-value">{specs.temperature}</td>
                </tr>
              )}
              {specs.head && (
                <tr data-plate-field="head">
                  <td className="spec-label">Напор:</td>
                  <td className="spec-value">{specs.head}</td>
                </tr>
              )}
              {specs.volume && (
                <tr data-plate-field="volume">
                  <td className="spec-label">Объем:</td>
                  <td className="spec-value">{specs.volume}</td>
                </tr>
              )}
              {specs.valveType && (
                <tr data-plate-field="valveType">
                  <td className="spec-label">Тип клапана:</td>
                  <td className="spec-value">{specs.valveType}</td>
                </tr>
              )}
              {specs.serialNumber && (
                <tr data-plate-field="serialNumber">
                  <td className="spec-label">Заводской номер:</td>
                  <td className="spec-value">{specs.serialNumber}</td>
                </tr>
              )}
              {specs.additionalNotes && (
                <tr data-plate-field="additionalNotes">
                  <td className="spec-label">Дополнительные характеристики:</td>
                  <td className="spec-value" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {specs.additionalNotes}
                  </td>
                </tr>
              )}
              <tr className="date-row" data-plate-field="commissioningDate">
                <td className="spec-label">Дата ввода в эксплуатацию:</td>
                <td className="spec-value">{formatDate(commissioningDate)}</td>
              </tr>
              <tr className="date-row" data-plate-field="lastMaintenanceDate">
                <td className="spec-label">Дата последнего обслуживания:</td>
                <td className="spec-value">{formatDate(lastMaintenanceDate)}</td>
              </tr>
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

