/**
 * API клиент для работы с устройствами (devices) через Beliot API
 * 
 * Основан на NEKTA CORE API: https://beliot.by:4443/api/documentation
 * 
 * Предназначен для получения состояния устройств компании
 */

import { beliotApiRequest } from './beliotApi';
import { API_CONFIG } from '@/shared/config/api';
import { getBeliotToken } from './beliotAuthApi';

/**
 * Интерфейс для устройства (device)
 */
export interface BeliotDevice {
  _id?: string;
  id?: string;
  name?: string;
  device_id?: string;
  device_group_id?: string;
  model_id?: string;
  company_id?: string;
  accounting_point_id?: string;
  accounting_point_name?: string;
  object_id?: string;
  object_name?: string;
  building_id?: string;
  building_name?: string;
  location?: string;
  address?: string;
  facility_passport?: string; // Паспорт объекта (например, "ХВО")
  facility_passport_name?: string;
  passport?: string;
  passport_name?: string;
  tied_point?: {
    place?: string; // Название места/объекта
    [key: string]: any;
  };
  status?: string;
  state?: string;
  is_active?: boolean;
  active?: number | boolean;
  created_at?: string;
  updated_at?: string;
  [key: string]: any; // Для дополнительных полей
}

/**
 * Интерфейс для ответа API с устройствами
 */
export interface BeliotDeviceResponse {
  data?: BeliotDevice | BeliotDevice[];
  success?: boolean;
  error?: string;
  [key: string]: any;
}

/**
 * Параметры для получения устройств компании
 */
export interface GetCompanyDevicesParams {
  company_id?: string;
  device_group_id?: string;
  is_active?: boolean;
  limit?: number;
  offset?: number;
  [key: string]: any;
}

/**
 * Получить Bearer token для аутентификации
 * 
 * Автоматически использует кэш или выполняет аутентификацию
 * 
 * @param {string} customToken - Опциональный кастомный токен
 * @returns {Promise<string>} Bearer token
 */
async function getAuthToken(customToken?: string): Promise<string> {
  if (customToken) {
    return customToken;
  }
  
  if (API_CONFIG.BELIOT_API_KEY) {
    return API_CONFIG.BELIOT_API_KEY;
  }
  
  // Автоматическая аутентификация с использованием учетных данных
  return await getBeliotToken();
}

/**
 * Получить основные данные абонента (включая список устройств)
 * 
 * Этот endpoint возвращает полную информацию об абоненте, включая:
 * - devices_list - список устройств учета
 * - accounting_points_list - список точек учета
 * - и другую информацию
 * 
 * @param {string} token - Bearer token для аутентификации (опционально, будет получен автоматически)
 * @returns {Promise<any>} Данные абонента с устройствами
 */
export async function getAbonentMainData(token?: string): Promise<any> {
  try {
    const authToken = await getAuthToken(token);
    
    // Endpoint должен быть без /api, так как baseUrl уже содержит /api
    const response = await beliotApiRequest(
      'abonent/main/data',
      'POST',
      {},
      undefined,
      {
        'Authorization': `Bearer ${authToken}`,
      }
    );
    
    return response;
  } catch (error: any) {
    console.error('Ошибка получения данных абонента:', error);
    
    // Если ошибка 401, пробуем обновить токен
    if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
      console.log('🔄 Токен истек, обновляем...');
      try {
        const newToken = await getBeliotToken(true); // Принудительное обновление
        const retryResponse = await beliotApiRequest(
          '/api/abonent/main/data',
          'POST',
          {},
          undefined,
          {
            'Authorization': `Bearer ${newToken}`,
          }
        );
        return retryResponse;
      } catch (retryError: any) {
        throw new Error(`Не удалось получить данные абонента после обновления токена: ${retryError.message}`);
      }
    }
    
    throw new Error(`Не удалось получить данные абонента: ${error.message}`);
  }
}

/**
 * Получить список устройств компании из данных абонента
 * 
 * @param {string} token - Bearer token для аутентификации
 * @returns {Promise<BeliotDevice[]>} Список устройств
 */
