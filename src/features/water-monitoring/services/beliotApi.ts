/**
 * API клиент для работы с beliot.by API
 * 
 * Основан на Swagger документации: https://beliot.by:4443/api/documentation
 * OpenAPI спецификация сохранена в: docs/beliot-api-openapi.json
 * 
 * API: NEKTA CORE API v2.0.8 Alpha
 * 
 * Примечание: API может быть доступен только из внутренней сети или через VPN
 */

import { API_CONFIG } from '@/shared/config/api';

/**
 * Базовый URL beliot API
 */
const BELIOT_API_BASE_URL = API_CONFIG.BELIOT_API_BASE_URL || 'https://beliot.by:4443/api';

/**
 * Интерфейс для Swagger/OpenAPI спецификации
 */
export interface SwaggerSpec {
  openapi?: string;
  swagger?: string;
  info?: {
    title?: string;
    version?: string;
    description?: string;
  };
  paths?: Record<string, any>;
  components?: {
    schemas?: Record<string, any>;
  };
}

/**
 * Получить Swagger/OpenAPI спецификацию из API
 * 
 * Пробует несколько возможных endpoints для получения спецификации
 * 
 * @param {string} customUrl - Опциональный кастомный URL для спецификации
 * @returns {Promise<SwaggerSpec>} Swagger/OpenAPI спецификация
 */
