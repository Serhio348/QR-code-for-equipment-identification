import React from 'react';
import { FilterSpecs } from '../types/equipment';
import QRCodeComponent from './QRCode';
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
  // Используем переданный URL или дефолтный
  const defaultUrl = 'https://drive.google.com/drive/folders/1t90itk12veviwYM1LH7DZ15G4slpPnon';
  const urlForQR = qrCodeUrl || defaultUrl;
  
  // Используем переданное название оборудования или название из specs
  const displayName = equipmentName || specs.name || 'Оборудование';
  
  const formatDate = (dateString?: string) => {
    if (!dateString) return '—';
    
    // Убираем возможное время из строки даты (если есть)
    // Например: "2024-01-15T00:00:00.000Z" -> "2024-01-15"
    const dateOnly = dateString.split('T')[0].split(' ')[0].trim();
    
    // Проверяем, что это формат YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
      const [year, month, day] = dateOnly.split('-').map(Number);
      
      // ВАЖНО: НЕ используем new Date() для создания даты, так как это может вызвать проблемы
      // Вместо этого форматируем напрямую из компонентов строки
      // Это гарантирует, что дата не будет сдвигаться из-за часовых поясов
      const months = [
        'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
        'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
      ];
      
      // Проверяем валидность месяца и дня
      if (month < 1 || month > 12 || day < 1 || day > 31) {
        return '—';
      }
      
      return `${day} ${months[month - 1]} ${year} г.`;
    }
    
    // Для других форматов пытаемся извлечь дату без использования new Date()
    const match = dateString.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [, year, month, day] = match.map(Number);
      const months = [
        'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
        'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
      ];
      
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${day} ${months[month - 1]} ${year} г.`;
      }
    }
    
    return '—';
  };
  
  return (
    <div className="equipment-plate" id="equipment-plate">
      <div className="plate-header">
        <h1 className="equipment-name">{displayName}</h1>
      </div>
      
      <div className="plate-content">
        <div className="specs-table">
          <table>
            <tbody>
              {specs.inventoryNumber && (
                <tr>
                  <td className="spec-label">Инвентарный номер:</td>
                  <td className="spec-value">{specs.inventoryNumber}</td>
                </tr>
              )}
              {specs.height && (
                <tr>
                  <td className="spec-label">Высота:</td>
                  <td className="spec-value">{specs.height}</td>
                </tr>
              )}
              {specs.diameter && (
                <tr>
                  <td className="spec-label">Диаметр:</td>
                  <td className="spec-value">{specs.diameter}</td>
                </tr>
              )}
              {specs.capacity && (
                <tr>
                  <td className="spec-label">Производительность:</td>
                  <td className="spec-value">{specs.capacity}</td>
                </tr>
              )}
              {specs.filtrationArea && (
                <tr>
                  <td className="spec-label">Площадь фильтрации:</td>
                  <td className="spec-value">{specs.filtrationArea}</td>
                </tr>
              )}
              {specs.filtrationSpeed && (
                <tr>
                  <td className="spec-label">Скорость фильтрации:</td>
                  <td className="spec-value">{specs.filtrationSpeed}</td>
                </tr>
              )}
              {specs.fillingMaterial && (
                <tr>
                  <td className="spec-label">Засыпка:</td>
                  <td className="spec-value">{specs.fillingMaterial}</td>
                </tr>
              )}
              {specs.fillingVolume && (
                <tr>
                  <td className="spec-label">Объем засыпки:</td>
                  <td className="spec-value">{specs.fillingVolume}</td>
                </tr>
              )}
              {specs.power && (
                <tr>
                  <td className="spec-label">Мощность:</td>
                  <td className="spec-value">{specs.power}</td>
                </tr>
              )}
              {specs.voltage && (
                <tr>
                  <td className="spec-label">Напряжение:</td>
                  <td className="spec-value">{specs.voltage}</td>
                </tr>
              )}
              {specs.current && (
                <tr>
                  <td className="spec-label">Ток:</td>
                  <td className="spec-value">{specs.current}</td>
                </tr>
              )}
              {specs.equipmentType && (
                <tr>
                  <td className="spec-label">Тип оборудования:</td>
                  <td className="spec-value">{specs.equipmentType}</td>
                </tr>
              )}
              {specs.protectionClass && (
                <tr>
                  <td className="spec-label">Класс защиты:</td>
                  <td className="spec-value">{specs.protectionClass}</td>
                </tr>
              )}
              {specs.fanType && (
                <tr>
                  <td className="spec-label">Тип вентилятора:</td>
                  <td className="spec-value">{specs.fanType}</td>
                </tr>
              )}
              {specs.pressure && (
                <tr>
                  <td className="spec-label">Напор:</td>
                  <td className="spec-value">{specs.pressure}</td>
                </tr>
              )}
              {specs.material && (
                <tr>
                  <td className="spec-label">Материал:</td>
                  <td className="spec-value">{specs.material}</td>
                </tr>
              )}
              {specs.workingPressure && (
                <tr>
                  <td className="spec-label">Рабочее давление:</td>
                  <td className="spec-value">{specs.workingPressure}</td>
                </tr>
              )}
              {specs.temperature && (
                <tr>
                  <td className="spec-label">Температура:</td>
                  <td className="spec-value">{specs.temperature}</td>
                </tr>
              )}
              {specs.head && (
                <tr>
                  <td className="spec-label">Напор:</td>
                  <td className="spec-value">{specs.head}</td>
                </tr>
              )}
              {specs.volume && (
                <tr>
                  <td className="spec-label">Объем:</td>
                  <td className="spec-value">{specs.volume}</td>
                </tr>
              )}
              {specs.valveType && (
                <tr>
                  <td className="spec-label">Тип клапана:</td>
                  <td className="spec-value">{specs.valveType}</td>
                </tr>
              )}
              {specs.serialNumber && (
                <tr>
                  <td className="spec-label">Заводской номер:</td>
                  <td className="spec-value">{specs.serialNumber}</td>
                </tr>
              )}
              <tr className="date-row">
                <td className="spec-label">Дата ввода в эксплуатацию:</td>
                <td className="spec-value">{formatDate(commissioningDate)}</td>
              </tr>
              <tr className="date-row">
                <td className="spec-label">Дата последнего обслуживания:</td>
                <td className="spec-value">{formatDate(lastMaintenanceDate)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <div className="qr-section">
          <QRCodeComponent url={urlForQR} />
          <p className="qr-label">Отсканируйте для получения полной информации</p>
        </div>
      </div>
    </div>
  );
};

export default EquipmentPlate;

