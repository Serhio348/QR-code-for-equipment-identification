/**
 * Конфигурация полей характеристик для каждого типа оборудования
 * Используется для настроек экспорта PDF карточки оборудования
 */

import { EquipmentType } from '../types/equipment';

export interface SpecFieldConfig {
  key: string;
  label: string;
}

/**
 * Конфигурация полей для каждого типа оборудования
 */
export const EQUIPMENT_SPEC_FIELDS: Record<EquipmentType, SpecFieldConfig[]> = {
  filter: [
    { key: 'inventoryNumber', label: 'Инвентарный номер' },
    { key: 'height', label: 'Высота' },
    { key: 'diameter', label: 'Диаметр' },
    { key: 'capacity', label: 'Производительность' },
    { key: 'filtrationArea', label: 'Площадь фильтрации' },
    { key: 'filtrationSpeed', label: 'Скорость фильтрации' },
    { key: 'fillingMaterial', label: 'Материал засыпки' },
    { key: 'fillingVolume', label: 'Объем засыпки' },
  ],
  pump: [
    { key: 'inventoryNumber', label: 'Инвентарный номер' },
    { key: 'capacity', label: 'Производительность' },
    { key: 'pressure', label: 'Напор' },
    { key: 'power', label: 'Мощность' },
    { key: 'voltage', label: 'Напряжение' },
    { key: 'diameter', label: 'Диаметр подключения' },
  ],
  tank: [
    { key: 'inventoryNumber', label: 'Инвентарный номер' },
    { key: 'volume', label: 'Объем' },
    { key: 'height', label: 'Высота' },
    { key: 'diameter', label: 'Диаметр' },
  ],
  valve: [
    { key: 'inventoryNumber', label: 'Инвентарный номер' },
    { key: 'diameter', label: 'Диаметр' },
    { key: 'valveType', label: 'Тип клапана' },
  ],
  electrical: [
    { key: 'inventoryNumber', label: 'Инвентарный номер' },
    { key: 'power', label: 'Мощность' },
    { key: 'voltage', label: 'Напряжение' },
    { key: 'current', label: 'Ток' },
    { key: 'equipmentType', label: 'Тип оборудования' },
    { key: 'protectionClass', label: 'Класс защиты' },
  ],
  ventilation: [
    { key: 'inventoryNumber', label: 'Инвентарный номер' },
    { key: 'capacity', label: 'Производительность' },
    { key: 'power', label: 'Мощность' },
    { key: 'fanType', label: 'Тип вентилятора' },
    { key: 'diameter', label: 'Диаметр' },
    { key: 'pressure', label: 'Напор' },
  ],
  plumbing: [
    { key: 'inventoryNumber', label: 'Инвентарный номер' },
    { key: 'diameter', label: 'Диаметр' },
    { key: 'material', label: 'Материал' },
    { key: 'equipmentType', label: 'Тип оборудования' },
    { key: 'workingPressure', label: 'Рабочее давление' },
    { key: 'temperature', label: 'Температура' },
  ],
  energy_source: [
    { key: 'serialNumber', label: 'Серийный номер' },
    { key: 'registrationNumber', label: 'Регистрационный номер' },
    { key: 'energySourceType', label: 'Тип энергоисточника' },
    { key: 'powerKw', label: 'Мощность (кВт)' },
    { key: 'fuelType', label: 'Топливо' },
    { key: 'fuelConsumption', label: 'Расход топлива' },
    { key: 'efficiency', label: 'КПД' },
    { key: 'workingPressure', label: 'Рабочее давление' },
    { key: 'outputTemperature', label: 'Температура воды на выходе' },
    { key: 'voltage', label: 'Напряжение' },
    { key: 'manufacturer', label: 'Производитель' },
    { key: 'model', label: 'Модель' },
    { key: 'nextTestDate', label: 'Дата следующего испытания' },
  ],
  industrial: [
    { key: 'inventoryNumber', label: 'Инвентарный номер' },
    { key: 'serialNumber', label: 'Заводской номер' },
    { key: 'capacity', label: 'Производительность' },
  ],
  other: [
    { key: 'inventoryNumber', label: 'Инвентарный номер' },
  ],
};

/**
 * Общие поля, доступные для всех типов оборудования
 */
export const COMMON_SPEC_FIELDS: SpecFieldConfig[] = [
  { key: 'additionalNotes', label: 'Дополнительные характеристики' },
];

/**
 * Получить список полей для типа оборудования
 */
export function getSpecFieldsForType(type: EquipmentType): SpecFieldConfig[] {
  return EQUIPMENT_SPEC_FIELDS[type] || EQUIPMENT_SPEC_FIELDS.other;
}

/**
 * Получить все доступные поля для типа оборудования (включая общие)
 */
export function getAllSpecFieldsForType(type: EquipmentType): SpecFieldConfig[] {
  return [...getSpecFieldsForType(type), ...COMMON_SPEC_FIELDS];
}
