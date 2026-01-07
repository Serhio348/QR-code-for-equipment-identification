/**
 * sessionStorage.ts
 * 
 * Утилиты для работы с сессией пользователя в localStorage
 * 
 * Используется localStorage вместо sessionStorage для сохранения сессии
 * между обновлениями страницы и перезапусками браузера
 */

import type { UserSession } from '../types/auth';
import type { User } from '../types/user';

const SESSION_KEY = 'user_session';

/**
 * Сохранить сессию пользователя в localStorage
 * 
 * @param session - Объект сессии пользователя
 */
export function saveSession(session: UserSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch (error) {
    console.error('Ошибка сохранения сессии:', error);
  }
}

/**
 * Загрузить сессию пользователя из localStorage
 * 
 * @returns Объект сессии или null, если сессия не найдена
 */
export function loadSession(): UserSession | null {
  try {
    const sessionData = localStorage.getItem(SESSION_KEY);
    if (!sessionData) {
      return null;
    }
    
    const session = JSON.parse(sessionData) as UserSession;
    
    // Проверяем, что все необходимые поля присутствуют
    if (!session.user || !session.token || !session.expiresAt) {
      return null;
    }
    
    return session;
  } catch (error) {
    console.error('Ошибка загрузки сессии:', error);
    return null;
  }
}

/**
 * Удалить сессию пользователя из localStorage
 */
export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch (error) {
    console.error('Ошибка удаления сессии:', error);
  }
}

/**
 * Проверить, существует ли сессия
 * 
 * @returns true если сессия существует, false если нет
 */
export function hasSession(): boolean {
  return loadSession() !== null;
}

/**
 * Получить текущего пользователя из сессии
 * 
 * @returns Объект пользователя или null
 */
export function getCurrentUser(): User | null {
  const session = loadSession();
  return session ? session.user : null;
}

/**
 * Обновить время последней активности в сессии
 */
export function updateLastActivity(): void {
  const session = loadSession();
  if (session) {
    session.lastActivityAt = new Date().toISOString();
    saveSession(session);
  }
}

/**
 * Обновить expiresAt в сессии (используется при обновлении токена Supabase)
 * 
 * @param expiresAt - Новое время истечения сессии в формате ISO string
 */
export function updateSessionExpiresAt(expiresAt: string): void {
  const session = loadSession();
  if (session) {
    session.expiresAt = expiresAt;
    saveSession(session);
  }
}

/**
 * Проверить, истекла ли сессия
 * 
 * @returns true если сессия истекла, false если активна
 */
export function isSessionExpired(): boolean {
  const session = loadSession();
  if (!session) {
    return true;
  }
  
  const expiresAt = new Date(session.expiresAt);
  const now = new Date();
  
  return now >= expiresAt;
}

/**
 * Проверить таймаут сессии (8 часов бездействия)
 * 
 * @returns true если таймаут истек, false если сессия активна
 */
export function isSessionTimeout(): boolean {
  const session = loadSession();
  if (!session) {
    return true;
  }
  
  const lastActivity = new Date(session.lastActivityAt);
  const now = new Date();
  const diffMs = now.getTime() - lastActivity.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  
  // Таймаут: 8 часов (увеличено с 1 часа для удобства пользователей)
  return diffHours >= 8;
}

/**
 * Получить оставшееся время до истечения таймаута
 * 
 * @returns Оставшееся время в миллисекундах или 0, если таймаут истек
 */
export function getRemainingTime(): number {
  const session = loadSession();
  if (!session) {
    return 0;
  }
  
  const lastActivity = new Date(session.lastActivityAt);
  const now = new Date();
  const diffMs = now.getTime() - lastActivity.getTime();
  const timeoutMs = 8 * 60 * 60 * 1000; // 8 часов в миллисекундах (увеличено с 1 часа)
  
  const remaining = timeoutMs - diffMs;
  return remaining > 0 ? remaining : 0;
}

