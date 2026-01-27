/**
 * pathStorage.ts
 * 
 * Утилиты для сохранения и восстановления текущего пути пользователя
 * Используется для восстановления состояния после перезагрузки страницы
 */

const LAST_PATH_KEY = 'last_path';
const REDIRECT_PATH_KEY = 'redirect_path';

/**
 * Сохранить текущий путь пользователя
 * 
 * @param path - Путь для сохранения
 */
export function saveLastPath(path: string): void {
  try {
    // Не сохраняем страницы аутентификации и главное меню
    if (path === '/login' || path === '/register' || path === '/') {
      return;
    }
    sessionStorage.setItem(LAST_PATH_KEY, path);
  } catch (error) {
    console.error('Ошибка сохранения пути:', error);
  }
}

/**
 * Загрузить последний сохраненный путь
 * 
 * @returns Путь или null, если путь не найден
 */
export function loadLastPath(): string | null {
  try {
    return sessionStorage.getItem(LAST_PATH_KEY);
  } catch (error) {
    console.error('Ошибка загрузки пути:', error);
    return null;
  }
}

/**
 * Очистить сохраненный путь
 */
export function clearLastPath(): void {
  try {
    sessionStorage.removeItem(LAST_PATH_KEY);
  } catch (error) {
    console.error('Ошибка очистки пути:', error);
  }
}

/**
 * Сохранить путь для редиректа после входа
 * Используется когда пользователь пытается зайти на защищенную страницу без авторизации
 * 
 * @param path - Путь для редиректа
 */
export function saveRedirectPath(path: string): void {
  try {
    // Не сохраняем страницы аутентификации
    if (path === '/login' || path === '/register') {
      return;
    }
    sessionStorage.setItem(REDIRECT_PATH_KEY, path);
  } catch (error) {
    console.error('Ошибка сохранения пути редиректа:', error);
  }
}

/**
 * Загрузить путь для редиректа после входа
 * 
 * @returns Путь или null, если путь не найден
 */
export function loadRedirectPath(): string | null {
  try {
    return sessionStorage.getItem(REDIRECT_PATH_KEY);
  } catch (error) {
    console.error('Ошибка загрузки пути редиректа:', error);
    return null;
  }
}

/**
 * Очистить путь для редиректа
 */
export function clearRedirectPath(): void {
  try {
    sessionStorage.removeItem(REDIRECT_PATH_KEY);
  } catch (error) {
    console.error('Ошибка очистки пути редиректа:', error);
  }
}
