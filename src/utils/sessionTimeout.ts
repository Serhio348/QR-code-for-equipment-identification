/**
 * sessionTimeout.ts
 * 
 * Управление таймаутом сессии (1 час бездействия)
 */

import { updateLastActivity, isSessionTimeout, clearSession } from './sessionStorage';

let timeoutCheckInterval: number | null = null;
let activityListeners: (() => void)[] = [];

/**
 * Начать отслеживание активности пользователя
 * 
 * Обновляет время последней активности при различных действиях пользователя
 */
export function startActivityTracking(): void {
  // Список событий, которые считаются активностью пользователя
  const activityEvents = [
    'mousedown',
    'mousemove',
    'keypress',
    'scroll',
    'touchstart',
    'click',
  ];
  
  // Функция обновления активности
  const updateActivity = () => {
    updateLastActivity();
  };
  
  // Добавляем слушатели событий
  activityListeners = activityEvents.map(event => {
    const handler = updateActivity;
    window.addEventListener(event, handler, { passive: true });
    return handler;
  });
  
  // Периодическая проверка таймаута (каждые 5 минут)
  if (timeoutCheckInterval !== null) {
    clearInterval(timeoutCheckInterval);
  }
  
  timeoutCheckInterval = window.setInterval(() => {
    if (isSessionTimeout()) {
      // Сессия истекла, очищаем её
      clearSession();
      
      // Вызываем событие истечения сессии
      window.dispatchEvent(new CustomEvent('session-timeout'));
      
      // Останавливаем отслеживание
      stopActivityTracking();
    }
  }, 5 * 60 * 1000); // Проверка каждые 5 минут
  
  // Обновляем активность сразу при старте
  updateActivity();
}

/**
 * Остановить отслеживание активности пользователя
 */
export function stopActivityTracking(): void {
  // Удаляем слушатели событий
  activityListeners.forEach(handler => {
    window.removeEventListener('mousedown', handler);
    window.removeEventListener('mousemove', handler);
    window.removeEventListener('keypress', handler);
    window.removeEventListener('scroll', handler);
    window.removeEventListener('touchstart', handler);
    window.removeEventListener('click', handler);
  });
  
  activityListeners = [];
  
  // Останавливаем периодическую проверку
  if (timeoutCheckInterval !== null) {
    clearInterval(timeoutCheckInterval);
    timeoutCheckInterval = null;
  }
}

/**
 * Проверить таймаут сессии и очистить, если истек
 * 
 * @returns true если сессия активна, false если истекла
 */
export function checkSessionTimeout(): boolean {
  if (isSessionTimeout()) {
    clearSession();
    window.dispatchEvent(new CustomEvent('session-timeout'));
    return false;
  }
  
  // Обновляем время последней активности при проверке
  updateLastActivity();
  return true;
}

