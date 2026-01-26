/**
 * ElectricalSpecFields.tsx
 * 
 * НАЗНАЧЕНИЕ:
 * Компонент для отображения полей спецификаций типа оборудования "Электрооборудование".
 * Содержит поля для описания электрического оборудования (двигатели, щиты, кабели и т.д.).
 * 
 * СТРУКТУРА ПОЛЕЙ:
 * 1. Наименование (общее поле) - обязательное
 * 2. Инвентарный номер (общее поле) - необязательное
 * 3. Мощность - потребляемая или номинальная мощность
 * 4. Напряжение - рабочее напряжение
 * 5. Ток - рабочий ток
 * 6. Тип оборудования - категория электрооборудования
 * 7. Класс защиты - степень защиты от внешних воздействий (IP)
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
 * Интерфейс пропсов ElectricalSpecFields
 */
interface ElectricalSpecFieldsProps {
  specs: EquipmentSpecs;                              // Все характеристики электрооборудования
  onSpecChange: (key: string, value: string) => void; // Функция обновления поля
}

/**
 * Компонент ElectricalSpecFields
 * 
 * ЛОГИКА:
 * Рендерит последовательность полей для электрооборудования.
 * Фокус на электрических параметрах и характеристиках безопасности.
 */
export const ElectricalSpecFields: React.FC<ElectricalSpecFieldsProps> = ({ specs, onSpecChange }) => {
  return (
    <>
      {/* Общие поля для всех типов оборудования */}
      <NameField specs={specs} onSpecChange={onSpecChange} />
      <InventoryNumberField specs={specs} onSpecChange={onSpecChange} />
      
      {/* Специфичные поля для электрооборудования */}
      
      {/* Мощность - потребляемая или номинальная мощность оборудования */}
      <SpecField
        label="Мощность"
        value={specs.power || ''}
        onChange={(value) => onSpecChange('power', value)}
        placeholder="Например: 5,5 кВт"
      />
      
      {/* Напряжение - рабочее напряжение (220В, 380В и т.д.) */}
      <SpecField
        label="Напряжение"
        value={specs.voltage || ''}
        onChange={(value) => onSpecChange('voltage', value)}
        placeholder="Например: 380 В"
      />
      
      {/* Ток - рабочий ток (номинальный или максимальный) */}
      <SpecField
        label="Ток"
        value={specs.current || ''}
        onChange={(value) => onSpecChange('current', value)}
        placeholder="Например: 10 А"
      />
      
      {/* Тип оборудования - категория (электродвигатель, щит управления, кабель и т.д.) */}
      <SpecField
        label="Тип оборудования"
        value={specs.equipmentType || ''}
        onChange={(value) => onSpecChange('equipmentType', value)}
        placeholder="Например: Электродвигатель, Щит управления"
      />
      
      {/* Класс защиты - степень защиты от пыли и влаги (IP54, IP65 и т.д.) */}
      <SpecField
        label="Класс защиты"
        value={specs.protectionClass || ''}
        onChange={(value) => onSpecChange('protectionClass', value)}
        placeholder="Например: IP54"
      />
    </>
  );
};

