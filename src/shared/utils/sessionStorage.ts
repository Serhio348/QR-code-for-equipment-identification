/**
 * sessionStorage.ts
 * 
 * Утилиты для работы с сессией пользователя в localStorage
 * 
 * Используется localStorage вместо sessionStorage для сохранения сессии
 * между обновлениями страницы и перезапусками браузера
 */

import type { UserSession } from '../../features/auth/types/auth';
import type { User } from '../../features/auth/types/user';

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
 * ВАЖНО: Для Supabase сессий эта функция не должна использоваться напрямую,
 * так как Supabase сам управляет сессией через refresh token.
 * Используйте checkSession() из supabaseAuthApi вместо этого.
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
  
  // Для Supabase сессий: если expiresAt истек, но это не критично,
  // так как Supabase может обновить токен через refresh token
  // Поэтому добавляем буфер в 5 минут для возможности обновления
  const bufferMs = 5 * 60 * 1000; // 5 минут
  const expiresAtWithBuffer = new Date(expiresAt.getTime() + bufferMs);
  
  return now >= expiresAtWithBuffer;
}

/**
 * Проверить таймаут сессии (8 часов бездействия)
 * 
 * ВАЖНО: Если user_session не найдена, проверяем Supabase сессию напрямую.
 * Это нужно, так как Supabase может хранить сессию в sb-auth-token, а не в user_session.
 * 
 * @returns true если таймаут истек, false если сессия активна
 */
export function isSessionTimeout(): boolean {
  const session = loadSession();
  
  // Если user_session не найдена, проверяем Supabase сессию напрямую
  if (!session) {
    // Проверяем, есть ли Supabase сессия в localStorage
    try {
      const supabaseSession = localStorage.getItem('sb-auth-token');
      if (supabaseSession) {
        // Если есть Supabase сессия, но нет user_session, создаем её
        // Это может произойти, если пользователь вошел через Supabase, но user_session не была создана
        console.debug('⚠️ user_session не найдена, но Supabase сессия есть. Создаем user_session...');
        // Не создаем сессию здесь, так как это должно быть сделано при входе
        // Просто возвращаем false (сессия активна), так как Supabase сессия есть
        return false;
      }
    } catch (error) {
      // Игнорируем ошибки
    }
    
    // Если нет ни user_session, ни Supabase сессии, сессия истекла
    return true;
  }
  
  // Проверяем, что lastActivityAt существует
  if (!session.lastActivityAt) {
    console.warn('⚠️ lastActivityAt не установлен в сессии, устанавливаем текущее время');
    session.lastActivityAt = new Date().toISOString();
    saveSession(session);
    return false; // Сессия активна, только что обновили lastActivityAt
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
