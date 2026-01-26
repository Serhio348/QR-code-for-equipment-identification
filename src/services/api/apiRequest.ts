/**
 * Базовый запрос к API
 * 
 * Выполняет HTTP запрос к Google Apps Script веб-приложению
 * Обрабатывает CORS ошибки и логирование
 */

import { API_CONFIG } from '../../shared/config/api';
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
        message: errorText
      });
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
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
      const equipmentArray = data.data as any[];
      console.log('📋 Получено оборудования:', equipmentArray.length);
      equipmentArray.forEach((eq: any) => {
        console.log('📅 Оборудование с сервера (getAll):', {
          id: eq.id,
          name: eq.name,
          commissioningDate: eq.commissioningDate || '(пусто)',
          commissioningDateType: typeof eq.commissioningDate,
          lastMaintenanceDate: eq.lastMaintenanceDate || '(пусто)',
          lastMaintenanceDateType: typeof eq.lastMaintenanceDate,
          все_поля: Object.keys(eq)
        });
      });
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
    
    // Если это таймаут и есть попытки повтора - повторяем запрос
    if (isTimeout && retryCount < API_CONFIG.MAX_RETRIES) {
      const nextRetry = retryCount + 1;
      console.warn(`⏱️ Таймаут запроса (попытка ${nextRetry}/${API_CONFIG.MAX_RETRIES}). Повтор через ${API_CONFIG.RETRY_DELAY}ms...`, {
        action,
        method,
        retryCount: nextRetry
      });
      
      // Ждем перед повтором
      await delay(API_CONFIG.RETRY_DELAY);
      
      // Повторяем запрос
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
      throw new Error(`Не удалось подключиться к API. Проверьте:\n1. URL в src/config/api.ts\n2. Доступность интернета\n3. Настройки CORS в Google Apps Script\n\nURL: ${API_CONFIG.EQUIPMENT_API_URL}`);
    }
    
    // Пробрасываем ошибку дальше
    throw error;
  }
}

