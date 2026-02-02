/**
 * errorHandler.ts
 *
 * Централизованная обработка ошибок.
 * Преобразует различные типы ошибок в понятные сообщения.
 */

// ============================================
// Типы ошибок
// ============================================

/**
 * Кастомный класс ошибки с дополнительной информацией.
 * extends Error - наследуем от встроенного класса ошибок
 */
export class ApiError extends Error {
  /** HTTP статус код (если есть) */
  statusCode?: number;

  /** Код ошибки (для программной обработки) */
  code?: string;

  /** Исходная ошибка */
  cause?: unknown;

  constructor(message: string, options?: {
    statusCode?: number;
    code?: string;
    cause?: unknown;
  }) {
    // Вызываем конструктор родительского класса
    super(message);

    // Устанавливаем имя класса ошибки
    this.name = 'ApiError';

    // Присваиваем дополнительные свойства
    this.statusCode = options?.statusCode;
    this.code = options?.code;
    this.cause = options?.cause;
  }
}

// ============================================
// Функции обработки ошибок
// ============================================

/**
 * Преобразует любую ошибку в понятное сообщение.
 *
 * @param error - Любой тип ошибки
 * @returns Человекочитаемое сообщение
 */
export function getErrorMessage(error: unknown): string {
  // Если это уже строка
  if (typeof error === 'string') {
    return error;
  }

  // Если это объект Error
  if (error instanceof Error) {
    return error.message;
  }

  // Если это объект с полем message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }

  // Для всего остального
  return 'Неизвестная ошибка';
}

/**
 * Определяет, является ли ошибка сетевой.
 *
 * @param error - Ошибка для проверки
 * @returns true если это сетевая ошибка
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    return (
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('timeout') ||
      message.includes('econnrefused') ||
      message.includes('enotfound')
    );
  }

  return false;
}

/**
 * Определяет, можно ли повторить запрос после этой ошибки.
 *
 * @param error - Ошибка для проверки
 * @returns true если стоит попробовать ещё раз
 */
export function isRetryableError(error: unknown): boolean {
  // Сетевые ошибки обычно временные
  if (isNetworkError(error)) {
    return true;
  }

  // Проверяем HTTP статус код
  if (error instanceof ApiError && error.statusCode) {
    // 5xx - серверные ошибки (можно повторить)
    // 429 - слишком много запросов (можно повторить после паузы)
    return error.statusCode >= 500 || error.statusCode === 429;
  }

  return false;
}

/**
 * Создает задержку (для повторных попыток).
 *
 * @param ms - Время в миллисекундах
 * @returns Promise который резолвится через указанное время
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}