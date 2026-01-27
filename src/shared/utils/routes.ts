/**
 * Утилиты для работы с маршрутами приложения
 * Централизованное управление путями для избежания хардкода
 */

/**
 * Базовые маршруты приложения
 */
export const ROUTES = {
  /** Главное меню - выбор между приложениями */
  HOME: '/',
  
  /** Страница входа */
  LOGIN: '/login',
  
  /** Страница регистрации */
  REGISTER: '/register',
  
  /** Страница восстановления пароля */
  RESET_PASSWORD: '/reset-password',
  
  /** Страница списка оборудования */
  EQUIPMENT: '/equipment',
  
  /** Создание нового оборудования */
  EQUIPMENT_NEW: '/equipment/new',
  
  /** Просмотр оборудования по ID */
  EQUIPMENT_VIEW: (id: string) => `/equipment/${id}`,
  
  /** Редактирование оборудования по ID */
  EQUIPMENT_EDIT: (id: string) => `/equipment/${id}/edit`,
  
  /** Страница счётчиков воды */
  WATER: '/water',
  
  /** Страница журнала анализов качества воды */
  WATER_QUALITY_JOURNAL: '/water-quality/journal',
  
  /** Страница оповещений о превышении нормативов */
  WATER_QUALITY_ALERTS: '/water-quality/alerts',
  
  /** Страница управления нормативами качества воды */
  WATER_QUALITY_NORMS: '/water-quality/norms',
  
  /** Создание нового норматива качества воды */
  WATER_QUALITY_NORM_NEW: '/water-quality/norm/new',
  
  /** Просмотр норматива качества воды по ID */
  WATER_QUALITY_NORM_VIEW: (id: string) => `/water-quality/norm/${id}`,
  
  /** Редактирование норматива качества воды по ID */
  WATER_QUALITY_NORM_EDIT: (id: string) => `/water-quality/norm/${id}/edit`,
  
  /** Создание нового анализа качества воды */
  WATER_QUALITY_ANALYSIS_NEW: '/water-quality/analysis/new',
  
  /** Просмотр анализа качества воды по ID */
  WATER_QUALITY_ANALYSIS_VIEW: (id: string) => `/water-quality/analysis/${id}`,
  
  /** Редактирование анализа качества воды по ID */
  WATER_QUALITY_ANALYSIS_EDIT: (id: string) => `/water-quality/analysis/${id}/edit`,
  
  /** Страница управления точками отбора проб */
  WATER_QUALITY_SAMPLING_POINTS: '/water-quality/sampling-points',
  
  /** Создание новой точки отбора проб */
  WATER_QUALITY_SAMPLING_POINT_NEW: '/water-quality/sampling-point/new',
  
  /** Просмотр точки отбора проб по ID */
  WATER_QUALITY_SAMPLING_POINT_VIEW: (id: string) => `/water-quality/sampling-point/${id}`,
  
  /** Редактирование точки отбора проб по ID */
  WATER_QUALITY_SAMPLING_POINT_EDIT: (id: string) => `/water-quality/sampling-point/${id}/edit`,
  
  /** Страница настроек доступа к приложениям (только для администраторов) */
  ACCESS_SETTINGS: '/admin/access-settings',
  
  /** Страница просмотра логов ошибок (только для администраторов) */
  ERROR_LOGS: '/admin/error-logs',
  
  /** Страница управления участками (только для администраторов) */
  WORKSHOP_SETTINGS: '/admin/workshop-settings',
  
  /** Тестирование Beliot API (устаревший маршрут, используйте WATER) */
  BELIOT_TEST: '/beliot-test',
} as const;

/**
 * Генерация URL для просмотра оборудования
 * 
 * @param id - ID оборудования
 * @returns URL страницы просмотра
 * 
 * @example
 * const url = getEquipmentViewUrl('550e8400-e29b-41d4-a716-446655440000');
 * // '/equipment/550e8400-e29b-41d4-a716-446655440000'
 */
export function getEquipmentViewUrl(id: string): string {
  return ROUTES.EQUIPMENT_VIEW(id);
}

/**
 * Генерация URL для редактирования оборудования
 * 
 * @param id - ID оборудования
 * @returns URL страницы редактирования
 * 
 * @example
 * const url = getEquipmentEditUrl('550e8400-e29b-41d4-a716-446655440000');
 * // '/equipment/550e8400-e29b-41d4-a716-446655440000/edit'
 */
export function getEquipmentEditUrl(id: string): string {
  return ROUTES.EQUIPMENT_EDIT(id);
}

/**
 * Извлечение ID оборудования из URL
 * 
 * @param pathname - Путь из location.pathname
 * @returns ID оборудования или null
 * 
 * @example
 * const id = extractEquipmentId('/equipment/550e8400-e29b-41d4-a716-446655440000');
 * // '550e8400-e29b-41d4-a716-446655440000'
 */
export function extractEquipmentId(pathname: string): string | null {
  const match = pathname.match(/^\/equipment\/([^/]+)/);
  return match ? match[1] : null;
}

/**
 * Проверка, является ли путь маршрутом оборудования
 * 
 * @param pathname - Путь из location.pathname
 * @returns true если это маршрут оборудования
 */
export function isEquipmentRoute(pathname: string): boolean {
  return pathname.startsWith('/equipment');
}