export async function getCompanyDevicesFromAbonent(token?: string): Promise<BeliotDevice[]> {
  try {
    const abonentData = await getAbonentMainData(token);
    
    // Извлекаем список устройств из ответа
    if (abonentData?.data?.devices_list && Array.isArray(abonentData.data.devices_list)) {
      return abonentData.data.devices_list;
    }
    
    // Пробуем альтернативные форматы
    if (abonentData?.devices_list && Array.isArray(abonentData.devices_list)) {
      return abonentData.devices_list;
    }
    
    if (abonentData?.data?.devices && Array.isArray(abonentData.data.devices)) {
      return abonentData.data.devices;
    }
    
    return [];
  } catch (error: any) {
    console.error('Ошибка получения устройств компании:', error);
    throw error;
  }
}

/**
 * Получить устройство учета по ID
 * 
 * Использует endpoint: GET /api/device/metering_device/{id}
 * 
 * @param {string} deviceId - ID устройства
 * @param {string} token - Bearer token для аутентификации
 * @returns {Promise<BeliotDevice | null>} Устройство или null
 */
export async function getDeviceById(
  deviceId: string,
  token?: string
): Promise<BeliotDevice | null> {
  if (!deviceId) {
    throw new Error('ID устройства не указан');
  }

  try {
    const authToken = await getAuthToken(token);
    
    // Endpoint должен быть без /api, так как baseUrl уже содержит /api
    const response = await beliotApiRequest(
      `device/metering_device/${deviceId}`,
      'GET',
      undefined,
      undefined,
      {
        'Authorization': `Bearer ${authToken}`,
      }
    );
    
    // Логируем полный ответ для отладки
    console.log(`🔍 getDeviceById(${deviceId}): Полный ответ:`, {
      hasResponse: !!response,
      responseType: typeof response,
      responseKeys: response ? Object.keys(response) : [],
      hasData: !!response?.data,
      dataKeys: response?.data ? Object.keys(response.data) : [],
      hasMeteringDevice: !!response?.data?.metering_device,
      meteringDeviceKeys: response?.data?.metering_device ? Object.keys(response.data.metering_device) : [],
    });
    
    // Проверяем различные форматы ответа
    let device: BeliotDevice | null = null;
    
    // Формат 1: { data: { metering_device: { ...device }, tied_point: { ... } } } - ОСНОВНОЙ ФОРМАТ!
    if (response?.data?.metering_device && typeof response.data.metering_device === 'object') {
      const candidate = response.data.metering_device;
      // Проверяем, что это объект устройства (есть id или другие признаки устройства)
      if (candidate.id || candidate.device_id || candidate._id || candidate.name || candidate.deviceID) {
        device = candidate as BeliotDevice;
        
        // Важно: tied_point находится на уровне response.data, а не внутри metering_device!
        if (response.data.tied_point && !device.tied_point) {
          device.tied_point = response.data.tied_point;
          console.log(`✅ Формат 1: response.data.metering_device + tied_point из response.data.tied_point`);
        } else {
          console.log(`✅ Формат 1: response.data.metering_device (найдено устройство)`);
        }
      } else {
        console.warn(`⚠️ Формат 1: response.data.metering_device найден, но не похож на устройство:`, Object.keys(candidate));
      }
    }
    
    // Формат 2: { data: { data: { ...device } } }
    if (!device && response?.data?.data && typeof response.data.data === 'object') {
      const candidate = response.data.data;
      if (candidate.id || candidate.device_id || candidate._id) {
        device = candidate as BeliotDevice;
        console.log(`✅ Формат 2: response.data.data`);
      }
    }
    
    // Формат 3: { data: { ...device } }
    if (!device && response?.data && typeof response.data === 'object') {
      const candidate = response.data;
      if (candidate.id || candidate.device_id || candidate._id) {
        device = candidate as BeliotDevice;
        console.log(`✅ Формат 3: response.data`);
      }
    }
    
    // Формат 4: прямой объект устройства
    if (!device && response && typeof response === 'object' && !Array.isArray(response)) {
      if (response.id || response.device_id || response._id) {
        device = response as BeliotDevice;
        console.log(`✅ Формат 4: прямой объект`);
      }
    }
    
    if (device) {
      // Логируем наличие tied_point для отладки
      console.log(`📋 Устройство ${deviceId}:`, {
        id: device.id || device.device_id || device._id,
        name: device.name,
        hasTiedPoint: !!device.tied_point,
        tiedPointType: typeof device.tied_point,
        tiedPointKeys: device.tied_point ? Object.keys(device.tied_point) : [],
        tiedPointPlace: device.tied_point?.place,
      });
      
      if (device.tied_point?.place) {
        // Логируем только в debug режиме
        if (import.meta.env.DEV) {
          console.debug(`✅ getDeviceById(${deviceId}): tied_point.place = "${device.tied_point.place}"`);
        }
      } else {
        // Это не критично, просто информация для отладки
        if (import.meta.env.DEV) {
          console.debug(`ℹ️ getDeviceById(${deviceId}): tied_point.place отсутствует`);
        }
        // Проверяем, может быть tied_point находится в другом месте
        if ((device as any).metering_device?.tied_point) {
          if (import.meta.env.DEV) {
            console.log(`   - metering_device.tied_point найден:`, (device as any).metering_device.tied_point);
          }
          device.tied_point = (device as any).metering_device.tied_point;
        }
      }
      
      return device;
    }

    console.warn('⚠️ Неожиданный формат ответа от getDeviceById:', {
      deviceId,
      response: JSON.stringify(response, null, 2).substring(0, 500),
    });
    return null;
  } catch (error: any) {
    console.error('Ошибка получения устройства по ID:', error);
    
    // Если ошибка 401, пробуем обновить токен
    if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
      console.log('🔄 Токен истек, обновляем...');
      try {
        const newToken = await getBeliotToken(true);
        return await getDeviceById(deviceId, newToken);
      } catch (retryError: any) {
        throw new Error(`Не удалось получить устройство после обновления токена: ${retryError.message}`);
      }
    }
    
    throw new Error(`Не удалось получить устройство: ${error.message}`);
  }
}

