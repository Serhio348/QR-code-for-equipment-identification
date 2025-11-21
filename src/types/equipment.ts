/**
 * Типы оборудования
 * Определяет возможные типы оборудования в системе
 */
export type EquipmentType = 'filter' | 'pump' | 'tank' | 'valve' | 'other';

/**
 * Статусы оборудования
 * Определяет возможные статусы оборудования
 * - active: Активно используется
 * - inactive: Неактивно (временно не используется)
 * - archived: Архивировано (мягкое удаление)
 */
export type EquipmentStatus = 'active' | 'inactive' | 'archived';

/**
 * Базовый интерфейс для характеристик оборудования
 * Использует индексную сигнатуру для гибкости - разные типы оборудования
 * могут иметь разные характеристики
 */
export interface EquipmentSpecs {
  [key: string]: any;
}

/**
 * Характеристики фильтра
 * Специфичные характеристики для фильтров обезжелезивания
 * Расширяет базовый EquipmentSpecs
 */
export interface FilterSpecs extends EquipmentSpecs {
  name?: string;
  height?: string;
  diameter?: string;
  capacity?: string;
  filtrationArea?: string;
  filtrationSpeed?: string;
  fillingMaterial?: string;
  fillingVolume?: string;
}

export const filterSpecs: FilterSpecs = {
  name: 'Фильтр обезжелезивания ФО-0,8-1,5',
  height: '1,5 м',
  diameter: '0,8 м',
  capacity: '5 м³',
  filtrationArea: '0,5 м²',
  filtrationSpeed: '10 м/ч',
  fillingMaterial: 'Nevtraco 1,0-2,5 мм',
  fillingVolume: '350 л'
};

