/**
 * Типы оборудования
 * Определяет возможные типы оборудования в системе
 */
export type EquipmentType = 
  | 'filter'           // Фильтры
  | 'pump'             // Насосы
  | 'tank'             // Резервуары
  | 'valve'            // Клапаны
  | 'electrical'       // Электрооборудование
  | 'ventilation'      // Вентиляционное оборудование
  | 'plumbing'         // Сантехническое оборудование
  | 'industrial'       // Прочее промышленное оборудование
  | 'other';           // Другое

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
  /** Название фильтра (используется в EquipmentPlate) */
  name: string;
  height?: string;
  diameter?: string;
  capacity?: string;
  filtrationArea?: string;
  filtrationSpeed?: string;
  fillingMaterial?: string;
  fillingVolume?: string;
}

/**
 * Основной интерфейс оборудования
 * Представляет полную информацию об единице оборудования в базе данных
 * Соответствует структуре данных в Google Sheets таблице
 */
export interface Equipment {
  /** Уникальный идентификатор оборудования (UUID) */
  id: string;
  
  /** Название оборудования */
  name: string;
  
  /** Тип оборудования (filter, pump, tank, valve, electrical, ventilation, plumbing, industrial, other) */
  type: EquipmentType;
  
  /** Характеристики оборудования (JSON объект, структура зависит от типа) */
  specs: EquipmentSpecs;
  
  /** URL папки в Google Drive с документацией */
  googleDriveUrl: string;
  
  /** URL для QR-кода (обычно совпадает с googleDriveUrl или ссылка на страницу оборудования) */
  qrCodeUrl: string;
  
  /** Дата ввода в эксплуатацию (формат: YYYY-MM-DD) */
  commissioningDate?: string;
  
  /** Дата последнего обслуживания (формат: YYYY-MM-DD) */
  lastMaintenanceDate?: string;
  
  /** Статус оборудования (active, inactive, archived) */
  status: EquipmentStatus;
  
  /** Дата и время создания записи (ISO 8601) */
  createdAt: string;
  
  /** Дата и время последнего обновления (ISO 8601) */
  updatedAt: string;

  /** ID файла журнала обслуживания в папке оборудования (если создан) */
  maintenanceSheetId?: string;

  /** URL файла журнала обслуживания (Google Sheets) */
  maintenanceSheetUrl?: string;
}

/**
 * Интерфейс ответа API
 * Используется для всех запросов к Google Apps Script API
 * 
 * @template T - Тип данных в поле data
 * 
 * Пример успешного ответа:
 * {
 *   success: true,
 *   data: Equipment или Equipment[]
 * }
 * 
 * Пример ответа с ошибкой:
 * {
 *   success: false,
 *   error: "Описание ошибки"
 * }
 */
export interface ApiResponse<T> {
  /** Успешность выполнения запроса */
  success: boolean;
  
  /** Данные ответа (присутствует только при success: true) */
  data?: T;
  
  /** Сообщение об ошибке (присутствует только при success: false) */
  error?: string;
}

/**
 * Статусы записей журнала обслуживания
 * - completed: Работа выполнена
 * - planned: Работа запланирована
 */
export type MaintenanceStatus = 'completed' | 'planned';

/**
 * Интерфейс записи журнала обслуживания
 * Представляет одну запись в журнале обслуживания оборудования
 * Соответствует структуре данных в таблице "Журнал обслуживания"
 */
export interface MaintenanceEntry {
  /** Уникальный идентификатор записи (UUID) */
  id: string;
  
  /** ID оборудования, к которому относится запись */
  equipmentId: string;
  
  /** Дата обслуживания (формат: YYYY-MM-DD) */
  date: string;
  
  /** Тип работы (Промывка, Замена засыпки, Проверка, Ремонт, Другое) */
  type: string;
  
  /** Описание выполненной работы */
  description: string;
  
  /** ФИО исполнителя */
  performedBy: string;
  
  /** Статус записи (completed/planned) */
  status: MaintenanceStatus;
  
  /** Дата и время создания записи (ISO 8601) */
  createdAt: string;
}

/**
 * Данные для создания новой записи в журнале обслуживания
 * Используется при добавлении записи (некоторые поля опциональны)
 */
export interface MaintenanceEntryInput {
  /** Дата обслуживания (формат: YYYY-MM-DD) */
  date: string;
  
  /** Тип работы */
  type: string;
  
  /** Описание выполненной работы */
  description: string;
  
  /** ФИО исполнителя */
  performedBy: string;
  
  /** Статус записи (по умолчанию: completed) */
  status?: MaintenanceStatus;
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

