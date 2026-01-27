/**
 * CommonSpecFields.tsx
 * 
 * НАЗНАЧЕНИЕ:
 * Содержит общие поля спецификаций, которые используются ВСЕМИ типами оборудования.
 * Это поля "Наименование" и "Инвентарный номер" - они всегда первыми в форме.
 * 
 * АРХИТЕКТУРА:
 * - Экспортирует два компонента: NameField и InventoryNumberField
 * - Эти компоненты используются в каждом *SpecFields.tsx компоненте
 * - Обеспечивает единообразие общих полей во всех типах оборудования
 * 
 * ИСПОЛЬЗОВАНИЕ:
 * Импортируется в каждом компоненте типа оборудования:
 * import { NameField, InventoryNumberField } from './CommonSpecFields';
 */

import React from 'react';
import { EquipmentSpecs } from '../../../types/equipment';

/**
 * Интерфейс пропсов для общих полей
 * 
 * @param specs - Объект со всеми характеристиками оборудования
 * @param onSpecChange - Функция для обновления конкретного поля в specs
 */
interface CommonSpecFieldsProps {
  specs: EquipmentSpecs;                              // Все характеристики
  onSpecChange: (key: string, value: string) => void; // Обновление поля по ключу
}

/**
 * NameField - Поле "Наименование"
 * 
 * НАЗНАЧЕНИЕ:
 * Первое обязательное поле для ВСЕХ типов оборудования.
 * Содержит название/модель/марку оборудования.
 * 
 * ЛОГИКА:
 * - Всегда обязательное поле (required)
 * - Значение хранится в specs.name
 * - При изменении вызывает onSpecChange('name', новоеЗначение)
 * 
 * ПРИМЕРЫ ЗНАЧЕНИЙ:
 * - "Фильтр обезжелезивания ФО-0,8-1,5 №1"
 * - "Насос центробежный КМ 80/50-200/2"
 */
export const NameField: React.FC<CommonSpecFieldsProps> = ({ specs, onSpecChange }) => {
  return (
    <div className="form-group">
      {/* Метка с указанием обязательности */}
      <label>Наименование *</label>
      
      {/* 
        Input для наименования:
        - value: берем из specs.name или пустая строка
        - onChange: при изменении обновляем specs.name через onSpecChange
        - required: обязательное поле
      */}
      <input
        type="text"
        value={specs.name || ''}  // specs.name может быть undefined, используем || ''
        onChange={(e) => onSpecChange('name', e.target.value)}  // Обновляем поле 'name'
        placeholder="Например: Фильтр обезжелезивания ФО-0,8-1,5 №1"
        required  // HTML5 валидация обязательности
      />
    </div>
  );
};

/**
 * InventoryNumberField - Поле "Инвентарный номер"
 * 
 * НАЗНАЧЕНИЕ:
 * Второе поле для ВСЕХ типов оборудования (после Наименования).
 * Содержит инвентарный номер оборудования для учета.
 * 
 * ЛОГИКА:
 * - Необязательное поле (может быть пустым)
 * - Значение хранится в specs.inventoryNumber
 * - При изменении вызывает onSpecChange('inventoryNumber', новоеЗначение)
 * 
 * ПРИМЕРЫ ЗНАЧЕНИЙ:
 * - "ИН-001"
 * - "ИНВ-001234"
 * - "12345"
 */
export const InventoryNumberField: React.FC<CommonSpecFieldsProps> = ({ specs, onSpecChange }) => {
  return (
    <div className="form-group">
      {/* Метка без звездочки (поле необязательное) */}
      <label>Инвентарный номер</label>
      
      {/* 
        Input для инвентарного номера:
        - value: specs.inventoryNumber или пустая строка
        - onChange: обновляем поле 'inventoryNumber'
        - required отсутствует (поле необязательное)
      */}
      <input
        type="text"
        value={specs.inventoryNumber || ''}  // specs.inventoryNumber может быть undefined
        onChange={(e) => onSpecChange('inventoryNumber', e.target.value)}  // Обновляем 'inventoryNumber'
        placeholder="Например: ИН-001"
        // required отсутствует - поле необязательное
      />
    </div>
  );
};

/**
 * AdditionalNotesField - Поле "Дополнительные характеристики"
 * 
 * НАЗНАЧЕНИЕ:
 * Универсальное поле для ВСЕХ типов оборудования.
 * Позволяет вводить любые дополнительные характеристики, которые не входят в стандартные поля.
 * 
 * ЛОГИКА:
 * - Необязательное поле (может быть пустым)
 * - Значение хранится в specs.additionalNotes
 * - Использует textarea для многострочного ввода
 * - При изменении вызывает onSpecChange('additionalNotes', новоеЗначение)
 * 
 * ПРИМЕРЫ ЗНАЧЕНИЙ:
 * - "Особые условия эксплуатации: температура не выше 40°C"
 * - "Требуется ежегодная калибровка. Последняя калибровка: 15.03.2024"
 * - "Дополнительное оборудование: датчик давления, манометр"
 */
export const AdditionalNotesField: React.FC<CommonSpecFieldsProps> = ({ specs, onSpecChange }) => {
  return (
    <div className="form-group">
      {/* Метка без звездочки (поле необязательное) */}
      <label>Дополнительные характеристики</label>
      
      {/* 
        Textarea для дополнительных характеристик:
        - value: specs.additionalNotes или пустая строка
        - onChange: обновляем поле 'additionalNotes'
        - rows: количество строк (можно настроить)
        - placeholder: подсказка для пользователя
      */}
      <textarea
        value={specs.additionalNotes || ''}  // specs.additionalNotes может быть undefined
        onChange={(e) => onSpecChange('additionalNotes', e.target.value)}  // Обновляем 'additionalNotes'
        placeholder="Введите любые дополнительные характеристики, которые не входят в стандартные поля..."
        rows={4}  // Высота textarea (4 строки)
        style={{ resize: 'vertical' }}  // Разрешаем изменение размера только по вертикали
      />
    </div>
  );
};

