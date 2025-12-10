/**
 * access.ts
 * 
 * Типы для управления доступом к приложениям/вкладкам
 */

/**
 * Доступные приложения в системе
 */
export type AppId = 'equipment' | 'water';

/**
 * Интерфейс приложения
 */
export interface App {
  /** ID приложения */
  id: AppId;
  
  /** Название приложения */
  name: string;
  
  /** Описание приложения */
  description: string;
  
  /** Маршрут приложения */
  route: string;
}

/**
 * Настройки доступа пользователя к приложениям
 */
export interface UserAppAccess {
  /** Email пользователя */
  email: string;
  
  /** ID пользователя */
  userId: string;
  
  /** Имя пользователя */
  name?: string;
  
  /** Доступ к приложению "Оборудование" */
  equipment: boolean;
  
  /** Доступ к приложению "Вода" */
  water: boolean;
  
  /** Дата последнего обновления */
  updatedAt: string;
  
  /** Email пользователя, который обновил настройки */
  updatedBy?: string;
}

/**
 * Данные для обновления доступа пользователя
 */
export interface UpdateUserAccessData {
  /** Email пользователя */
  email: string;
  
  /** Доступ к приложениям */
  access: {
    equipment?: boolean;
    water?: boolean;
  };
}

/**
 * Список всех доступных приложений
 */
export const AVAILABLE_APPS: App[] = [
  {
    id: 'equipment',
    name: 'Оборудование',
    description: 'Управление оборудованием по QR-кодам',
    route: '/equipment',
  },
  {
    id: 'water',
    name: 'Вода',
    description: 'Счётчики воды',
    route: '/water',
  },
];

