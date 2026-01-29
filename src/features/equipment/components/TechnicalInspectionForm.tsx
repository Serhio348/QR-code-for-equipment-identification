/**
 * TechnicalInspectionForm.tsx
 * 
 * Форма для заполнения данных технического освидетельствования энергоисточников
 */

import React, { useState } from 'react';
import { Equipment } from '../types/equipment';
import { TechnicalInspectionData } from '../types/technicalInspection';
import './TechnicalInspectionForm.css';

interface TechnicalInspectionFormProps {
  equipment: Equipment;
  onSave: (data: TechnicalInspectionData) => void;
  onCancel: () => void;
  onGeneratePDF: (data: TechnicalInspectionData) => void;
}

export const TechnicalInspectionForm: React.FC<TechnicalInspectionFormProps> = ({
  equipment,
  onSave,
  onCancel,
  onGeneratePDF
}) => {
  const specs = equipment.specs;
  
  // Вычисляем дату следующего освидетельствования по умолчанию (текущая дата + 1 год)
  const getDefaultNextInspectionDate = () => {
    const today = new Date();
    const nextYear = new Date(today);
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    return nextYear.toISOString().split('T')[0];
  };

  const [formData, setFormData] = useState<TechnicalInspectionData>({
    actNumber: '',
    inspectionDate: new Date().toISOString().split('T')[0],
    city: 'г. Брест',
    organization: '',
    boilersCount: '1',
    safetyDeviceType: '',
    facilityName: '',
    facilityAddress: '',
    registrationNumber: specs.registrationNumber || '',
    serialNumber: specs.serialNumber || '',
    energySourceType: specs.energySourceType || '',
    powerKw: specs.powerKw || '',
    workingPressure: specs.workingPressure || '',
    externalInspection: '',
    hydraulicTest: '',
    safetyValvesCheck: '',
    safetyAutomationCheck: '',
    instrumentsCheck: '',
    conclusion: 'suitable',
    notes: '',
    commissionChairman: '',
    commissionChairmanPosition: '',
    commissionMembers: [{ name: '', position: '' }, { name: '', position: '' }],
    nextInspectionDate: specs.nextTestDate || getDefaultNextInspectionDate()
  });

  const handleChange = (field: keyof TechnicalInspectionData, value: any) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      
      // Если изменилась дата освидетельствования, автоматически обновляем дату следующего освидетельствования (+1 год)
      if (field === 'inspectionDate' && value) {
        const inspectionDate = new Date(value);
        const nextInspectionDate = new Date(inspectionDate);
        nextInspectionDate.setFullYear(nextInspectionDate.getFullYear() + 1);
        updated.nextInspectionDate = nextInspectionDate.toISOString().split('T')[0];
      }
      
      return updated;
    });
  };

  const handleMemberChange = (index: number, field: 'name' | 'position', value: string) => {
    const newMembers = [...formData.commissionMembers];
    newMembers[index] = { ...newMembers[index], [field]: value };
    setFormData(prev => ({ ...prev, commissionMembers: newMembers }));
  };

  const addMember = () => {
    setFormData(prev => ({
      ...prev,
      commissionMembers: [...prev.commissionMembers, { name: '', position: '' }]
    }));
  };

  const removeMember = (index: number) => {
    if (formData.commissionMembers.length > 1) {
      const newMembers = formData.commissionMembers.filter((_, i) => i !== index);
      setFormData(prev => ({ ...prev, commissionMembers: newMembers }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const handleGeneratePDF = () => {
    onGeneratePDF(formData);
  };

  return (
    <div className="technical-inspection-form">
      <h3>Техническое освидетельствование</h3>
      
      <form onSubmit={handleSubmit}>
        <div className="form-section">
          <h4>Общие данные</h4>
          
          <div className="form-row">
            <div className="form-group">
              <label>Номер акта *</label>
              <input
                type="text"
                value={formData.actNumber}
                onChange={(e) => handleChange('actNumber', e.target.value)}
                placeholder="Например: №01-2024"
                required
              />
            </div>
            
            <div className="form-group">
              <label>Дата освидетельствования *</label>
              <input
                type="date"
                value={formData.inspectionDate}
                onChange={(e) => handleChange('inspectionDate', e.target.value)}
                required
              />
            </div>
            
            <div className="form-group">
              <label>Город *</label>
              <input
                type="text"
                value={formData.city || ''}
                onChange={(e) => handleChange('city', e.target.value)}
                placeholder="Например: г. Брест"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label>Организация *</label>
            <input
              type="text"
              value={formData.organization || ''}
              onChange={(e) => handleChange('organization', e.target.value)}
              placeholder="Наименование организации"
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Количество котлов *</label>
              <input
                type="text"
                value={formData.boilersCount || ''}
                onChange={(e) => handleChange('boilersCount', e.target.value)}
                placeholder="Например: 1"
                required
              />
            </div>
            
            <div className="form-group">
              <label>Тип и марка предохранительного устройства *</label>
              <input
                type="text"
                value={formData.safetyDeviceType || ''}
                onChange={(e) => handleChange('safetyDeviceType', e.target.value)}
                placeholder="Тип, марка предохранительного устройства"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label>Наименование объекта (котельной) *</label>
            <input
              type="text"
              value={formData.facilityName || ''}
              onChange={(e) => handleChange('facilityName', e.target.value)}
              placeholder="Наименование котельной"
              required
            />
          </div>

          <div className="form-group">
            <label>Адрес объекта *</label>
            <input
              type="text"
              value={formData.facilityAddress || ''}
              onChange={(e) => handleChange('facilityAddress', e.target.value)}
              placeholder="Адрес котельной"
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Регистрационный номер</label>
              <input
                type="text"
                value={formData.registrationNumber}
                onChange={(e) => handleChange('registrationNumber', e.target.value)}
                placeholder="Из характеристик оборудования"
              />
            </div>
            
            <div className="form-group">
              <label>Серийный номер</label>
              <input
                type="text"
                value={formData.serialNumber}
                onChange={(e) => handleChange('serialNumber', e.target.value)}
                placeholder="Из характеристик оборудования"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Тип энергоисточника</label>
              <input
                type="text"
                value={formData.energySourceType}
                onChange={(e) => handleChange('energySourceType', e.target.value)}
                placeholder="Из характеристик оборудования"
              />
            </div>
            
            <div className="form-group">
              <label>Мощность (кВт)</label>
              <input
                type="text"
                value={formData.powerKw}
                onChange={(e) => handleChange('powerKw', e.target.value)}
                placeholder="Из характеристик оборудования"
              />
            </div>
            
            <div className="form-group">
              <label>Рабочее давление</label>
              <input
                type="text"
                value={formData.workingPressure}
                onChange={(e) => handleChange('workingPressure', e.target.value)}
                placeholder="Из характеристик оборудования"
              />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h4>Результаты освидетельствования</h4>
          
          <div className="form-group">
            <label>Внешний осмотр *</label>
            <textarea
              value={formData.externalInspection}
              onChange={(e) => handleChange('externalInspection', e.target.value)}
              rows={3}
              placeholder="Опишите результаты внешнего осмотра..."
              required
            />
          </div>

          <div className="form-group">
            <label>Гидравлическое испытание *</label>
            <textarea
              value={formData.hydraulicTest}
              onChange={(e) => handleChange('hydraulicTest', e.target.value)}
              rows={3}
              placeholder="Опишите результаты гидравлического испытания..."
              required
            />
          </div>

          <div className="form-group">
            <label>Проверка предохранительных клапанов *</label>
            <textarea
              value={formData.safetyValvesCheck}
              onChange={(e) => handleChange('safetyValvesCheck', e.target.value)}
              rows={3}
              placeholder="Опишите результаты проверки предохранительных клапанов..."
              required
            />
          </div>

          <div className="form-group">
            <label>Проверка автоматики безопасности</label>
            <textarea
              value={formData.safetyAutomationCheck || ''}
              onChange={(e) => handleChange('safetyAutomationCheck', e.target.value)}
              rows={2}
              placeholder="Опишите результаты проверки автоматики безопасности..."
            />
          </div>

          <div className="form-group">
            <label>Проверка контрольно-измерительных приборов</label>
            <textarea
              value={formData.instrumentsCheck || ''}
              onChange={(e) => handleChange('instrumentsCheck', e.target.value)}
              rows={2}
              placeholder="Опишите результаты проверки КИП..."
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Заключение *</label>
              <select
                value={formData.conclusion}
                onChange={(e) => handleChange('conclusion', e.target.value as 'suitable' | 'unsuitable')}
                required
              >
                <option value="suitable">Годен к эксплуатации</option>
                <option value="unsuitable">Не годен к эксплуатации</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Дата следующего освидетельствования</label>
              <input
                type="date"
                value={formData.nextInspectionDate || ''}
                onChange={(e) => handleChange('nextInspectionDate', e.target.value)}
                title="Автоматически вычисляется как дата освидетельствования + 1 год"
              />
              <small style={{ color: '#666', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                Автоматически: {formData.inspectionDate ? (() => {
                  const date = new Date(formData.inspectionDate);
                  date.setFullYear(date.getFullYear() + 1);
                  return date.toISOString().split('T')[0];
                })() : ''}
              </small>
            </div>
          </div>

          <div className="form-group">
            <label>Примечания</label>
            <textarea
              value={formData.notes || ''}
              onChange={(e) => handleChange('notes', e.target.value)}
              rows={2}
              placeholder="Дополнительные примечания..."
            />
          </div>
        </div>

        <div className="form-section">
          <h4>Комиссия</h4>
          
          <div className="form-row">
            <div className="form-group">
              <label>Должность председателя комиссии</label>
              <input
                type="text"
                value={formData.commissionChairmanPosition || ''}
                onChange={(e) => handleChange('commissionChairmanPosition', e.target.value)}
                placeholder="Например: Главный инженер"
              />
            </div>
            
            <div className="form-group">
              <label>Председатель комиссии (ФИО) *</label>
              <input
                type="text"
                value={formData.commissionChairman}
                onChange={(e) => handleChange('commissionChairman', e.target.value)}
                placeholder="ФИО председателя комиссии"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label>Члены комиссии *</label>
            {formData.commissionMembers.map((member, index) => (
              <div key={index} className="member-input-group">
                <div className="member-input-row">
                  <input
                    type="text"
                    value={member.position || ''}
                    onChange={(e) => handleMemberChange(index, 'position', e.target.value)}
                    placeholder={`Должность члена ${index + 1}`}
                    style={{ flex: '0 0 40%' }}
                  />
                  <input
                    type="text"
                    value={member.name}
                    onChange={(e) => handleMemberChange(index, 'name', e.target.value)}
                    placeholder={`ФИО члена комиссии ${index + 1}`}
                    required={index < 2}
                    style={{ flex: '1' }}
                  />
                  {formData.commissionMembers.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeMember(index)}
                      className="remove-member-btn"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={addMember}
              className="add-member-btn"
            >
              + Добавить члена комиссии
            </button>
          </div>
        </div>

        <div className="form-actions">
          <button type="button" onClick={onCancel} className="cancel-btn">
            Отмена
          </button>
          <button
            type="button"
            onClick={handleGeneratePDF}
            className="generate-pdf-btn"
          >
            Сгенерировать PDF
          </button>
          <button type="submit" className="save-btn">
            Сохранить в журнал
          </button>
        </div>
      </form>
    </div>
  );
};
