/**
 * EnergySourceSpecFields.tsx
 * 
 * НАЗНАЧЕНИЕ:
 * Компонент для отображения полей спецификаций типа оборудования "Энергоисточники".
 * Содержит все поля, характерные для котлов и других энергоисточников.
 * 
 * СТРУКТУРА ПОЛЕЙ:
 * 1. Наименование (общее поле) - обязательное
 * 2. Серийный номер (общее поле) - необязательное
 * 3. Регистрационный номер - необязательное
 * 4. Тип энергоисточника - котел, теплогенератор, и т.д.
 * 5. Мощность (кВт)
 * 5. Топливо - тип используемого топлива (газ, электричество, дизель, и т.д.)
 * 6. Расход топлива - потребление топлива
 * 7. КПД - коэффициент полезного действия
 * 8. Рабочее давление - давление в системе
 * 9. Температура воды на выходе - температура нагретой воды
 * 10. Напряжение - рабочее напряжение (для электрических)
 * 11. Производитель - компания-изготовитель
 * 12. Модель - модель оборудования
 * 13. Дата следующего испытания
 * 
 * АРХИТЕКТУРА:
 * - Использует общие поля: NameField, SerialNumberField
 * - Использует универсальный компонент SpecField для остальных полей
 */

import React from 'react';
import { EquipmentSpecs } from '../../../types/equipment';
import { NameField, SerialNumberField } from './CommonSpecFields';
import { SpecField } from './SpecField';

/**
 * Интерфейс пропсов EnergySourceSpecFields
 */
interface EnergySourceSpecFieldsProps {
  specs: EquipmentSpecs;                              // Все характеристики энергоисточника
  onSpecChange: (key: string, value: string) => void; // Функция обновления поля
}

/**
 * Компонент EnergySourceSpecFields
 * 
 * ЛОГИКА:
 * Рендерит последовательность полей для энергоисточников (котлы и другие).
 * Все поля связаны с техническими характеристиками энергетического оборудования.
 */
export const EnergySourceSpecFields: React.FC<EnergySourceSpecFieldsProps> = ({ specs, onSpecChange }) => {
  return (
    <>
      {/* Общие поля для всех типов оборудования */}
      <NameField specs={specs} onSpecChange={onSpecChange} />
      <SerialNumberField specs={specs} onSpecChange={onSpecChange} />
      
      {/* Специфичные поля для энергоисточников */}

      {/* Регистрационный номер */}
      <SpecField
        label="Регистрационный номер"
        value={specs.registrationNumber || ''}
        onChange={(value) => onSpecChange('registrationNumber', value)}
        placeholder="Например: РЕГ-001 / 12345"
      />
      
      {/* Тип энергоисточника - котел, теплогенератор, и т.д. */}
      <SpecField
        label="Тип энергоисточника"
        value={specs.energySourceType || ''}
        onChange={(value) => onSpecChange('energySourceType', value)}
        placeholder="Например: Котел, Теплогенератор, Бойлер"
      />
      
      {/* Мощность (кВт) */}
      <SpecField
        label="Мощность (кВт)"
        value={specs.powerKw || ''}
        onChange={(value) => onSpecChange('powerKw', value)}
        placeholder="Например: 100"
        type="number"
      />
      
      {/* Топливо - тип используемого топлива */}
      <SpecField
        label="Топливо"
        value={specs.fuelType || ''}
        onChange={(value) => onSpecChange('fuelType', value)}
        placeholder="Например: Газ, Электричество, Дизель, Уголь"
      />
      
      {/* Расход топлива - потребление топлива */}
      <SpecField
        label="Расход топлива"
        value={specs.fuelConsumption || ''}
        onChange={(value) => onSpecChange('fuelConsumption', value)}
        placeholder="Например: 12 м³/ч (газ), 50 л/ч (дизель)"
      />
      
      {/* КПД - коэффициент полезного действия */}
      <SpecField
        label="КПД"
        value={specs.efficiency || ''}
        onChange={(value) => onSpecChange('efficiency', value)}
        placeholder="Например: 92%, 0.92"
      />
      
      {/* Рабочее давление - давление в системе */}
      <SpecField
        label="Рабочее давление"
        value={specs.workingPressure || ''}
        onChange={(value) => onSpecChange('workingPressure', value)}
        placeholder="Например: 6 бар, 0.6 МПа"
      />
      
      {/* Температура воды на выходе - температура нагретой воды */}
      <SpecField
        label="Температура воды на выходе"
        value={specs.outputTemperature || ''}
        onChange={(value) => onSpecChange('outputTemperature', value)}
        placeholder="Например: 80°C, 95°C"
      />
      
      {/* Напряжение - рабочее напряжение (для электрических энергоисточников) */}
      <SpecField
        label="Напряжение"
        value={specs.voltage || ''}
        onChange={(value) => onSpecChange('voltage', value)}
        placeholder="Например: 380 В, 220 В"
      />
      
      {/* Производитель - компания-изготовитель */}
      <SpecField
        label="Производитель"
        value={specs.manufacturer || ''}
        onChange={(value) => onSpecChange('manufacturer', value)}
        placeholder="Например: Viessmann, Buderus, Protherm"
      />
      
      {/* Модель - модель оборудования */}
      <SpecField
        label="Модель"
        value={specs.model || ''}
        onChange={(value) => onSpecChange('model', value)}
        placeholder="Например: Vitodens 100-W, Logano plus GB312"
      />

      {/* Дата следующего испытания */}
      <SpecField
        label="Дата следующего испытания"
        value={specs.nextTestDate || ''}
        onChange={(value) => onSpecChange('nextTestDate', value)}
        placeholder="YYYY-MM-DD"
        type="date"
      />
    </>
  );
};