/**
 * Интерфейс группы устройств
 */
export interface BeliotDeviceGroup {
  id: number;
  name: string;
  description?: string;
  device_count?: number;
  group_key?: string; // Ключ для фильтрации устройств
  device_group_id?: number | string; // ID группы устройств для фильтрации
  object_id?: number; // ID объекта из API
  facility_passport?: string; // Паспорт объекта (например, "ХВО")
  [key: string]: any;
}

/**
 * Получить список групп устройств учета
 * 
 * Использует endpoint: POST /api/device/model/metering_device/groups
 * 
 * @param {string} token - Bearer token для аутентификации
 * @returns {Promise<BeliotDeviceGroup[]>} Список групп устройств
 */
export async function getDeviceGroups(token?: string): Promise<BeliotDeviceGroup[]> {
  try {
    const authToken = await getAuthToken(token);
    
    const response = await beliotApiRequest(
      'device/model/metering_device/groups',
      'POST',
      {},
      undefined,
      {
        'Authorization': `Bearer ${authToken}`,
      }
    );
    
    console.log('📋 Полный ответ от device/model/metering_device/groups:', JSON.stringify(response, null, 2));
    console.log('📋 Тип ответа:', typeof response);
    console.log('📋 Ключи ответа:', Object.keys(response || {}));
    
    // Проверяем различные форматы ответа
    if (response?.data) {
      // Формат: { data: { data: { groups: [...] } } }
      if (response.data.data?.groups && Array.isArray(response.data.data.groups)) {
        console.log(`✅ Получено групп устройств из data.data.groups: ${response.data.data.groups.length}`);
        return response.data.data.groups.map((group: any, index: number) => ({
          id: group.id || group.group_id || index + 1,
          name: group.name || group.group_name || 'Без названия',
          description: group.description,
          device_count: group.device_count || group.count || 0,
          group_key: String(group.id || group.group_id || index + 1),
          device_group_id: group.id || group.group_id,
        }));
      }
      
      // Формат: { data: { groups: [...] } }
      if (response.data.groups && Array.isArray(response.data.groups)) {
        console.log(`✅ Получено групп устройств из data.groups: ${response.data.groups.length}`);
        return response.data.groups.map((group: any, index: number) => ({
          id: group.id || group.group_id || index + 1,
          name: group.name || group.group_name || 'Без названия',
          description: group.description,
          device_count: group.device_count || group.count || 0,
          group_key: String(group.id || group.group_id || index + 1),
          device_group_id: group.id || group.group_id,
        }));
      }
      
      // Формат: { data: [...] }
      if (Array.isArray(response.data)) {
        console.log(`✅ Получено групп устройств из data (массив): ${response.data.length}`);
        return response.data.map((group: any, index: number) => ({
          id: group.id || group.group_id || index + 1,
          name: group.name || group.group_name || 'Без названия',
          description: group.description,
          device_count: group.device_count || group.count || 0,
          group_key: String(group.id || group.group_id || index + 1),
          device_group_id: group.id || group.group_id,
        }));
      }
      
      // Формат: { data: { data: [...] } }
      if (response.data.data && Array.isArray(response.data.data)) {
        console.log(`✅ Получено групп устройств из data.data: ${response.data.data.length}`);
        return response.data.data.map((group: any, index: number) => ({
          id: group.id || group.group_id || index + 1,
          name: group.name || group.group_name || 'Без названия',
          description: group.description,
          device_count: group.device_count || group.count || 0,
          group_key: String(group.id || group.group_id || index + 1),
          device_group_id: group.id || group.group_id,
        }));
      }
    }
    
    // Формат: прямой массив
    if (Array.isArray(response)) {
      console.log(`✅ Получено групп устройств (прямой массив): ${response.length}`);
      return response.map((group: any, index: number) => ({
        id: group.id || group.group_id || index + 1,
        name: group.name || group.group_name || 'Без названия',
        description: group.description,
        device_count: group.device_count || group.count || 0,
        group_key: String(group.id || group.group_id || index + 1),
        device_group_id: group.id || group.group_id,
      }));
    }

    console.warn('⚠️ Неожиданный формат ответа от device/model/metering_device/groups:', {
      hasData: !!response?.data,
      dataKeys: response?.data ? Object.keys(response.data) : [],
      responseKeys: Object.keys(response || {}),
      responseType: typeof response,
      responseSample: JSON.stringify(response, null, 2).substring(0, 500),
    });
    return [];
  } catch (error: any) {
    console.error('Ошибка получения групп устройств:', error);
    
    // Если ошибка 401, пробуем обновить токен
    if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
      console.log('🔄 Токен истек, обновляем...');
      try {
        const newToken = await getBeliotToken(true);
        return await getDeviceGroups(newToken);
      } catch (retryError: any) {
        throw new Error(`Не удалось получить группы устройств после обновления токена: ${retryError.message}`);
      }
    }
    
    throw new Error(`Не удалось получить группы устройств: ${error.message}`);
  }
}

