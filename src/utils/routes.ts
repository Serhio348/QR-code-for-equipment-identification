/**
 * Утилиты для работы с маршрутами приложения
 * Централизованное управление путями для избежания хардкода
 */

/**
 * Базовые маршруты приложения
 */
export const ROUTES = {
  /** Главная страница - список оборудования */
  HOME: '/',
  
  /** Страница входа */
  LOGIN: '/login',
  
  /** Страница регистрации */
  REGISTER: '/register',
  
  /** Создание нового оборудования */
  EQUIPMENT_NEW: '/equipment/new',
  
  /** Просмотр оборудования по ID */
  EQUIPMENT_VIEW: (id: string) => `/equipment/${id}`,
  
  /** Редактирование оборудования по ID */
  EQUIPMENT_EDIT: (id: string) => `/equipment/${id}/edit`,
  
  /** Тестирование Beliot API */
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

