/**
 * OtherSpecFields.tsx
 * 
 * НАЗНАЧЕНИЕ:
 * Компонент для отображения полей спецификаций типа оборудования "Другое".
 * Использует стандартные поля, как и другие типы оборудования.
 * 
 * ОСОБЕННОСТИ:
 * - Использует общие поля: NameField, InventoryNumberField
 * - Не имеет специфичных полей, только базовые
 * - Дополнительные характеристики добавляются через AdditionalNotesField
 * - Использует стандартный onSpecChange (как и другие типы)
 * 
 * ИСПОЛЬЗОВАНИЕ:
 * Подходит для оборудования с нестандартными характеристиками, которые
 * можно описать в поле "Дополнительные характеристики".
 */

import React from 'react';
import { EquipmentSpecs } from '../../../types/equipment';
import { NameField, InventoryNumberField } from './CommonSpecFields';

/**
 * Интерфейс пропсов OtherSpecFields
 * 
 * СТАНДАРТНЫЙ ИНТЕРФЕЙС:
 * Использует такой же интерфейс, как и другие типы оборудования:
 * - onSpecChange: (key: string, value: string) => void
 * Это обеспечивает единообразие со всеми остальными типами.
 */
interface OtherSpecFieldsProps {
  specs: EquipmentSpecs;                              // Все характеристики
  onSpecChange: (key: string, value: string) => void; // Функция обновления одного поля
}

/**
 * Компонент OtherSpecFields
 * 
 * ЛОГИКА РАБОТЫ:
 * 1. Отображает стандартные поля: Наименование, Инвентарный номер
 * 2. Дополнительные характеристики добавляются через AdditionalNotesField в SpecFieldsRenderer
 * 3. Работает так же, как и другие типы оборудования
 * 
 * ПРЕИМУЩЕСТВА:
 * - Единообразие с другими типами оборудования
 * - Простота использования (без JSON)
 * - Удобно для пользователей без технических знаний
 */
export const OtherSpecFields: React.FC<OtherSpecFieldsProps> = ({ specs, onSpecChange }) => {
  return (
    <>
      {/* Общие поля для всех типов оборудования */}
      <NameField specs={specs} onSpecChange={onSpecChange} />
      <InventoryNumberField specs={specs} onSpecChange={onSpecChange} />
      
      {/* 
        Специфичных полей для типа "Другое" нет.
        Дополнительные характеристики добавляются через AdditionalNotesField
        в SpecFieldsRenderer после рендера этого компонента.
      */}
    </>
  );
};