/**
 * Получить список устройств учета (metering devices) компании
 * 
 * Использует endpoint: POST /api/device/metering_devices
 * 
 * @param {GetCompanyDevicesParams} params - Параметры запроса
 *   - interface_id: ID интерфейса
 *   - model_id: ID модели
 *   - name: Имя устройства (поиск)
 *   - device_group_id: ID группы устройств
 *   - is_deleted: Показать удаленные устройства
 *   - available_accounting_points: Доступные точки учета
 *   - ids: Массив ID устройств
 *   - fields_filter: Фильтр полей
 *   - search_string: Строка поиска
 *   - sort_field: Поле сортировки
 *   - sort: Направление сортировки (asc/desc)
 *   - paginate: Использовать пагинацию
 *   - charge_battery: Фильтр по заряду батареи
 *   - address: Адрес устройства
 *   - append_fields: Дополнительные поля
 * @param {string} token - Bearer token для аутентификации
 * @returns {Promise<BeliotDevice[]>} Список устройств учета
 */
export async function getCompanyDevices(
  params?: GetCompanyDevicesParams,
  token?: string
): Promise<BeliotDevice[]> {
  try {
    const authToken = await getAuthToken(token);
    
    // Основной endpoint для получения устройств учета
    const requestBody = params || {};
    
    // Endpoint должен быть без /api, так как baseUrl уже содержит /api
    const response = await beliotApiRequest(
      'device/metering_devices',
      'POST',
      requestBody,
      undefined,
      {
        'Authorization': `Bearer ${authToken}`,
      }
    );
    
    // Проверяем различные форматы ответа
    if (response?.data) {
      // Формат: { data: { data: { metering_devices: { data: [...] } } } }
      if (response.data.data?.metering_devices?.data && Array.isArray(response.data.data.metering_devices.data)) {
        console.log(`✅ Получено устройств из data.data.metering_devices.data: ${response.data.data.metering_devices.data.length}`);
        return response.data.data.metering_devices.data;
      }
      
      // Формат: { data: { metering_devices: { data: [...] } } }
      if (response.data.metering_devices?.data && Array.isArray(response.data.metering_devices.data)) {
        console.log(`✅ Получено устройств из metering_devices.data: ${response.data.metering_devices.data.length}`);
        return response.data.metering_devices.data;
      }
      
      // Формат: { data: [...] }
      if (Array.isArray(response.data)) {
        return response.data;
      }
      
      // Формат: { data: { devices: [...] } }
      if (response.data.devices && Array.isArray(response.data.devices)) {
        return response.data.devices;
      }
      
      // Формат: { data: { data: [...] } }
      if (response.data.data && Array.isArray(response.data.data)) {
        return response.data.data;
      }
      
      // Формат: { data: { devices_list: [...] } }
      if (response.data.devices_list && Array.isArray(response.data.devices_list)) {
        return response.data.devices_list;
      }
    }
    
    // Формат: прямой массив
    if (Array.isArray(response)) {
      return response;
    }

    // Если формат неожиданный, возвращаем пустой массив
    console.warn('⚠️ Неожиданный формат ответа от /api/device/metering_devices:', {
      hasData: !!response?.data,
      dataKeys: response?.data ? Object.keys(response.data) : [],
      responseKeys: Object.keys(response || {}),
    });
    return [];
  } catch (error: any) {
    console.error('Ошибка получения устройств компании:', error);
    
    // Если ошибка 401, пробуем обновить токен
    if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
      console.log('🔄 Токен истек, обновляем...');
      try {
        const newToken = await getBeliotToken(true); // Принудительное обновление
      const retryResponse = await beliotApiRequest(
        'device/metering_devices',
        'POST',
        params || {},
        undefined,
        {
          'Authorization': `Bearer ${newToken}`,
        }
      );
        
        if (retryResponse?.data && Array.isArray(retryResponse.data)) {
          return retryResponse.data;
        }
        if (Array.isArray(retryResponse)) {
          return retryResponse;
        }
      } catch (retryError: any) {
        // Пробуем через данные абонента как fallback
        try {
          console.log('Пробуем получить устройства через данные абонента...');
          const fallbackToken = await getBeliotToken(true);
          return await getCompanyDevicesFromAbonent(fallbackToken);
        } catch (fallbackError: any) {
          throw new Error(`Не удалось получить устройства компании: ${retryError.message}`);
        }
      }
    }
    
    // Fallback: пробуем через данные абонента
    try {
      console.log('Пробуем получить устройства через данные абонента...');
      return await getCompanyDevicesFromAbonent(token);
    } catch (fallbackError: any) {
      throw new Error(`Не удалось получить устройства компании: ${error.message}`);
    }
  }
}