export async function getSwaggerSpec(customUrl?: string): Promise<SwaggerSpec> {
  const baseUrl = BELIOT_API_BASE_URL.replace(/\/$/, '');
  
  // Список возможных endpoints для Swagger спецификации
  // Полная OpenAPI 3.0 спецификация сохранена в docs/beliot-api-openapi.json
  const possibleEndpoints = customUrl 
    ? [customUrl]
    : [
        `https://beliot.by:4443/docs/api-docs.json`, // Laravel Swagger спецификация
        `${baseUrl}/swagger.json`,
        `${baseUrl}/openapi.json`,
        `${baseUrl}/api-docs`,
        `${baseUrl}/v1/swagger.json`,
        `${baseUrl}/v1/openapi.json`,
        `${baseUrl}/documentation`, // Может вернуть HTML, но попробуем
      ];

  const errors: string[] = [];

  for (const endpoint of possibleEndpoints) {
    try {
      console.debug(`🔄 Попытка загрузить Swagger из: ${endpoint}`);
      
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Accept': 'application/json, application/yaml, */*',
        },
        credentials: 'omit',
        mode: 'cors',
      });

      if (!response.ok) {
        const errorMsg = `HTTP ${response.status}: ${response.statusText}`;
        errors.push(`${endpoint}: ${errorMsg}`);
        console.warn(`⚠️ ${endpoint} вернул ошибку: ${errorMsg}`);
        continue;
      }

      const contentType = response.headers.get('content-type') || '';
      
      // Проверяем, является ли ответ JSON
      if (contentType.includes('application/json') || contentType.includes('text/json')) {
        const data = await response.json();
        
        // Проверяем, является ли это Swagger/OpenAPI спецификацией
        if (data.openapi || data.swagger) {
          console.debug(`✅ Swagger спецификация успешно загружена из: ${endpoint}`);
          console.debug(`📌 Версия: ${data.openapi || data.swagger}`);
          if (data.info) {
            console.debug(`📝 API: ${data.info.title || 'Unknown'} v${data.info.version || 'N/A'}`);
          }
          return data;
        }
      }
      
      // Если это HTML (Swagger UI), пробуем следующий endpoint
      if (contentType.includes('text/html')) {
        console.debug(`ℹ️ ${endpoint} вернул HTML (Swagger UI), пробуем следующий endpoint...`);
        errors.push(`${endpoint}: Вернул HTML вместо JSON`);
        continue;
      }

      // Пробуем распарсить как JSON в любом случае
      try {
        const text = await response.text();
        const data = JSON.parse(text);
        if (data.openapi || data.swagger) {
          console.debug(`✅ Swagger спецификация успешно загружена из: ${endpoint}`);
          return data;
        }
      } catch {
        errors.push(`${endpoint}: Не удалось распарсить как JSON`);
        continue;
      }
    } catch (error: any) {
      const errorName = error.name || 'Unknown';
      const errorMessage = error.message || 'Неизвестная ошибка';
      
      let detailedError = `${endpoint}: ${errorMessage}`;
      
      if (errorName === 'TypeError' && errorMessage.includes('Failed to fetch')) {
        detailedError = `${endpoint}: Ошибка подключения (CORS, SSL или сеть)`;
        if (endpoint.includes(':4443')) {
          detailedError += ' Возможно, требуется VPN или доступ из внутренней сети.';
        }
      } else if (errorName === 'TypeError' && errorMessage.includes('CORS')) {
        detailedError = `${endpoint}: CORS ошибка - сервер не разрешает запросы с этого домена`;
      } else if (errorMessage.includes('network')) {
        detailedError = `${endpoint}: Сетевая ошибка - проверьте подключение`;
      }
      
      errors.push(detailedError);
      console.warn(`⚠️ Ошибка при загрузке ${endpoint}:`, error);
    }
  }

  // Если все попытки не удались
  const errorDetails = errors.length > 0 
    ? `\n\nПопытки загрузки:\n${errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}`
    : '';

  throw new Error(`Не удалось загрузить Swagger спецификацию из ${baseUrl}${errorDetails}

Возможные причины:
1. API доступен только из внутренней сети/VPN
2. CORS ошибка - API не разрешает запросы с этого домена
3. SSL сертификат - самоподписанный сертификат на порту 4443
4. Неправильный URL - проверьте доступность API

Рекомендации:
- Откройте ${baseUrl}/documentation в браузере напрямую
- Если это Swagger UI, найдите кнопку "Download" или "Export" для получения JSON
- Скопируйте URL JSON файла и используйте его`);
}

/**
 * Парсит Swagger/OpenAPI спецификацию и извлекает информацию об endpoints
 * 
 * @param {SwaggerSpec} spec - Swagger/OpenAPI спецификация
 * @returns {Array} Массив информации об endpoints
 */
export function parseSwaggerEndpoints(spec: SwaggerSpec): Array<{
  path: string;
  method: string;
  summary?: string;
  description?: string;
  parameters?: any[];
  requestBody?: any;
  responses?: any;
  operationId?: string;
}> {
  const endpoints: Array<{
    path: string;
    method: string;
    summary?: string;
    description?: string;
    parameters?: any[];
    requestBody?: any;
    responses?: any;
    operationId?: string;
  }> = [];

  if (!spec.paths) {
    return endpoints;
  }

  const httpMethods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];

  Object.entries(spec.paths).forEach(([path, pathItem]) => {
    httpMethods.forEach(method => {
      if (pathItem[method]) {
        const operation = pathItem[method];
        endpoints.push({
          path,
          method: method.toUpperCase(),
          summary: operation.summary,
          description: operation.description,
          parameters: operation.parameters,
          requestBody: operation.requestBody,
          responses: operation.responses,
          operationId: operation.operationId,
        });
      }
    });
  });

  return endpoints;
}

/**
 * Выполняет запрос к beliot API
 * 
 * @param {string} endpoint - Endpoint API (например, '/v1/equipment')
 * @param {string} method - HTTP метод ('GET', 'POST', 'PUT', 'DELETE')
 * @param {any} body - Тело запроса для POST/PUT запросов
 * @param {Record<string, string>} params - Query параметры
 * @param {Record<string, string>} headers - Дополнительные заголовки
 * @returns {Promise<any>} Ответ API
 */
export async function beliotApiRequest(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' = 'GET',
  body?: any,
  params?: Record<string, string>,
  headers?: Record<string, string>
): Promise<any> {
  // Убираем начальный слэш
  let cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  
  // Если endpoint уже содержит /api, убираем его (baseUrl уже содержит /api)
  if (cleanEndpoint.startsWith('api/')) {
    cleanEndpoint = cleanEndpoint.replace(/^api\//, '');
  }
  
  const baseUrl = BELIOT_API_BASE_URL.replace(/\/$/, '');
  const fullUrl = `${baseUrl}/${cleanEndpoint}`;
  const url = new URL(fullUrl);
  
  console.debug('🔍 Формирование URL:', {
    originalEndpoint: endpoint,
    cleanEndpoint,
    baseUrl,
    fullUrl: url.toString(),
  });
  
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
  }

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...headers,
  };

  // Если токен передан в headers, используем его (приоритет выше)
  // Иначе используем API_KEY из конфигурации
  if (!requestHeaders['Authorization']) {
    const apiKey = API_CONFIG.BELIOT_API_KEY;
    if (apiKey) {
      requestHeaders['Authorization'] = `Bearer ${apiKey}`;
    }
  }
  
  // Логируем наличие токена (без самого токена)
  // Не показываем предупреждение, если это запрос на получение токена (login)
  const isLoginRequest = endpoint.includes('login') || endpoint.includes('auth');
  
  if (requestHeaders['Authorization']) {
    const tokenPreview = requestHeaders['Authorization'].substring(0, 20) + '...';
    if (!isLoginRequest) {
      console.debug('🔑 Используется токен:', tokenPreview);
    }
  } else if (!isLoginRequest) {
    // Предупреждение только для запросов, которые требуют токен
    // При первом запросе токен еще не получен - это нормально
    console.debug('ℹ️ Токен будет получен автоматически при необходимости');
  }

  const options: RequestInit = {
    method,
    headers: requestHeaders,
    mode: 'cors',
    credentials: 'omit',
  };

  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.body = JSON.stringify(body);
  }

  try {
    console.debug('📤 Beliot API запрос:', {
      url: url.toString(),
      method,
      hasBody: !!body,
    });

    const response = await fetch(url.toString(), options);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Beliot API ошибка:', {
        status: response.status,
        statusText: response.statusText,
        message: errorText,
      });
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }

    const contentType = response.headers.get('content-type');
    
    if (contentType?.includes('application/json')) {
      const data = await response.json();
      console.debug('✅ Beliot API ответ:', data);
      return data;
    } else {
      const text = await response.text();
      console.debug('✅ Beliot API ответ (текст):', text);
      return text;
    }
  } catch (error: any) {
    console.error('Ошибка запроса к Beliot API:', error);
    throw new Error(`Ошибка запроса к Beliot API: ${error.message}`);
  }
}

