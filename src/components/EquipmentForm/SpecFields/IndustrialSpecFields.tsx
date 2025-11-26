/**
 * IndustrialSpecFields.tsx
 * 
 * НАЗНАЧЕНИЕ:
 * Компонент для отображения полей спецификаций типа оборудования "Прочее промышленное оборудование".
 * Содержит универсальные поля для различного промышленного оборудования, не попадающего
 * в другие категории.
 * 
 * СТРУКТУРА ПОЛЕЙ:
 * 1. Наименование (общее поле) - обязательное
 * 2. Инвентарный номер (общее поле) - необязательное
 * 3. Заводской номер - серийный номер от производителя
 * 4. Производительность - производительность оборудования (универсальное поле)
 * 
 * АРХИТЕКТУРА:
 * - Использует общие поля: NameField, InventoryNumberField
 * - Использует универсальный компонент SpecField для остальных полей
 * - Минимальный набор полей для универсальности
 * 
 * ПРИМЕЧАНИЕ:
 * Это универсальный тип для оборудования, которое не попадает в другие категории.
 * Если нужно больше полей, можно использовать тип "Другое" с JSON редактором.
 */

import React from 'react';
import { EquipmentSpecs } from '../../../types/equipment';
import { NameField, InventoryNumberField } from './CommonSpecFields';
import { SpecField } from './SpecField';

/**
 * Интерфейс пропсов IndustrialSpecFields
 */
interface IndustrialSpecFieldsProps {
  specs: EquipmentSpecs;                              // Все характеристики промышленного оборудования
  onSpecChange: (key: string, value: string) => void; // Функция обновления поля
}

/**
 * Компонент IndustrialSpecFields
 * 
 * ЛОГИКА:
 * Рендерит последовательность полей для прочего промышленного оборудования.
 * Фокус на универсальных параметрах, подходящих для любого оборудования.
 */
export const IndustrialSpecFields: React.FC<IndustrialSpecFieldsProps> = ({ specs, onSpecChange }) => {
  return (
    <>
      {/* Общие поля для всех типов оборудования */}
      <NameField specs={specs} onSpecChange={onSpecChange} />
      <InventoryNumberField specs={specs} onSpecChange={onSpecChange} />
      
      {/* Специфичные поля для прочего промышленного оборудования */}
      
      {/* Заводской номер - серийный номер, присвоенный производителем */}
      <SpecField
        label="Заводской номер"
        value={specs.serialNumber || ''}
        onChange={(value) => onSpecChange('serialNumber', value)}
        placeholder="Например: SN-123456"
      />
      
      {/* Производительность - универсальное поле для производительности любого типа */}
      <SpecField
        label="Производительность"
        value={specs.capacity || ''}
        onChange={(value) => onSpecChange('capacity', value)}
        placeholder="Например: 1000 ед/ч, 50 т/ч"
      />
    </>
  );
};

