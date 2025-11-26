/**
 * TankSpecFields.tsx
 * 
 * НАЗНАЧЕНИЕ:
 * Компонент для отображения полей спецификаций типа оборудования "Резервуар".
 * Содержит поля для описания емкостей и резервуаров для хранения жидкостей.
 * 
 * СТРУКТУРА ПОЛЕЙ:
 * 1. Наименование (общее поле) - обязательное
 * 2. Инвентарный номер (общее поле) - необязательное
 * 3. Объем - вместимость резервуара
 * 4. Высота - вертикальный размер резервуара
 * 5. Диаметр - поперечный размер резервуара
 * 
 * АРХИТЕКТУРА:
 * - Использует общие поля: NameField, InventoryNumberField
 * - Использует универсальный компонент SpecField для остальных полей
 * - Минимальный набор полей (только геометрические параметры)
 */

import React from 'react';
import { EquipmentSpecs } from '../../../types/equipment';
import { NameField, InventoryNumberField } from './CommonSpecFields';
import { SpecField } from './SpecField';

/**
 * Интерфейс пропсов TankSpecFields
 */
interface TankSpecFieldsProps {
  specs: EquipmentSpecs;                              // Все характеристики резервуара
  onSpecChange: (key: string, value: string) => void; // Функция обновления поля
}

/**
 * Компонент TankSpecFields
 * 
 * ЛОГИКА:
 * Рендерит последовательность полей для резервуара.
 * Фокус на геометрических параметрах емкости.
 */
export const TankSpecFields: React.FC<TankSpecFieldsProps> = ({ specs, onSpecChange }) => {
  return (
    <>
      {/* Общие поля для всех типов оборудования */}
      <NameField specs={specs} onSpecChange={onSpecChange} />
      <InventoryNumberField specs={specs} onSpecChange={onSpecChange} />
      
      {/* Специфичные поля для резервуара */}
      
      {/* Объем - вместимость резервуара (объем жидкости, который может вместить) */}
      <SpecField
        label="Объем"
        value={specs.volume || ''}
        onChange={(value) => onSpecChange('volume', value)}
        placeholder="Например: 10 м³"
      />
      
      {/* Высота - вертикальный размер резервуара */}
      <SpecField
        label="Высота"
        value={specs.height || ''}
        onChange={(value) => onSpecChange('height', value)}
        placeholder="Например: 2,5 м"
      />
      
      {/* Диаметр - поперечный размер резервуара (для цилиндрических резервуаров) */}
      <SpecField
        label="Диаметр"
        value={specs.diameter || ''}
        onChange={(value) => onSpecChange('diameter', value)}
        placeholder="Например: 2 м"
      />
    </>
  );
};

