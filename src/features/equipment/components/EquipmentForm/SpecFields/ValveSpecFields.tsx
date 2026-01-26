/**
 * ValveSpecFields.tsx
 * 
 * НАЗНАЧЕНИЕ:
 * Компонент для отображения полей спецификаций типа оборудования "Клапан".
 * Содержит поля для описания запорной и регулирующей арматуры.
 * 
 * СТРУКТУРА ПОЛЕЙ:
 * 1. Наименование (общее поле) - обязательное
 * 2. Инвентарный номер (общее поле) - необязательное
 * 3. Диаметр - размер присоединения клапана
 * 4. Тип клапана - конструктивный тип (шаровой, задвижка, кран и т.д.)
 * 
 * АРХИТЕКТУРА:
 * - Использует общие поля: NameField, InventoryNumberField
 * - Использует универсальный компонент SpecField для остальных полей
 * - Минимальный набор полей (только основные параметры)
 */

import React from 'react';
import { EquipmentSpecs } from '../../../types/equipment';
import { NameField, InventoryNumberField } from './CommonSpecFields';
import { SpecField } from './SpecField';

/**
 * Интерфейс пропсов ValveSpecFields
 */
interface ValveSpecFieldsProps {
  specs: EquipmentSpecs;                              // Все характеристики клапана
  onSpecChange: (key: string, value: string) => void; // Функция обновления поля
}

/**
 * Компонент ValveSpecFields
 * 
 * ЛОГИКА:
 * Рендерит последовательность полей для клапана.
 * Фокус на основных параметрах запорной арматуры.
 */
export const ValveSpecFields: React.FC<ValveSpecFieldsProps> = ({ specs, onSpecChange }) => {
  return (
    <>
      {/* Общие поля для всех типов оборудования */}
      <NameField specs={specs} onSpecChange={onSpecChange} />
      <InventoryNumberField specs={specs} onSpecChange={onSpecChange} />
      
      {/* Специфичные поля для клапана */}
      
      {/* Диаметр - размер присоединения клапана (DN - диаметр номинальный) */}
      <SpecField
        label="Диаметр"
        value={specs.diameter || ''}
        onChange={(value) => onSpecChange('diameter', value)}
        placeholder="Например: DN50"
      />
      
      {/* Тип клапана - конструктивный тип (шаровой, задвижка, кран, обратный и т.д.) */}
      <SpecField
        label="Тип клапана"
        value={specs.valveType || ''}
        onChange={(value) => onSpecChange('valveType', value)}
        placeholder="Например: Шаровой"
      />
    </>
  );
};

