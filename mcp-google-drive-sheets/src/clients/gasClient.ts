/**
 * gasClient.ts
 *
 * HTTP клиент для работы с Google Apps Script API.
 * Обертка над существующим бэкендом с поддержкой retry и таймаутов.
 */

import { config } from '../config/env.js';
import { ApiError, getErrorMessage, isRetryableError, delay } from '../utils/errorHandler.js';

// ============================================
// Типы
// ============================================

/**
 * Стандартный ответ от GAS API.
 * Generics <T> позволяет указать тип данных.
 */
interface GasResponse<T> {
  /** Успешность операции */
  success: boolean;

  /** Данные (при успехе) */
  data?: T;

  /** Сообщение об ошибке (при неудаче) */
  error?: string;

  /** Дополнительная информация */
  message?: string;
}

/**
 * Опции для запроса.
 */
interface RequestOptions {
  /** Таймаут в миллисекундах */
  timeout?: number;

  /** Количество повторных попыток */
  retries?: number;
}

// ============================================
// Класс клиента
// ============================================

/**
 * Клиент для работы с Google Apps Script API.
 *
 * Паттерн Singleton - один экземпляр на всё приложение.
 * Это нужно чтобы не создавать множество подключений.
 */
export class GasClient {
  /** Базовый URL API */
  private baseUrl: string;

  /** Таймаут по умолчанию */
  private defaultTimeout: number;

  /** Количество попыток по умолчанию */
  private defaultRetries: number;

  /** Задержка между попытками */
  private retryDelay: number;

  /**
   * Создает экземпляр клиента.
   *
   * @param options - Опции конфигурации (опционально)
   */
  constructor(options?: {
    baseUrl?: string;
    timeout?: number;
    retries?: number;
    retryDelay?: number;
  }) {
    // Используем переданные значения или значения из конфига
    this.baseUrl = options?.baseUrl || config.gasApiUrl;
    this.defaultTimeout = options?.timeout || config.apiTimeout;
    this.defaultRetries = options?.retries || config.apiMaxRetries;
    this.retryDelay = options?.retryDelay || config.apiRetryDelay;

    // Проверяем, что URL задан
    if (!this.baseUrl) {
      throw new Error('GAS API URL не настроен. Проверьте .env файл.');
    }
  }

  // ============================================
  // Публичные методы
  // ============================================

  /**
   * GET запрос к API.
   *
   * @param action - Название действия (action=xxx в URL)
   * @param params - Дополнительные параметры запроса
   * @param options - Опции запроса
   * @returns Данные ответа
   *
   * @example
   * const equipment = await client.get<Equipment[]>('getAll');
   * const item = await client.get<Equipment>('getById', { id: '123' });
   */
  async get<T>(
    action: string,
    params?: Record<string, string>,
    options?: RequestOptions
  ): Promise<T> {
    // Собираем URL с параметрами
    const url = this.buildUrl(action, params);

    // Выполняем запрос
    const response = await this.request<T>(url, 'GET', undefined, options);

    return response;
  }

  /**
   * POST запрос к API.
   *
   * @param action - Название действия
   * @param body - Тело запроса
   * @param options - Опции запроса
   * @returns Данные ответа
   *
   * @example
   * const newItem = await client.post<Equipment>('add', { name: 'Фильтр', type: 'filter' });
   */
  async post<T>(
    action: string,
    body: Record<string, unknown>,
    options?: RequestOptions
  ): Promise<T> {
    // Добавляем action в тело запроса (так работает наш GAS бэкенд)
    const payload = { action, ...body };

    // Выполняем запрос
    const response = await this.request<T>(this.baseUrl, 'POST', payload, options);

    return response;
  }

  // ============================================
  // Приватные методы
  // ============================================

