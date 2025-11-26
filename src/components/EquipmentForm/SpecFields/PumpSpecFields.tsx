/**
 * PumpSpecFields.tsx
 * 
 * НАЗНАЧЕНИЕ:
 * Компонент для отображения полей спецификаций типа оборудования "Насос".
 * Содержит все поля, характерные для насосного оборудования.
 * 
 * СТРУКТУРА ПОЛЕЙ:
 * 1. Наименование (общее поле) - обязательное
 * 2. Инвентарный номер (общее поле) - необязательное
 * 3. Производительность - объем перекачиваемой жидкости
 * 4. Напор - высота подъема жидкости
 * 5. Мощность - потребляемая мощность двигателя
 * 6. Напряжение - рабочее напряжение электродвигателя
 * 7. Диаметр подключения - размер присоединительных патрубков
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
 * Интерфейс пропсов PumpSpecFields
 */
interface PumpSpecFieldsProps {
  specs: EquipmentSpecs;                              // Все характеристики насоса
  onSpecChange: (key: string, value: string) => void; // Функция обновления поля
}

/**
 * Компонент PumpSpecFields
 * 
 * ЛОГИКА:
 * Рендерит последовательность полей для насоса.
 * Все поля связаны с техническими характеристиками насосного оборудования.
 */
export const PumpSpecFields: React.FC<PumpSpecFieldsProps> = ({ specs, onSpecChange }) => {
  return (
    <>
      {/* Общие поля для всех типов оборудования */}
      <NameField specs={specs} onSpecChange={onSpecChange} />
      <InventoryNumberField specs={specs} onSpecChange={onSpecChange} />
      
      {/* Специфичные поля для насоса */}
      
      {/* Производительность - объем жидкости, перекачиваемый за единицу времени */}
      <SpecField
        label="Производительность"
        value={specs.capacity || ''}
        onChange={(value) => onSpecChange('capacity', value)}
        placeholder="Например: 10 м³/ч"
      />
      
      {/* Напор - максимальная высота подъема жидкости (в метрах водяного столба) */}
      <SpecField
        label="Напор"
        value={specs.pressure || ''}
        onChange={(value) => onSpecChange('pressure', value)}
        placeholder="Например: 50 м"
      />
      
      {/* Мощность - потребляемая мощность электродвигателя насоса */}
      <SpecField
        label="Мощность"
        value={specs.power || ''}
        onChange={(value) => onSpecChange('power', value)}
        placeholder="Например: 5,5 кВт"
      />
      
      {/* Напряжение - рабочее напряжение электродвигателя */}
      <SpecField
        label="Напряжение"
        value={specs.voltage || ''}
        onChange={(value) => onSpecChange('voltage', value)}
        placeholder="Например: 380 В"
      />
      
      {/* Диаметр подключения - размер присоединительных патрубков (вход/выход) */}
      <SpecField
        label="Диаметр подключения"
        value={specs.diameter || ''}
        onChange={(value) => onSpecChange('diameter', value)}
        placeholder="Например: DN50"
      />
    </>
  );
};

