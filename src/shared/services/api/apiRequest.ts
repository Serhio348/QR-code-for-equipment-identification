/**
 * Базовый запрос к API
 * 
 * Выполняет HTTP запрос к Google Apps Script веб-приложению
 * Обрабатывает CORS ошибки и логирование
 */

import { API_CONFIG } from '@/shared/config/api';
import { ApiResponse } from './types';

/**
 * Задержка на указанное количество миллисекунд
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Проверяет, является ли ошибка таймаутом
 */
function isTimeoutError(error: any): boolean {
  return error?.name === 'TimeoutError' || 
         error?.name === 'AbortError' ||
         error?.message?.includes('timeout') ||
         error?.message?.includes('timed out') ||
         error?.stack?.includes('TimeoutError');
}

/** Страница Google «файл не найден» и обрывы связи у Apps Script часто проходят со следующей попытки. */
function isTransientHttpStatus(status: number): boolean {
  return status === 404 || status === 408 || status === 429 || status >= 500;
}

function isFetchNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === 'TypeError'
    && /fetch|network|cors/i.test(error.message);
}

function httpFailureMessage(status: number): string {
  if (status === 404) {
    return 'Сервер оборудования временно недоступен: Google не открыл файл. Повторите попытку.';
  }
  return `Сервер оборудования ответил ошибкой ${status}. Повторите попытку.`;
}

function responsePreview(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('<') || trimmed.includes('<!DOCTYPE')) return 'html';
  return trimmed.slice(0, 180);
}

/**
 * Базовый запрос к API с автоматическим повтором при таймауте
 * 
 * @param {string} action - Действие для выполнения (getAll, getById, getByType, add, update, delete)
 * @param {string} method - HTTP метод ('GET' или 'POST')
 * @param {any} body - Тело запроса для POST запросов
 * @param {Record<string, string>} params - Дополнительные параметры для GET запросов
 * @param {number} retryCount - Текущее количество попыток (внутренний параметр)
 * @returns {Promise<ApiResponse<T>>} Ответ API
 * 
 * @throws {Error} Если URL не настроен или произошла ошибка сети
 */