  /**
   * Собирает URL с query параметрами.
   *
   * @param action - Действие
   * @param params - Параметры
   * @returns Полный URL
   */
  private buildUrl(action: string, params?: Record<string, string>): string {
    // Создаем объект URL для удобной работы с параметрами
    const url = new URL(this.baseUrl);

    // Добавляем action
    url.searchParams.append('action', action);

    // Добавляем остальные параметры
    if (params) {
      // Object.entries() возвращает массив [ключ, значение]
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, value);
        }
      });
    }

    // .toString() возвращает полный URL со всеми параметрами
    return url.toString();
  }

  /**
   * Выполняет HTTP запрос с поддержкой retry.
   *
   * @param url - URL запроса
   * @param method - HTTP метод
   * @param body - Тело запроса (для POST)
   * @param options - Опции
   * @param attempt - Номер текущей попытки
   * @returns Данные ответа
   */
  private async request<T>(
    url: string,
    method: 'GET' | 'POST',
    body?: Record<string, unknown>,
    options?: RequestOptions,
    attempt: number = 1
  ): Promise<T> {
    // Определяем таймаут и количество попыток
    const timeout = options?.timeout || this.defaultTimeout;
    const maxRetries = options?.retries || this.defaultRetries;

    // AbortController позволяет отменить fetch запрос
    const controller = new AbortController();

    // Устанавливаем таймаут на отмену
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // Логируем запрос в debug режиме
      if (config.debug) {
        console.log(`[GAS] ${method} ${url.substring(0, 80)}... (попытка ${attempt})`);
      }

      // Формируем опции fetch
      const fetchOptions: RequestInit = {
        method,
        // signal связывает fetch с AbortController
        signal: controller.signal,
        // Headers для POST запроса
        headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
        // Тело запроса (только для POST)
        body: body ? JSON.stringify(body) : undefined,
      };

      // Выполняем запрос
      const response = await fetch(url, fetchOptions);

      // Очищаем таймаут (запрос завершился вовремя)
      clearTimeout(timeoutId);

      // Проверяем HTTP статус
      if (!response.ok) {
        throw new ApiError(`HTTP ${response.status}: ${response.statusText}`, {
          statusCode: response.status,
        });
      }

      // Парсим JSON ответ
      const json = await response.json() as GasResponse<T>;

      // Проверяем успешность операции
      if (!json.success) {
        throw new ApiError(json.error || json.message || 'Неизвестная ошибка API', {
          code: 'API_ERROR',
        });
      }

      // Возвращаем данные
      // json.data! - "!" говорит TypeScript, что data точно не undefined
      return json.data as T;

    } catch (error: unknown) {
      // Очищаем таймаут в случае ошибки
      clearTimeout(timeoutId);

      // Проверяем, был ли запрос отменен по таймауту
      if (error instanceof Error && error.name === 'AbortError') {
        const timeoutError = new ApiError(`Таймаут запроса (${timeout}ms)`, {
          code: 'TIMEOUT',
        });

        // Если можно повторить и есть ещё попытки
        if (attempt < maxRetries) {
          if (config.debug) {
            console.log(`[GAS] Таймаут, повторяем через ${this.retryDelay}ms...`);
          }
          await delay(this.retryDelay);
          return this.request<T>(url, method, body, options, attempt + 1);
        }

        throw timeoutError;
      }

      // Для других ошибок - проверяем возможность retry
      if (isRetryableError(error) && attempt < maxRetries) {
        if (config.debug) {
          console.log(`[GAS] Ошибка: ${getErrorMessage(error)}, повторяем...`);
        }
        await delay(this.retryDelay);
        return this.request<T>(url, method, body, options, attempt + 1);
      }

      // Пробрасываем ошибку дальше
      throw error;
    }
  }
}

// ============================================
// Экземпляр по умолчанию
// ============================================

/**
 * Готовый экземпляр клиента.
 * Используйте его везде в приложении.
 *
 * @example
 * import { gasClient } from './clients/gasClient.js';
 * const data = await gasClient.get('getAll');
 */
export const gasClient = new GasClient();