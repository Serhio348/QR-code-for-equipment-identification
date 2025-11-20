import React from 'react';
import { FilterSpecs } from '../types/equipment';
import QRCodeComponent from './QRCode';
import './EquipmentPlate.css';

interface EquipmentPlateProps {
  specs: FilterSpecs;
  filterNumber?: number;
  commissioningDate?: string;
  lastMaintenanceDate?: string;
}

const EquipmentPlate: React.FC<EquipmentPlateProps> = ({ 
  specs, 
  filterNumber, 
  commissioningDate, 
  lastMaintenanceDate 
}) => {
  // Прямая ссылка на Google Drive с документацией
  const googleDriveUrl = 'https://drive.google.com/drive/folders/1t90itk12veviwYM1LH7DZ15G4slpPnon';
  
  const formatDate = (dateString?: string) => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };
  
  return (
    <div className="equipment-plate" id="equipment-plate">
      <div className="plate-header">
        <h1 className="equipment-name">{specs.name}</h1>
        {filterNumber && <div className="filter-number">Фильтр №{filterNumber}</div>}
      </div>
      
      <div className="plate-content">
        <div className="specs-table">
          <table>
            <tbody>
              <tr>
                <td className="spec-label">Высота:</td>
                <td className="spec-value">{specs.height}</td>
              </tr>
              <tr>
                <td className="spec-label">Диаметр:</td>
                <td className="spec-value">{specs.diameter}</td>
              </tr>
              <tr>
                <td className="spec-label">Производительность:</td>
                <td className="spec-value">{specs.capacity}</td>
              </tr>
              <tr>
                <td className="spec-label">Площадь фильтрации:</td>
                <td className="spec-value">{specs.filtrationArea}</td>
              </tr>
              <tr>
                <td className="spec-label">Скорость фильтрации:</td>
                <td className="spec-value">{specs.filtrationSpeed}</td>
              </tr>
              <tr>
                <td className="spec-label">Засыпка:</td>
                <td className="spec-value">{specs.fillingMaterial}</td>
              </tr>
              <tr>
                <td className="spec-label">Объем засыпки:</td>
                <td className="spec-value">{specs.fillingVolume}</td>
              </tr>
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
          <QRCodeComponent url={googleDriveUrl} />
          <p className="qr-label">Отсканируйте для получения полной информации</p>
        </div>
      </div>
    </div>
  );
};

export default EquipmentPlate;

