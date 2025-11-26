/**
 * PlumbingSpecFields.tsx
 * 
 * НАЗНАЧЕНИЕ:
 * Компонент для отображения полей спецификаций типа оборудования "Сантехническое оборудование".
 * Содержит поля для описания сантехнических изделий (краны, смесители, трубы и т.д.).
 * 
 * СТРУКТУРА ПОЛЕЙ:
 * 1. Наименование (общее поле) - обязательное
 * 2. Инвентарный номер (общее поле) - необязательное
 * 3. Диаметр - размер присоединения или проходной диаметр
 * 4. Материал - материал изготовления
 * 5. Тип оборудования - категория сантехнического изделия
 * 6. Рабочее давление - максимальное рабочее давление
 * 7. Температура - рабочая температура
 * 
 * АРХИТЕКТУРА:
 * - Использует общие поля: NameField, InventoryNumberField
 * - Использует универсальный компонент SpecField для остальных полей
 */

import React from 'react';
import { EquipmentSpecs } from '../../../types/equipment';
import { NameField, InventoryNumberField } from './CommonSpecFields';
import { SpecField } from './SpecField';

/**
 * Интерфейс пропсов PlumbingSpecFields
 */
interface PlumbingSpecFieldsProps {
  specs: EquipmentSpecs;                              // Все характеристики сантехнического оборудования
  onSpecChange: (key: string, value: string) => void; // Функция обновления поля
}

/**
 * Компонент PlumbingSpecFields
 * 
 * ЛОГИКА:
 * Рендерит последовательность полей для сантехнического оборудования.
 * Фокус на параметрах, важных для сантехнических систем.
 */
export const PlumbingSpecFields: React.FC<PlumbingSpecFieldsProps> = ({ specs, onSpecChange }) => {
  return (
    <>
      {/* Общие поля для всех типов оборудования */}
      <NameField specs={specs} onSpecChange={onSpecChange} />
      <InventoryNumberField specs={specs} onSpecChange={onSpecChange} />
      
      {/* Специфичные поля для сантехнического оборудования */}
      
      {/* Диаметр - размер присоединения или проходной диаметр (DN или дюймы) */}
      <SpecField
        label="Диаметр"
        value={specs.diameter || ''}
        onChange={(value) => onSpecChange('diameter', value)}
        placeholder="Например: DN50, 1/2 дюйма"
      />
      
      {/* Материал - материал изготовления (полипропилен, металл, керамика и т.д.) */}
      <SpecField
        label="Материал"
        value={specs.material || ''}
        onChange={(value) => onSpecChange('material', value)}
        placeholder="Например: Полипропилен, Металл"
      />
      
      {/* Тип оборудования - категория сантехнического изделия */}
      <SpecField
        label="Тип оборудования"
        value={specs.equipmentType || ''}
        onChange={(value) => onSpecChange('equipmentType', value)}
        placeholder="Например: Смеситель, Кран, Труба"
      />
      
      {/* Рабочее давление - максимальное рабочее давление (в барах) */}
      <SpecField
        label="Рабочее давление"
        value={specs.workingPressure || ''}
        onChange={(value) => onSpecChange('workingPressure', value)}
        placeholder="Например: 6 бар"
      />
      
      {/* Температура - рабочая температура (максимальная или диапазон) */}
      <SpecField
        label="Температура"
        value={specs.temperature || ''}
        onChange={(value) => onSpecChange('temperature', value)}
        placeholder="Например: до 95°C"
      />
    </>
  );
};