/**
 * Интерфейс для показаний устройства за период
 */
export interface DeviceReading {
  period: string; // 'current' | 'previous'
  date?: string | number | Date; // API может вернуть строку, unix-timestamp или Date
  value?: number;
  unit?: string;
  [key: string]: any;
}

/**
 * Интерфейс для показаний устройства (последний и предыдущий период)
 */
export interface DeviceReadings {
  current?: DeviceReading; // Последний период
  previous?: DeviceReading; // Предыдущий период
  [key: string]: any;
}

/**
 * Получить показания устройства за последний и предыдущий период
 * 
 * Использует endpoint: POST /api/device/attributes
 * 
 * @param {string} deviceId - ID устройства
 * @param {string} token - Bearer token для аутентификации
 * @returns {Promise<DeviceReadings>} Показания за последний и предыдущий период
 */
export async function getDeviceReadings(
  deviceId: string,
  token?: string
): Promise<DeviceReadings> {
  if (!deviceId) {
    throw new Error('ID устройства не указан');
  }

  try {
    const authToken = await getAuthToken(token);
    
    const headers = {
      'Authorization': `Bearer ${authToken}`,
    };

    // Получаем атрибуты устройства, которые могут содержать показания
    const response = await beliotApiRequest(
      'device/attributes',
      'POST',
      {
        device_id: deviceId,
      },
      undefined,
      headers
    );

    // Извлекаем показания из ответа
    const readings: DeviceReadings = {
      current: undefined,
      previous: undefined,
    };

    // Пробуем найти показания в различных форматах ответа
    if (response?.data) {
      const data = response.data;
      
      // Формат 1: data содержит массив атрибутов с показаниями
      if (Array.isArray(data)) {
        // Ищем атрибуты связанные с показаниями (in1, in2, и т.д.)
        const readingAttributes = data.filter((attr: any) => 
          attr.attribute_name && /in\d+|reading|measurement|value/i.test(attr.attribute_name)
        );
        
        // Сортируем по дате и берем последние два
        const sortedByDate = readingAttributes.sort((a: any, b: any) => {
          const dateA = new Date(a.date || a.created_at || 0).getTime();
          const dateB = new Date(b.date || b.created_at || 0).getTime();
          return dateB - dateA;
        });
        
        if (sortedByDate.length > 0) {
          readings.current = {
            period: 'current',
            date: sortedByDate[0].date || sortedByDate[0].created_at,
            value: sortedByDate[0].value || sortedByDate[0].attribute_value,
            unit: sortedByDate[0].unit || 'м³', // По умолчанию м³
            ...sortedByDate[0],
          };
        }
        
        if (sortedByDate.length > 1) {
          readings.previous = {
            period: 'previous',
            date: sortedByDate[1].date || sortedByDate[1].created_at,
            value: sortedByDate[1].value || sortedByDate[1].attribute_value,
            unit: sortedByDate[1].unit || 'м³', // По умолчанию м³
            ...sortedByDate[1],
          };
        }
      }
      
      // Формат 2: data содержит объект с показаниями
      if (typeof data === 'object' && !Array.isArray(data)) {
        // Ищем поля связанные с показаниями
        const readingKeys = Object.keys(data).filter(k => 
          /in\d+|reading|measurement|value|current|previous|last|period/i.test(k)
        );
        
        readingKeys.forEach(key => {
          const value = data[key];
          if (value && typeof value === 'object') {
            if (/current|last|latest/i.test(key) && !readings.current) {
              readings.current = {
                period: 'current',
                ...value,
              };
            } else if (/previous|prev|old/i.test(key) && !readings.previous) {
              readings.previous = {
                period: 'previous',
                ...value,
              };
            }
          }
        });
      }
    }

    // Если показания не найдены в атрибутах, пробуем получить из устройства
    if (!readings.current || !readings.previous) {
      const device = await getDeviceById(deviceId, authToken);
      if (device) {
        // Пробуем извлечь показания из last_message_type
        if (device.last_message_type && typeof device.last_message_type === 'object') {
          const msgType = device.last_message_type as any;
          
          // Текущие показания из in1
          if (msgType['1'] && msgType['1'].in1 !== undefined) {
            readings.current = {
              period: 'current',
              value: msgType['1'].in1,
              date: msgType['1'].date || device.updated_at,
              unit: 'м³', // По умолчанию м³
              ...msgType['1'],
            };
          }
          
          // Предыдущие показания из in2 или из истории
          if (msgType['2'] && msgType['2'].in1 !== undefined) {
            readings.previous = {
              period: 'previous',
              value: msgType['2'].in1,
              date: msgType['2'].date,
              unit: 'м³', // По умолчанию м³
              ...msgType['2'],
            };
          }
        }
      }
    }

    return readings;
  } catch (error: any) {
    console.error('Ошибка получения показаний устройства:', error);
    
    // Если ошибка 401, пробуем обновить токен
    if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
      console.log('🔄 Токен истек, обновляем...');
      try {
        const newToken = await getBeliotToken(true);
        return await getDeviceReadings(deviceId, newToken);
      } catch (retryError: any) {
        throw new Error(`Не удалось получить показания устройства после обновления токена: ${retryError.message}`);
      }
    }
    
    throw new Error(`Не удалось получить показания устройства: ${error.message}`);
  }
}

