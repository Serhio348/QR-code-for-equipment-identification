/**
 * user.ts
 * 
 * Типы для пользователей и ролей в системе
 */

/**
 * Роли пользователей в системе
 */
export type UserRole = 'admin' | 'user';

/**
 * Интерфейс пользователя
 */
export interface User {
  /** Уникальный идентификатор пользователя (UUID) */
  id: string;
  
  /** Email пользователя (уникальный, используется для входа) */
  email: string;
  
  /** Имя пользователя (опционально) */
  name?: string;
  
  /** Роль пользователя в системе */
  role: UserRole;
  
  /** Дата и время создания аккаунта (ISO строка) */
  createdAt: string;
  
  /** Дата и время последнего входа (ISO строка, опционально) */
  lastLoginAt?: string;
  
  /** Дата и время последней активности (ISO строка, для проверки таймаута) */
  lastActivityAt?: string;
}

/**
 * Данные для регистрации нового пользователя
 */
export interface RegisterData {
  /** Email пользователя */
  email: string;
  
  /** Пароль пользователя */
  password: string;
  
  /** Имя пользователя (опционально) */
  name?: string;
}

/**
 * Данные для входа пользователя
 */
export interface LoginData {
  /** Email пользователя */
  email: string;
  
  /** Пароль пользователя */
  password: string;
}

/**
 * Ответ при успешной регистрации или входе
 */
export interface AuthResponse {
  /** Данные пользователя */
  user: User;
  
  /** Токен сессии (для отслеживания активности) */
  sessionToken: string;
  
  /** Время истечения сессии (ISO строка) */
  expiresAt: string;
  
  /** Сообщение об успехе */
  message?: string;
}

/**
 * Данные для смены пароля
 */
export interface ChangePasswordData {
  /** Текущий пароль */
  currentPassword: string;
  
  /** Новый пароль */
  newPassword: string;
  
  /** Подтверждение нового пароля */
  confirmPassword: string;
}