export async function apiRequest<T>(
  action: string,
  method: 'GET' | 'POST' = 'GET',
  body?: any,
  params?: Record<string, string>,
  retryCount: number = 0
): Promise<ApiResponse<T>> {
  // Проверяем, что URL настроен
  if (!API_CONFIG.EQUIPMENT_API_URL) {
    throw new Error('EQUIPMENT_API_URL не настроен. Проверьте src/config/api.ts');
  }

  // Создаем URL с параметром action для GET запросов
  const url = new URL(API_CONFIG.EQUIPMENT_API_URL);
  if (method === 'GET') {
    url.searchParams.append('action', action);
    // Добавляем дополнительные параметры для GET запросов
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }
  }

  // Настройки запроса
  const options: RequestInit = {
    method,
    mode: 'cors', // Явно указываем CORS режим
    signal: AbortSignal.timeout(API_CONFIG.TIMEOUT), // Таймаут запроса
  };

  // Для POST запросов добавляем заголовки и тело
  if (method === 'POST') {
    options.headers = {
      'Content-Type': 'application/json',
    };
    if (body) {
      // Добавляем action в тело запроса для POST
      const postBody = {
        action: action,
        ...body
      };
      options.body = JSON.stringify(postBody);
      console.log('📤 POST body:', JSON.stringify(postBody, null, 2));
    } else {
      console.warn('⚠️ POST запрос без body для action:', action);
    }
  }

  try {
    // Логируем запрос для отладки
    console.log('📤 API запрос:', {
      url: url.toString(),
      method,
      action,
      hasBody: !!options.body
    });
    
    // Выполняем запрос
    const response = await fetch(url.toString(), options);

    // Проверяем статус ответа
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ HTTP ошибка:', {
        status: response.status,
        statusText: response.statusText,
        message: responsePreview(errorText),
      });
      if (
        method === 'GET'
        && isTransientHttpStatus(response.status)
        && retryCount < API_CONFIG.MAX_RETRIES
      ) {
        const nextRetry = retryCount + 1;
        console.warn(`Повтор запроса после ответа ${response.status} (${nextRetry}/${API_CONFIG.MAX_RETRIES})`, { action });
        await delay(API_CONFIG.RETRY_DELAY);
        return apiRequest<T>(action, method, body, params, nextRetry);
      }
      throw new Error(httpFailureMessage(response.status));
    }

    // Парсим JSON ответ
    const data: ApiResponse<T> = await response.json();
    
    // Логируем даты для отладки
    console.log('🔍 Парсинг ответа:', {
      action,
      hasData: !!data.data,
      dataType: Array.isArray(data.data) ? 'array' : typeof data.data,
      dataLength: Array.isArray(data.data) ? data.data.length : 'N/A'
    });
    
    if (action === 'getAll' && data.data && Array.isArray(data.data)) {
      console.log('📋 Получено оборудования:', data.data.length);
    } else if (action === 'getById' && data.data) {
      const equipment = data.data as any;
      console.log('📅 Оборудование с сервера (getById):', {
        id: equipment.id,
        name: equipment.name,
        commissioningDate: equipment.commissioningDate || '(пусто)',
        commissioningDateType: typeof equipment.commissioningDate,
        lastMaintenanceDate: equipment.lastMaintenanceDate || '(пусто)',
        lastMaintenanceDateType: typeof equipment.lastMaintenanceDate,
        все_поля: Object.keys(equipment)
      });
    } else {
      console.log('⚠️ Неожиданный формат данных:', {
        action,
        hasData: !!data.data,
        dataType: typeof data.data,
        isArray: Array.isArray(data.data)
      });
    }
    
    console.log('✅ API ответ:', {
      action,
      success: data.success,
      hasData: !!data.data,
      error: data.error
    });

    // Проверяем успешность операции
    if (!data.success) {
      throw new Error(data.error || 'Неизвестная ошибка');
    }

    return data;
  } catch (error: any) {
    // Проверяем, является ли это таймаутом
    const isTimeout = isTimeoutError(error);
    const network = isFetchNetworkError(error);

    // Таймаут повторяем всегда. Обрыв связи — только у чтения, чтобы не отправить запись дважды.
    if ((isTimeout || (method === 'GET' && network)) && retryCount < API_CONFIG.MAX_RETRIES) {
      const nextRetry = retryCount + 1;
      console.warn(`Повтор запроса (${nextRetry}/${API_CONFIG.MAX_RETRIES})`, {
        action,
        method,
        retryCount: nextRetry,
      });
      await delay(API_CONFIG.RETRY_DELAY);
      return apiRequest<T>(action, method, body, params, nextRetry);
    }
    
    // Проверяем, является ли это CORS ошибкой для POST запросов
    const isCorsError = error.name === 'TypeError' && 
                       (error.message.includes('fetch') || 
                        error.message.includes('Failed to fetch') ||
                        error.message.includes('CORS') ||
                        error.message.includes('network'));
    
    console.log('⚠️ Ошибка API запроса:', {
      action,
      method,
      isCorsError,
      isTimeout,
      retryCount,
      errorName: error.name,
      errorMessage: error.message
    });
    
    // Логируем ошибки только если это не CORS ошибка для POST (она будет обработана в fallback)
    if (!(isCorsError && method === 'POST')) {
      console.error('API request error:', {
        url: url.toString(),
        method,
        action,
        error: error.message,
        stack: error.stack,
        retryCount
      });
    }
    
    // Улучшенные сообщения об ошибках
    if (isTimeout && retryCount >= API_CONFIG.MAX_RETRIES) {
      throw new Error(`Превышено время ожидания ответа от сервера (${API_CONFIG.TIMEOUT / 1000} сек). Попробуйте позже или проверьте подключение к интернету.`);
    }
    
    if (isCorsError && method === 'GET') {
      throw new Error('Не удалось подключиться к серверу оборудования. Повторите попытку.');
    }
    
    // Пробрасываем ошибку дальше
    throw error;
  }
}