/**
 * Получить состояние устройства
 * 
 * @param {string} deviceId - ID устройства
 * @param {string} token - Bearer token для аутентификации
 * @returns {Promise<any>} Состояние устройства
 */
export async function getDeviceState(
  deviceId: string,
  token?: string
): Promise<any> {
  if (!deviceId) {
    throw new Error('ID устройства не указан');
  }

  try {
    const authToken = await getAuthToken(token);
    
    const headers = {
      'Authorization': `Bearer ${authToken}`,
    };

    // Пробуем разные возможные endpoints для получения состояния
    // Endpoints без /api, так как baseUrl уже содержит /api
    const possibleEndpoints = [
      `device/${deviceId}/state`,
      `device/${deviceId}/status`,
      `device/state/${deviceId}`,
      `device/status/${deviceId}`,
    ];

    for (const endpoint of possibleEndpoints) {
      try {
        const response = await beliotApiRequest(
          endpoint,
          'GET',
          undefined,
          undefined,
          headers
        );
        
        if (response?.data || response) {
          return response.data || response;
        }
      } catch (error: any) {
        // Пробуем следующий endpoint
        if (endpoint === possibleEndpoints[possibleEndpoints.length - 1]) {
          // Если все endpoints не сработали, возвращаем устройство целиком
          const device = await getDeviceById(deviceId, authToken);
          if (device) {
            return {
              device_id: device.device_id || device.id || device._id,
              status: device.status,
              state: device.state,
              is_active: device.is_active,
              ...device,
            };
          }
          throw error;
        }
      }
    }

    return null;
  } catch (error: any) {
    console.error('Ошибка получения состояния устройства:', error);
    
    // Если ошибка 401, пробуем обновить токен
    if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
      console.log('🔄 Токен истек, обновляем...');
      try {
        const newToken = await getBeliotToken(true);
        return await getDeviceState(deviceId, newToken);
      } catch (retryError: any) {
        throw new Error(`Не удалось получить состояние устройства после обновления токена: ${retryError.message}`);
      }
    }
    
    throw new Error(`Не удалось получить состояние устройства: ${error.message}`);
  }
}

