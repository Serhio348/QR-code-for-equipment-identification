/**
 * auth.ts
 * 
 * Типы для аутентификации и авторизации
 */

import { User } from './user';

/**
 * Сессия пользователя (хранится в sessionStorage)
 */
export interface UserSession {
  /** Данные пользователя */
  user: User;
  
  /** Токен сессии */
  token: string;
  
  /** Время истечения сессии (ISO строка) */
  expiresAt: string;
  
  /** Время последней активности (ISO строка) */
  lastActivityAt: string;
}

/**
 * Состояние аутентификации
 */
export interface AuthState {
  /** Текущий пользователь (null если не авторизован) */
  user: User | null;
  
  /** Состояние загрузки (проверка авторизации) */
  loading: boolean;
  
  /** Ошибка аутентификации (если есть) */
  error: string | null;
  
  /** Проверка, авторизован ли пользователь */
  isAuthenticated: boolean;
  
  /** Проверка, является ли пользователь администратором */
  isAdmin: boolean;
}

/**
 * История входа пользователя
 */
export interface LoginHistoryEntry {
  /** Уникальный идентификатор записи (UUID) */
  id: string;
  
  /** Email пользователя */
  email: string;
  
  /** Дата и время входа (ISO строка) */
  loginAt: string;
  
  /** IP адрес (если доступен) */
  ipAddress?: string;
  
  /** Успешный вход (true) или неуспешный (false) */
  success: boolean;
  
  /** Причина неуспешного входа (если success = false) */
  failureReason?: string;
}

/**
 * Данные для проверки сессии
 */
export interface SessionCheckResponse {
  /** Сессия активна */
  active: boolean;
  
  /** Оставшееся время до истечения сессии (в миллисекундах) */
  remainingTime?: number;
  
  /** Сообщение (если сессия истекла) */
  message?: string;
}

/**
 * Данные администратора (для управления)
 */
export interface AdminInfo {
  /** Email администратора */
  email: string;
  
  /** Дата добавления (ISO строка) */
  addedAt: string;
  
  /** Добавлен вручную (true) или автоматически через Google Drive (false) */
  addedManually: boolean;
  
  /** Приоритет (основной/резервный) */
  priority: 'primary' | 'backup';
  
  /** Примечание */
  note?: string;
}

/**
 * Права доступа к действиям
 */
export type PermissionAction = 
  | 'equipment:create'
  | 'equipment:read'
  | 'equipment:update'
  | 'equipment:delete'
  | 'equipment:list'
  | 'maintenance:read'
  | 'maintenance:create'
  | 'maintenance:update'
  | 'maintenance:delete'
  | 'documentation:read'
  | 'admin:manage'
  | 'admin:view-history';

/**
 * Проверка прав доступа
 */
export interface PermissionCheck {
  /** Действие, для которого проверяются права */
  action: PermissionAction;
  
  /** Есть ли права на это действие */
  allowed: boolean;
  
  /** Сообщение (если нет прав) */
  message?: string;
}

