/**
 * maintenance.ts
 *
 * TypeScript типы для журнала обслуживания оборудования.
 */

// ============================================
// Статусы записей
// ============================================

/**
 * Возможные статусы записи обслуживания.
 * type alias с union типом - ограниченный набор строк
 */
export type MaintenanceStatus = 'completed' | 'planned' | 'in_progress' | 'cancelled';

// ============================================
// Основной интерфейс записи
// ============================================

/**
 * Запись в журнале обслуживания.
 */
export interface MaintenanceEntry {
  /** ID оборудования (связь с Equipment) */
  equipmentId: string;

  /** Уникальный ID записи */
  entryId: string;

  /** Дата обслуживания (YYYY-MM-DD) */
  date: string;

  /** Тип работы (например: "Техническое освидетельствование") */
  type: string;

  /** Подробное описание выполненных работ */
  description: string;

  /** Кто выполнил работу (ФИО) */
  performedBy: string;

  /** Статус работы */
  status: MaintenanceStatus;

  /** Дата создания записи */
  createdAt?: string;
}

// ============================================
// Типы для CRUD операций
// ============================================

/**
 * Данные для создания новой записи.
 */
export interface CreateMaintenanceInput {
  /** ID оборудования */
  equipmentId: string;

  /** Дата обслуживания */
  date: string;

  /** Тип работы */
  type: string;

  /** Описание */
  description: string;

  /** Исполнитель */
  performedBy: string;

  /** Статус (по умолчанию 'completed') */
  status?: MaintenanceStatus;
}

/**
 * Данные для обновления записи.
 */
export interface UpdateMaintenanceInput {
  /** ID записи для обновления */
  entryId: string;

  /** Новая дата (опционально) */
  date?: string;

  /** Новый тип (опционально) */
  type?: string;

  /** Новое описание (опционально) */
  description?: string;

  /** Новый исполнитель (опционально) */
  performedBy?: string;

  /** Новый статус (опционально) */
  status?: MaintenanceStatus;
}