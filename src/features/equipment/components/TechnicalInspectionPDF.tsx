/**
 * TechnicalInspectionPDF.tsx
 * 
 * Компонент для отображения акта технического освидетельствования
 * Используется для генерации PDF
 * Структура соответствует официальному образцу акта
 */

import React from 'react';
import { Equipment } from '../types/equipment';
import { TechnicalInspectionData } from '../types/technicalInspection';
import './TechnicalInspectionPDF.css';

interface TechnicalInspectionPDFProps {
  equipment: Equipment;
  inspectionData: TechnicalInspectionData;
}

export const TechnicalInspectionPDF: React.FC<TechnicalInspectionPDFProps> = ({
  equipment,
  inspectionData
}) => {
  const formatDateForDisplay = (dateString: string) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;
      const day = date.getDate();
      const month = date.toLocaleDateString('ru-RU', { month: 'long' });
      const year = date.getFullYear();
      return `« ${day} » ${month} ${year}г.`;
    } catch {
      return dateString;
    }
  };

  const getNextInspectionDate = () => {
    // Если дата следующего освидетельствования указана вручную, используем её
    if (inspectionData.nextInspectionDate) {
      return formatDateForDisplay(inspectionData.nextInspectionDate);
    }

    // Иначе вычисляем автоматически: дата освидетельствования + 1 год
    if (inspectionData.inspectionDate) {
      try {
        const currentDate = new Date(inspectionData.inspectionDate);
        if (!isNaN(currentDate.getTime())) {
          // Добавляем 1 год к дате освидетельствования
          currentDate.setFullYear(currentDate.getFullYear() + 1);
          return formatDateForDisplay(currentDate.toISOString().split('T')[0]);
        }
      } catch {
        return '';
      }
    }

    return '';
  };

  const getCity = () => {
    return inspectionData.city || 'г. Брест';
  };

  const getOrganization = () => {
    return inspectionData.organization || '_____________________________________________________';
  };

  const getBoilersCount = () => {
    return inspectionData.boilersCount || '___';
  };

  const getSafetyDeviceType = () => {
    return inspectionData.safetyDeviceType || '____________________________________________________';
  };

  const getFacilityInfo = () => {
    const name = inspectionData.facilityName || '';
    const address = inspectionData.facilityAddress || '';
    if (name || address) {
      return `${name}${name && address ? ', ' : ''}${address}`;
    }
    return '_____________________________________________________';
  };

  return (
    <div className="technical-inspection-pdf" id="technical-inspection-pdf">
      <div className="inspection-header">
        <p className="act-location-date">
          {getCity()} {formatDateForDisplay(inspectionData.inspectionDate)}
        </p>
        <h1>АКТ</h1>
        {inspectionData.actNumber && (
          <p className="act-number">№ {inspectionData.actNumber}</p>
        )}
        <h2>технического освидетельствования котлов</h2>
        <h2>и предохранительных устройств</h2>
      </div>

      <div className="inspection-content">
        <div className="inspection-section">
          <p className="organization-label">Организация</p>
          <p className="underline-field">{getOrganization()}</p>
        </div>

        <div className="inspection-section">
          <p className="commission-intro">
            Мы, нижеподписавшиеся, комиссия в составе:
          </p>
          
          <div className="commission-members-list">
            {/* Председатель комиссии */}
            <div className="commission-member-line">
              <span className="member-position">
                {inspectionData.commissionChairmanPosition || 'Председатель комиссии'}
              </span>
              <span className="member-name-inline">
                {inspectionData.commissionChairman}
              </span>
            </div>

            {/* Члены комиссии */}
            {inspectionData.commissionMembers
              .filter(member => member.name.trim() !== '')
              .map((member, index) => (
                <div key={index} className="commission-member-line">
                  <span className="member-position">
                    {member.position || 'Член комиссии'}
                  </span>
                  <span className="member-name-inline">
                    {member.name}
                  </span>
                </div>
              ))}
          </div>
          
          <p className="member-note">(должность, ф.и.о. членов комиссии)</p>
        </div>

        <div className="inspection-section">
          <p className="inspection-text">
            составили настоящий акт в том, что произведено техническое
            освидетельствование котлов{' '}
            <span className="equipment-name">{equipment.name}</span> в
            количестве <strong>{getBoilersCount()}</strong> шт., а также произведена проверка
            исправности действия предохранительных устройств
          </p>
          
          <p className="safety-device-info">
            {getSafetyDeviceType()}
          </p>
          <p className="safety-device-note">(тип, марка предохранительного устройства)</p>
          
          <p className="facility-info">
            установленных в котельной {getFacilityInfo()}
          </p>
          <p className="facility-note">(наименование и адрес объекта)</p>
          
          {/* Характеристики оборудования */}
          {(inspectionData.registrationNumber || inspectionData.serialNumber || inspectionData.energySourceType || inspectionData.powerKw || inspectionData.workingPressure) && (
            <div className="equipment-details-section">
              <p className="equipment-details-label">Характеристики оборудования:</p>
              {inspectionData.registrationNumber && (
                <p className="equipment-detail-item">
                  <span className="detail-label">Регистрационный номер:</span> {inspectionData.registrationNumber}
                </p>
              )}
              {inspectionData.serialNumber && (
                <p className="equipment-detail-item">
                  <span className="detail-label">Серийный номер:</span> {inspectionData.serialNumber}
                </p>
              )}
              {inspectionData.energySourceType && (
                <p className="equipment-detail-item">
                  <span className="detail-label">Тип энергоисточника:</span> {inspectionData.energySourceType}
                </p>
              )}
              {inspectionData.powerKw && (
                <p className="equipment-detail-item">
                  <span className="detail-label">Мощность:</span> {inspectionData.powerKw} кВт
                </p>
              )}
              {inspectionData.workingPressure && (
                <p className="equipment-detail-item">
                  <span className="detail-label">Рабочее давление:</span> {inspectionData.workingPressure}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Результаты освидетельствования */}
        {(inspectionData.externalInspection || inspectionData.hydraulicTest || inspectionData.safetyValvesCheck || inspectionData.safetyAutomationCheck || inspectionData.instrumentsCheck) && (
          <div className="inspection-section results-section" data-no-break-section="true">
            <p className="results-label">РЕЗУЛЬТАТЫ ОСВИДЕТЕЛЬСТВОВАНИЯ:</p>

            <div className="results-grid">
              {/* Левый столбец - первые 3 секции */}
              <div className="results-column">
                {inspectionData.externalInspection && (
                  <div className="result-item" data-no-break="true">
                    <p className="result-label">Внешний осмотр:</p>
                    <p className="result-text">{inspectionData.externalInspection}</p>
                  </div>
                )}

                {inspectionData.hydraulicTest && (
                  <div className="result-item" data-no-break="true">
                    <p className="result-label">Гидравлическое испытание:</p>
                    <p className="result-text">{inspectionData.hydraulicTest}</p>
                  </div>
                )}

                {inspectionData.safetyValvesCheck && (
                  <div className="result-item" data-no-break="true">
                    <p className="result-label">Проверка предохранительных клапанов:</p>
                    <p className="result-text">{inspectionData.safetyValvesCheck}</p>
                  </div>
                )}
              </div>

              {/* Правый столбец - последние 2 секции */}
              <div className="results-column">
                {inspectionData.safetyAutomationCheck && (
                  <div className="result-item" data-no-break="true">
                    <p className="result-label">Проверка автоматики безопасности:</p>
                    <p className="result-text">{inspectionData.safetyAutomationCheck}</p>
                  </div>
                )}

                {inspectionData.instrumentsCheck && (
                  <div className="result-item" data-no-break="true">
                    <p className="result-label">Проверка контрольно-измерительных приборов:</p>
                    <p className="result-text">{inspectionData.instrumentsCheck}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="inspection-section">
          <p className="conclusion-label">ЗАКЛЮЧЕНИЕ:</p>
          <p className="conclusion-text">
            Котлы и предохранительные устройства технически{' '}
            {inspectionData.conclusion === 'suitable' ? (
              <strong>исправны и пригодны к дальнейшей эксплуатации</strong>
            ) : (
              <strong>неисправны и не пригодны к дальнейшей эксплуатации</strong>
            )}
          </p>
          
          {getNextInspectionDate() && (
            <p className="next-inspection-date">
              <span className="detail-label">Следующее освидетельствование:</span> {getNextInspectionDate()}
            </p>
          )}
          
          {inspectionData.notes && (
            <div className="notes-section">
              <p className="notes-label">Примечания:</p>
              <p className="notes-text">{inspectionData.notes}</p>
            </div>
          )}
        </div>

        <div className="inspection-section signatures-section">
          <p className="signatures-label">Члены комиссии:</p>
          
          <div className="signatures-list">
            {/* Председатель */}
            <div className="signature-item signature-item-chairman">
              <div className="signature-line-container">
                <div className="signature-line-long"></div>
                <span className="signature-label">(подпись)</span>
              </div>
              <span className="signature-name">{inspectionData.commissionChairman}</span>
            </div>
            
            {/* Члены комиссии */}
            {inspectionData.commissionMembers
              .filter(member => member.name.trim() !== '')
              .map((member, index) => (
                <div key={index} className="signature-item">
                  <div className="signature-line-container">
                    <div className="signature-line-long"></div>
                    <span className="signature-label">(подпись)</span>
                  </div>
                  <span className="signature-name">{member.name}</span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};