/**
 * Получить состояния всех устройств компании
 * 
 * @param {string} companyId - ID компании (опционально, если не указан - используется текущая компания)
 * @param {string} token - Bearer token для аутентификации
 * @returns {Promise<Array<{device: BeliotDevice, state: any}>>} Массив устройств с их состояниями
 */
export async function getCompanyDevicesStates(
  companyId?: string,
  token?: string
): Promise<Array<{ device: BeliotDevice; state: any }>> {
  try {
    // Получаем список устройств компании
    const params: GetCompanyDevicesParams = {};
    if (companyId) {
      params.company_id = companyId;
    }

    const devices = await getCompanyDevices(params, token);
    
    // Получаем состояние для каждого устройства
    const devicesWithStates = await Promise.all(
      devices.map(async (device) => {
        const deviceId = device.device_id || device.id || device._id;
        if (!deviceId) {
          return { device, state: null };
        }

        try {
          const state = await getDeviceState(deviceId.toString(), token);
          return { device, state };
        } catch (error: any) {
          console.warn(`Не удалось получить состояние устройства ${deviceId}:`, error);
          return { device, state: null };
        }
      })
    );

    return devicesWithStates;
  } catch (error: any) {
    console.error('Ошибка получения состояний устройств компании:', error);
    throw new Error(`Не удалось получить состояния устройств: ${error.message}`);
  }
}

