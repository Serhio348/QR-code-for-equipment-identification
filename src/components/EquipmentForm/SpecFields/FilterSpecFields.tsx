/**
 * FilterSpecFields.tsx
 * 
 * НАЗНАЧЕНИЕ:
 * Компонент для отображения полей спецификаций типа оборудования "Фильтр".
 * Содержит все поля, характерные для фильтрующего оборудования.
 * 
 * СТРУКТУРА ПОЛЕЙ:
 * 1. Наименование (общее поле) - обязательное
 * 2. Инвентарный номер (общее поле) - необязательное
 * 3. Высота - высота фильтра
 * 4. Диаметр - диаметр фильтра
 * 5. Производительность - объем обрабатываемой воды
 * 6. Площадь фильтрации - площадь фильтрующей поверхности
 * 7. Скорость фильтрации - скорость прохождения воды
 * 8. Материал засыпки - тип фильтрующего материала
 * 9. Объем засыпки - количество фильтрующего материала
 * 
 * АРХИТЕКТУРА:
 * - Использует общие поля: NameField, InventoryNumberField
 * - Использует универсальный компонент SpecField для остальных полей
 * - Все поля обновляются через единую функцию onSpecChange
 */

import React from 'react';
import { EquipmentSpecs } from '../../../types/equipment';
import { NameField, InventoryNumberField } from './CommonSpecFields';
import { SpecField } from './SpecField';

/**
 * Интерфейс пропсов FilterSpecFields
 */
interface FilterSpecFieldsProps {
  specs: EquipmentSpecs;                              // Все характеристики фильтра
  onSpecChange: (key: string, value: string) => void; // Функция обновления поля
}

/**
 * Компонент FilterSpecFields
 * 
 * ЛОГИКА:
 * Рендерит последовательность полей для фильтра:
 * 1. Сначала общие поля (Наименование, Инвентарный номер)
 * 2. Затем специфичные для фильтра поля
 * 
 * ПОТОК ДАННЫХ:
 * onSpecChange('height', '1,5 м') → обновляет specs.height → сохраняется в state формы
 */
export const FilterSpecFields: React.FC<FilterSpecFieldsProps> = ({ specs, onSpecChange }) => {
  return (
    <>
      {/* Общие поля для всех типов оборудования */}
      <NameField specs={specs} onSpecChange={onSpecChange} />
      <InventoryNumberField specs={specs} onSpecChange={onSpecChange} />
      
      {/* Специфичные поля для фильтра */}
      
      {/* Высота фильтра - вертикальный размер корпуса */}
      <SpecField
        label="Высота"
        value={specs.height || ''}
        onChange={(value) => onSpecChange('height', value)}
        placeholder="Например: 1,5 м"
      />
      
      {/* Диаметр фильтра - поперечный размер корпуса */}
      <SpecField
        label="Диаметр"
        value={specs.diameter || ''}
        onChange={(value) => onSpecChange('diameter', value)}
        placeholder="Например: 0,8 м"
      />
      
      {/* Производительность - объем воды, обрабатываемый за единицу времени */}
      <SpecField
        label="Производительность"
        value={specs.capacity || ''}
        onChange={(value) => onSpecChange('capacity', value)}
        placeholder="Например: 5 м³"
      />
      
      {/* Площадь фильтрации - площадь активной фильтрующей поверхности */}
      <SpecField
        label="Площадь фильтрации"
        value={specs.filtrationArea || ''}
        onChange={(value) => onSpecChange('filtrationArea', value)}
        placeholder="Например: 0,5 м²"
      />
      
      {/* Скорость фильтрации - скорость прохождения воды через фильтр */}
      <SpecField
        label="Скорость фильтрации"
        value={specs.filtrationSpeed || ''}
        onChange={(value) => onSpecChange('filtrationSpeed', value)}
        placeholder="Например: 10 м/ч"
      />
      
      {/* Материал засыпки - тип фильтрующего материала (песок, уголь и т.д.) */}
      <SpecField
        label="Материал засыпки"
        value={specs.fillingMaterial || ''}
        onChange={(value) => onSpecChange('fillingMaterial', value)}
        placeholder="Например: Nevtraco 1,0-2,5 мм"
      />
      
      {/* Объем засыпки - количество фильтрующего материала */}
      <SpecField
        label="Объем засыпки"
        value={specs.fillingVolume || ''}
        onChange={(value) => onSpecChange('fillingVolume', value)}
        placeholder="Например: 350 л"
      />
    </>
  );
};

