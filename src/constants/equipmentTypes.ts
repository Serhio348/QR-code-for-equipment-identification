/**
 * equipmentTypes.ts
 * 
 * НАЗНАЧЕНИЕ:
 * Константы для типов оборудования и их локализованных названий.
 * Централизованное хранение всех типов оборудования и их метаданных.
 * 
 * ПРЕИМУЩЕСТВА:
 * - Единый источник правды для типов оборудования
 * - Легко добавлять новые типы
 * - Легко изменять названия типов
 * - Используется в формах, фильтрах, списках
 */

import { EquipmentType } from '../types/equipment';

/**
 * Маппинг типов оборудования на их локализованные названия
 * 
 * Используется для отображения в UI (селекты, фильтры, списки)
 */
export const EQUIPMENT_TYPE_LABELS: Record<EquipmentType, string> = {
  filter: 'Фильтр',
  pump: 'Насос',
  tank: 'Резервуар',
  valve: 'Клапан',
  electrical: 'Электрооборудование',
  ventilation: 'Вентиляционное оборудование',
  plumbing: 'Сантехническое оборудование',
  industrial: 'Прочее промышленное оборудование',
  other: 'Другое',
};

/**
 * Массив всех типов оборудования для использования в селектах
 * 
 * Порядок элементов определяет порядок отображения в UI
 */
export const EQUIPMENT_TYPES: EquipmentType[] = [
  'filter',
  'pump',
  'tank',
  'valve',
  'electrical',
  'ventilation',
  'plumbing',
  'industrial',
  'other',
];

/**
 * Получить локализованное название типа оборудования
 * 
 * @param type - Тип оборудования
 * @returns Локализованное название или сам тип, если не найден
 * 
 * @example
 * getEquipmentTypeLabel('filter') // "Фильтр"
 * getEquipmentTypeLabel('pump') // "Насос"
 */
export function getEquipmentTypeLabel(type: EquipmentType | string): string {
  return EQUIPMENT_TYPE_LABELS[type as EquipmentType] || type;
}

/**
 * Опции для селекта типов оборудования
 * 
 * Используется в формах для выбора типа оборудования
 */
export const EQUIPMENT_TYPE_OPTIONS = EQUIPMENT_TYPES.map((type) => ({
  value: type,
  label: EQUIPMENT_TYPE_LABELS[type],
}));

