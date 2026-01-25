/**
 * API клиент для аутентификации в Beliot API
 * 
 * Основан на NEKTA CORE API: https://beliot.by:4443/api/documentation
 * OpenAPI спецификация: docs/beliot-api-openapi.json
 * 
 * Используется для получения Bearer token для доступа к API устройств
 */

import { beliotApiRequest } from './beliotApi';
import { API_CONFIG } from '../../config/api';

/**
 * Интерфейс для данных входа
 */
export interface BeliotLoginData {
  email: string;
  password: string;
  personal_data_access?: boolean;
}

/**
 * Интерфейс для ответа аутентификации
 */
export interface BeliotAuthResponse {
  token?: string;
  access_token?: string;
  bearer_token?: string;
  user?: any;
  data?: {
    token?: string;
    access_token?: string;
    bearer_token?: string;
    user?: any;
  };
  [key: string]: any;
}

/**
 * Кэш токена в памяти
 */
let cachedToken: string | null = null;
let tokenExpiresAt: number | null = null;
const TOKEN_CACHE_DURATION = 3600000; // 1 час в миллисекундах

/**
 * Очистить кэш токена
 */
export function clearBeliotTokenCache(): void {
  cachedToken = null;
  tokenExpiresAt = null;
}

/**
 * Проверить, действителен ли кэшированный токен
 */
function isTokenValid(): boolean {
  if (!cachedToken || !tokenExpiresAt) {
    return false;
  }
  
  // Проверяем, не истек ли токен (с запасом в 5 минут)
  const now = Date.now();
  const buffer = 5 * 60 * 1000; // 5 минут
  return tokenExpiresAt > (now + buffer);
}

/**
 * Аутентификация в Beliot API
 * 
 * Использует endpoint: POST /api/auth/login
 * 
 * @param {BeliotLoginData} credentials - Учетные данные (email, password)
 * @param {boolean} forceRefresh - Принудительно обновить токен (игнорировать кэш)
 * @returns {Promise<string>} Bearer token для использования в API запросах
 */
export async function beliotLogin(
  credentials?: BeliotLoginData,
  forceRefresh: boolean = false
): Promise<string> {
  // Проверяем кэш, если не требуется принудительное обновление
  if (!forceRefresh && isTokenValid() && cachedToken) {
    console.debug('✅ Используется кэшированный токен Beliot API');
    return cachedToken;
  }

  // Используем переданные учетные данные или из конфигурации
  const loginData: BeliotLoginData = credentials || {
    email: API_CONFIG.BELIOT_LOGIN || '',
    password: API_CONFIG.BELIOT_PASSWORD || '',
  };

  if (!loginData.email || !loginData.password) {
    throw new Error('Учетные данные Beliot API не указаны. Установите BELIOT_LOGIN и BELIOT_PASSWORD в конфигурации.');
  }

  try {
    console.debug('🔐 Аутентификация в Beliot API...');
    
    // Для логина используем полный путь без /api, так как baseUrl уже содержит /api
    const response = await beliotApiRequest(
      'auth/login',
      'POST',
      {
        email: loginData.email,
        password: loginData.password,
        personal_data_access: loginData.personal_data_access ?? true,
      },
      undefined,
      {
        // Не добавляем Authorization заголовок для запроса логина
      }
    );

    // Извлекаем токен из различных возможных форматов ответа
    let token: string | null = null;

    if (response?.token) {
      token = response.token;
    } else if (response?.access_token) {
      token = response.access_token;
    } else if (response?.bearer_token) {
      token = response.bearer_token;
    } else if (response?.data?.token) {
      token = response.data.token;
    } else if (response?.data?.access_token) {
      token = response.data.access_token;
    } else if (response?.data?.bearer_token) {
      token = response.data.bearer_token;
    } else if (typeof response === 'string') {
      // Если ответ - просто строка токена
      token = response;
    }

    if (!token) {
      console.error('❌ Неожиданный формат ответа аутентификации:', response);
      throw new Error('Не удалось получить токен из ответа API. Проверьте формат ответа.');
    }

    // Сохраняем токен в кэш
    cachedToken = token;
    tokenExpiresAt = Date.now() + TOKEN_CACHE_DURATION;

    console.debug('✅ Аутентификация успешна, токен получен');
    return token;
  } catch (error: any) {
    console.error('❌ Ошибка аутентификации в Beliot API:', error);
    
    // Очищаем кэш при ошибке
    clearBeliotTokenCache();
    
    if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
      throw new Error('Неверный email или пароль для Beliot API');
    }
    
    throw new Error(`Ошибка аутентификации в Beliot API: ${error.message}`);
  }
}

/**
 * Получить действительный Bearer token
 * 
 * Автоматически использует кэш или выполняет аутентификацию при необходимости
 * 
 * @param {boolean} forceRefresh - Принудительно обновить токен
 * @returns {Promise<string>} Bearer token
 */
export async function getBeliotToken(forceRefresh: boolean = false): Promise<string> {
  return await beliotLogin(undefined, forceRefresh);
}

/**
 * Выход из Beliot API
 * 
 * Использует endpoint: POST /api/auth/logout
 * 
 * @param {string} token - Bearer token для выхода
 */
export async function beliotLogout(token?: string): Promise<void> {
  const tokenToUse = token || cachedToken;
  
  if (!tokenToUse) {
    console.warn('⚠️ Токен не указан для выхода');
    return;
  }

  try {
    await beliotApiRequest(
      '/api/auth/logout',
      'POST',
      {},
      undefined,
      {
        'Authorization': `Bearer ${tokenToUse}`,
      }
    );
    
    // Очищаем кэш после выхода
    clearBeliotTokenCache();
    
    console.debug('✅ Выход из Beliot API выполнен');
  } catch (error: any) {
    console.error('❌ Ошибка выхода из Beliot API:', error);
    // Очищаем кэш даже при ошибке
    clearBeliotTokenCache();
  }
}

