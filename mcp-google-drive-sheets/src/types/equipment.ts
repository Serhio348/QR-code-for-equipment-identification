/**
 * equipment.ts
 *
 * TypeScript типы для оборудования.
 * Копируем структуру из основного проекта для совместимости.
 */

// ============================================
// Интерфейс характеристик оборудования
// ============================================

/**
 * Технические характеристики оборудования.
 * Все поля опциональные (?) так как зависят от типа оборудования.
 */
export interface EquipmentSpecs {
  /** Производитель */
  manufacturer?: string;

  /** Модель */
  model?: string;

  /** Серийный номер */
  serialNumber?: string;

  /** Регистрационный номер */
  registrationNumber?: string;

  /** Тип энергоисточника */
  energySourceType?: string;

  /** Мощность в кВт */
  powerKw?: string;

  /** Рабочее давление */
  workingPressure?: string;

  /** Дата следующего испытания */
  nextTestDate?: string;

  /** Произвольные дополнительные поля */
  [key: string]: string | undefined;
}

// ============================================
// Основной интерфейс оборудования
// ============================================

/**
 * Полная информация об оборудовании.
 * Соответствует структуре в Google Sheets.
 */
export interface Equipment {
  /** Уникальный идентификатор (UUID) */
  id: string;

  /** Название оборудования */
  name: string;

  /** Тип оборудования (filter, pump, tank, boiler и т.д.) */
  type: string;

  /** Технические характеристики */
  specs: EquipmentSpecs;

  /** URL папки в Google Drive */
  googleDriveUrl?: string;

  /** URL QR-кода */
  qrCodeUrl?: string;

  /** Дата ввода в эксплуатацию (ISO 8601: YYYY-MM-DD) */
  commissioningDate?: string;

  /** Дата последнего обслуживания */
  lastMaintenanceDate?: string;

  /** Статус оборудования */
  status: 'active' | 'inactive' | 'archived';

  /** Дата создания записи */
  createdAt?: string;

  /** Дата последнего обновления */
  updatedAt?: string;

  /** ID листа журнала обслуживания */
  maintenanceSheetId?: string;

  /** URL листа журнала обслуживания */
  maintenanceSheetUrl?: string;
}

// ============================================
// Типы для CRUD операций
// ============================================

/**
 * Данные для создания нового оборудования.
 * Omit<T, K> - создает тип T без полей K
 * Partial<T> - делает все поля T опциональными
 */
export type CreateEquipmentInput = Omit<Equipment, 'id' | 'createdAt' | 'updatedAt'> & {
  /** ID родительской папки для Google Drive (опционально) */
  parentFolderId?: string;
};

/**
 * Данные для обновления оборудования.
 * Partial<T> - все поля становятся опциональными
 */
export type UpdateEquipmentInput = Partial<Omit<Equipment, 'id' | 'createdAt'>>;

// ============================================
// Типы для фильтрации
// ============================================

/**
 * Параметры фильтрации списка оборудования.
 */
export interface EquipmentFilter {
  /** Фильтр по типу */
  type?: string;

  /** Фильтр по статусу */
  status?: Equipment['status'];

  /** Поиск по названию (частичное совпадение) */
  search?: string;
}