/**
 * Получить список оборудования из beliot API
 * 
 * @returns {Promise<any>} Список оборудования
 */
export async function getBeliotEquipment(): Promise<any> {
  // Endpoint будет определен после получения Swagger спецификации
  try {
    return await beliotApiRequest('/v1/equipment', 'GET');
  } catch (error) {
    try {
      return await beliotApiRequest('/api/v1/equipment', 'GET');
    } catch (error2) {
      try {
        return await beliotApiRequest('/equipment', 'GET');
      } catch (error3) {
        throw new Error('Не удалось получить список оборудования. Проверьте Swagger документацию для правильного endpoint.');
      }
    }
  }
}

/**
 * Получить журнал обслуживания из beliot API
 * 
 * @param {string} equipmentId - ID оборудования
 * @returns {Promise<any>} Журнал обслуживания
 */
export async function getBeliotMaintenanceLog(equipmentId: string): Promise<any> {
  try {
    return await beliotApiRequest('/v1/maintenanceLog', 'GET', undefined, { equipmentId });
  } catch (error) {
    try {
      return await beliotApiRequest(`/v1/maintenanceLog/${equipmentId}`, 'GET');
    } catch (error2) {
      try {
        return await beliotApiRequest('/api/v1/maintenanceLog', 'GET', undefined, { equipmentId });
      } catch (error3) {
        throw new Error('Не удалось получить журнал обслуживания. Проверьте Swagger документацию для правильного endpoint.');
      }
    }
  }
}

/**
 * Добавить запись в журнал обслуживания через beliot API
 * 
 * @param {string} equipmentId - ID оборудования
 * @param {any} entry - Данные записи
 * @returns {Promise<any>} Созданная запись
 */
export async function addBeliotMaintenanceEntry(equipmentId: string, entry: any): Promise<any> {
  try {
    return await beliotApiRequest('/v1/maintenanceLog', 'POST', {
      equipmentId,
      ...entry,
    });
  } catch (error) {
    try {
      return await beliotApiRequest(`/v1/maintenanceLog/${equipmentId}`, 'POST', entry);
    } catch (error2) {
      throw new Error('Не удалось добавить запись в журнал. Проверьте Swagger документацию для правильного endpoint.');
    }
  }
}

