/**
 * VentilationSpecFields.tsx
 * 
 * НАЗНАЧЕНИЕ:
 * Компонент для отображения полей спецификаций типа оборудования "Вентиляционное оборудование".
 * Содержит поля для описания вентиляторов и систем вентиляции.
 * 
 * СТРУКТУРА ПОЛЕЙ:
 * 1. Наименование (общее поле) - обязательное
 * 2. Инвентарный номер (общее поле) - необязательное
 * 3. Производительность - объем воздуха, перемещаемый за единицу времени
 * 4. Мощность - потребляемая мощность двигателя вентилятора
 * 5. Тип вентилятора - конструктивный тип (осевой, центробежный и т.д.)
 * 6. Диаметр - размер вентилятора или воздуховода
 * 7. Напор - создаваемое давление воздуха
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
 * Интерфейс пропсов VentilationSpecFields
 */
interface VentilationSpecFieldsProps {
  specs: EquipmentSpecs;                              // Все характеристики вентиляционного оборудования
  onSpecChange: (key: string, value: string) => void; // Функция обновления поля
}

/**
 * Компонент VentilationSpecFields
 * 
 * ЛОГИКА:
 * Рендерит последовательность полей для вентиляционного оборудования.
 * Фокус на аэродинамических и энергетических характеристиках.
 */
export const VentilationSpecFields: React.FC<VentilationSpecFieldsProps> = ({ specs, onSpecChange }) => {
  return (
    <>
      {/* Общие поля для всех типов оборудования */}
      <NameField specs={specs} onSpecChange={onSpecChange} />
      <InventoryNumberField specs={specs} onSpecChange={onSpecChange} />
      
      {/* Специфичные поля для вентиляционного оборудования */}
      
      {/* Производительность - объем воздуха, перемещаемый вентилятором за единицу времени */}
      <SpecField
        label="Производительность"
        value={specs.capacity || ''}
        onChange={(value) => onSpecChange('capacity', value)}
        placeholder="Например: 1000 м³/ч"
      />
      
      {/* Мощность - потребляемая мощность электродвигателя вентилятора */}
      <SpecField
        label="Мощность"
        value={specs.power || ''}
        onChange={(value) => onSpecChange('power', value)}
        placeholder="Например: 1,5 кВт"
      />
      
      {/* Тип вентилятора - конструктивный тип (осевой, центробежный, радиальный и т.д.) */}
      <SpecField
        label="Тип вентилятора"
        value={specs.fanType || ''}
        onChange={(value) => onSpecChange('fanType', value)}
        placeholder="Например: Осевой, Центробежный"
      />
      
      {/* Диаметр - размер вентилятора или диаметр воздуховода */}
      <SpecField
        label="Диаметр"
        value={specs.diameter || ''}
        onChange={(value) => onSpecChange('diameter', value)}
        placeholder="Например: 315 мм"
      />
      
      {/* Напор - создаваемое давление воздуха (статическое давление) */}
      <SpecField
        label="Напор"
        value={specs.pressure || ''}
        onChange={(value) => onSpecChange('pressure', value)}
        placeholder="Например: 200 Па"
      />
    </>
  );
};

