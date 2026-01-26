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
import { OtherSpecFields } from './OtherSpecFields';              // Другое
import { AdditionalNotesField } from './CommonSpecFields';        // Дополнительные характеристики (для всех типов)

/**
 * Интерфейс пропсов SpecFieldsRenderer
 * 
 * @param type - Тип оборудования (определяет какой компонент рендерить)
 * @param specs - Объект со всеми характеристиками
 * @param onSpecChange - Функция для обновления одного поля
 */
interface SpecFieldsRendererProps {
  type: EquipmentType;                                    // Тип оборудования
  specs: EquipmentSpecs;                                 // Все характеристики
  onSpecChange: (key: string, value: string) => void;     // Обновление одного поля
}

/**
 * Компонент SpecFieldsRenderer
 * 
 * ЛОГИКА РАБОТЫ:
 * 1. Получает type (тип оборудования) из пропсов
 * 2. Использует switch-case для выбора нужного компонента
 * 3. Рендерит выбранный компонент с передачей specs и onSpecChange
 * 4. Добавляет поле "Дополнительные характеристики" для всех типов
 * 
 * ПОТОК ДАННЫХ:
 * EquipmentForm → SpecFieldsRenderer → [FilterSpecFields | PumpSpecFields | ...]
 *                                      ↓
 *                                  SpecField / NameField / InventoryNumberField
 */
export const SpecFieldsRenderer: React.FC<SpecFieldsRendererProps> = ({
  type,              // Тип оборудования (например: 'filter', 'pump')
  specs,             // Все характеристики оборудования
  onSpecChange       // Функция обновления одного поля
}) => {
  /**
   * Switch-case для выбора компонента в зависимости от типа оборудования
   * 
   * Каждый case возвращает соответствующий компонент с передачей:
   * - specs: текущие характеристики
   * - onSpecChange: функция обновления полей
   */
  let specificFields: React.ReactNode;
  
  switch (type) {
    // Фильтр - компонент с полями: Наименование, Инвентарный номер, Высота, Диаметр, и т.д.
    case 'filter':
      specificFields = <FilterSpecFields specs={specs} onSpecChange={onSpecChange} />;
      break;
    
    // Насос - компонент с полями: Наименование, Инвентарный номер, Производительность, Напор, и т.д.
    case 'pump':
      specificFields = <PumpSpecFields specs={specs} onSpecChange={onSpecChange} />;
      break;
    
    // Резервуар - компонент с полями: Наименование, Инвентарный номер, Объем, Высота, Диаметр
    case 'tank':
      specificFields = <TankSpecFields specs={specs} onSpecChange={onSpecChange} />;
      break;
    
    // Клапан - компонент с полями: Наименование, Инвентарный номер, Диаметр, Тип клапана
    case 'valve':
      specificFields = <ValveSpecFields specs={specs} onSpecChange={onSpecChange} />;
      break;
    
    // Электрооборудование - компонент с полями: Наименование, Инвентарный номер, Мощность, Напряжение, и т.д.
    case 'electrical':
      specificFields = <ElectricalSpecFields specs={specs} onSpecChange={onSpecChange} />;
      break;
    
    // Вентиляционное оборудование - компонент с полями: Наименование, Инвентарный номер, Производительность, Мощность, и т.д.
    case 'ventilation':
      specificFields = <VentilationSpecFields specs={specs} onSpecChange={onSpecChange} />;
      break;
    
    // Сантехническое оборудование - компонент с полями: Наименование, Инвентарный номер, Диаметр, Материал, и т.д.
    case 'plumbing':
      specificFields = <PlumbingSpecFields specs={specs} onSpecChange={onSpecChange} />;
      break;
    
    // Прочее промышленное оборудование - компонент с полями: Наименование, Инвентарный номер, Заводской номер, Производительность
    case 'industrial':
      specificFields = <IndustrialSpecFields specs={specs} onSpecChange={onSpecChange} />;
      break;
    
    // Другое - компонент с полями: Наименование, Инвентарный номер
    // Использует стандартный onSpecChange (как и другие типы)
    case 'other':
      specificFields = <OtherSpecFields specs={specs} onSpecChange={onSpecChange} />;
      break;
    
    // Если тип не распознан, ничего не рендерим
    default:
      return null;
  }
  
  /**
   * Возвращаем специфичные поля + универсальное поле "Дополнительные характеристики"
   * для всех типов оборудования (включая 'other')
   */
  return (
    <>
      {specificFields}
      {/* Дополнительные характеристики доступны для всех типов оборудования */}
      <AdditionalNotesField specs={specs} onSpecChange={onSpecChange} />
    </>
  );
};

