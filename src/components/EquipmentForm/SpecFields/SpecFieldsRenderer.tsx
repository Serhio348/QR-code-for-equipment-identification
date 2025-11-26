/**
 * SpecFieldsRenderer.tsx
 * 
 * НАЗНАЧЕНИЕ:
 * Компонент-роутер (маршрутизатор), который выбирает нужный компонент полей
 * в зависимости от типа оборудования. Это центральная точка входа для
 * отображения полей спецификаций.
 * 
 * АРХИТЕКТУРА:
 * - Использует switch-case для выбора компонента по типу оборудования
 * - Импортирует все компоненты типов оборудования
 * - Передает пропсы в выбранный компонент
 * 
 * ПРЕИМУЩЕСТВА:
 * - Единая точка входа для всех типов оборудования
 * - Легко добавлять новые типы (добавить case в switch)
 * - Инкапсулирует логику выбора компонента
 * 
 * ИСПОЛЬЗОВАНИЕ:
 * Используется в EquipmentForm.tsx:
 * <SpecFieldsRenderer type={type} specs={specs} onSpecChange={...} />
 */

import React from 'react';
import { EquipmentType, EquipmentSpecs } from '../../../types/equipment';

// Импортируем все компоненты полей для разных типов оборудования
import { FilterSpecFields } from './FilterSpecFields';           // Фильтр
import { PumpSpecFields } from './PumpSpecFields';               // Насос
import { TankSpecFields } from './TankSpecFields';                // Резервуар
import { ValveSpecFields } from './ValveSpecFields';             // Клапан
import { ElectricalSpecFields } from './ElectricalSpecFields';   // Электрооборудование
import { VentilationSpecFields } from './VentilationSpecFields'; // Вентиляционное оборудование
import { PlumbingSpecFields } from './PlumbingSpecFields';        // Сантехническое оборудование
import { IndustrialSpecFields } from './IndustrialSpecFields';   // Прочее промышленное оборудование
import { OtherSpecFields } from './OtherSpecFields';              // Другое (JSON редактор)

/**
 * Интерфейс пропсов SpecFieldsRenderer
 * 
 * @param type - Тип оборудования (определяет какой компонент рендерить)
 * @param specs - Объект со всеми характеристиками
 * @param onSpecChange - Функция для обновления одного поля (для большинства типов)
 * @param onSpecsChange - Функция для обновления всего объекта specs (только для типа 'other')
 */
interface SpecFieldsRendererProps {
  type: EquipmentType;                                    // Тип оборудования
  specs: EquipmentSpecs;                                 // Все характеристики
  onSpecChange: (key: string, value: string) => void;     // Обновление одного поля
  onSpecsChange?: (specs: EquipmentSpecs) => void;       // Обновление всего объекта (для 'other')
}

/**
 * Компонент SpecFieldsRenderer
 * 
 * ЛОГИКА РАБОТЫ:
 * 1. Получает type (тип оборудования) из пропсов
 * 2. Использует switch-case для выбора нужного компонента
 * 3. Рендерит выбранный компонент с передачей specs и onSpecChange
 * 4. Для типа 'other' использует onSpecsChange (работа с JSON)
 * 
 * ПОТОК ДАННЫХ:
 * EquipmentForm → SpecFieldsRenderer → [FilterSpecFields | PumpSpecFields | ...]
 *                                      ↓
 *                                  SpecField / NameField / InventoryNumberField
 */
export const SpecFieldsRenderer: React.FC<SpecFieldsRendererProps> = ({
  type,              // Тип оборудования (например: 'filter', 'pump')
  specs,             // Все характеристики оборудования
  onSpecChange,      // Функция обновления одного поля
  onSpecsChange      // Функция обновления всего объекта (для типа 'other')
}) => {
  /**
   * Switch-case для выбора компонента в зависимости от типа оборудования
   * 
   * Каждый case возвращает соответствующий компонент с передачей:
   * - specs: текущие характеристики
   * - onSpecChange: функция обновления полей
   */
  switch (type) {
    // Фильтр - компонент с полями: Наименование, Инвентарный номер, Высота, Диаметр, и т.д.
    case 'filter':
      return <FilterSpecFields specs={specs} onSpecChange={onSpecChange} />;
    
    // Насос - компонент с полями: Наименование, Инвентарный номер, Производительность, Напор, и т.д.
    case 'pump':
      return <PumpSpecFields specs={specs} onSpecChange={onSpecChange} />;
    
    // Резервуар - компонент с полями: Наименование, Инвентарный номер, Объем, Высота, Диаметр
    case 'tank':
      return <TankSpecFields specs={specs} onSpecChange={onSpecChange} />;
    
    // Клапан - компонент с полями: Наименование, Инвентарный номер, Диаметр, Тип клапана
    case 'valve':
      return <ValveSpecFields specs={specs} onSpecChange={onSpecChange} />;
    
    // Электрооборудование - компонент с полями: Наименование, Инвентарный номер, Мощность, Напряжение, и т.д.
    case 'electrical':
      return <ElectricalSpecFields specs={specs} onSpecChange={onSpecChange} />;
    
    // Вентиляционное оборудование - компонент с полями: Наименование, Инвентарный номер, Производительность, Мощность, и т.д.
    case 'ventilation':
      return <VentilationSpecFields specs={specs} onSpecChange={onSpecChange} />;
    
    // Сантехническое оборудование - компонент с полями: Наименование, Инвентарный номер, Диаметр, Материал, и т.д.
    case 'plumbing':
      return <PlumbingSpecFields specs={specs} onSpecChange={onSpecChange} />;
    
    // Прочее промышленное оборудование - компонент с полями: Наименование, Инвентарный номер, Заводской номер, Производительность
    case 'industrial':
      return <IndustrialSpecFields specs={specs} onSpecChange={onSpecChange} />;
    
    // Другое - специальный компонент с JSON редактором
    // Использует onSpecsChange вместо onSpecChange (работает со всем объектом сразу)
    case 'other':
      return <OtherSpecFields specs={specs} onSpecChange={onSpecsChange || (() => {})} />;
    
    // Если тип не распознан, ничего не рендерим
    default:
      return null;
  }
};

