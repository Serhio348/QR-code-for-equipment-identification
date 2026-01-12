/**
 * Скрипт автоматической синхронизации показаний счетчиков Beliot с Supabase
 * 
 * Запускается через GitHub Actions каждый час (cron: '50 * * * *')
 * 
 * НОВАЯ ЛОГИКА:
 * - Получает показания за последние 24 часа (сутки) от текущего момента
 * - Фильтрует показания на начало каждого часа
 * - Сохраняет все показания в Supabase
 * - Работает независимо от задержек GitHub Actions (даже если задержка > 2 часов)
 * - Не перегружает запросы: запрашивает только последние сутки
 * 
 * Переменные окружения (GitHub Actions / Railway):
 * - SUPABASE_URL - URL проекта Supabase
 * - SUPABASE_SERVICE_ROLE_KEY - Service Role key из Supabase
 * - BELIOT_LOGIN - Email для входа в Beliot API
 * - BELIOT_PASSWORD - Пароль для входа в Beliot API
 * - BELIOT_API_BASE_URL - Базовый URL Beliot API (опционально, по умолчанию https://beliot.by:4443/api)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Получаем путь к корню проекта
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

/**
 * Загрузить переменные окружения из .env.local файла
 */
function loadEnvFile(): void {
  try {
    const envPath = join(projectRoot, '.env.local');
    const envContent = readFileSync(envPath, 'utf-8');
    
    const lines = envContent.split('\n');
    for (const line of lines) {
      const trimmedLine = line.trim();
      // Пропускаем пустые строки и комментарии
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        continue;
      }
      
      // Парсим KEY=VALUE
      const equalIndex = trimmedLine.indexOf('=');
      if (equalIndex === -1) {
        continue;
      }
      
      const key = trimmedLine.substring(0, equalIndex).trim();
      let value = trimmedLine.substring(equalIndex + 1).trim();
      
      // Удаляем кавычки, если есть
      if ((value.startsWith('"') && value.endsWith('"')) || 
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      
      // Устанавливаем переменную окружения, если она еще не установлена
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
    
    console.log('✅ Переменные окружения загружены из .env.local');
  } catch (error: any) {
    // Игнорируем ошибку, если файл не найден (в Railway переменные будут в process.env)
    if (error.code !== 'ENOENT') {
      console.warn('⚠️ Не удалось загрузить .env.local:', error.message);
    }
  }
}

// Загружаем переменные окружения из .env.local (для локальной разработки)
loadEnvFile();

// Для Beliot API может потребоваться отключение проверки SSL (только для разработки)
// В продакшене Railway это должно работать с валидными сертификатами
if (process.env.NODE_ENV !== 'production') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

// Загружаем переменные окружения
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const beliotLogin = process.env.BELIOT_LOGIN || process.env.VITE_BELIOT_LOGIN || 'energo@brestvodka.by';
const beliotPassword = process.env.BELIOT_PASSWORD || process.env.VITE_BELIOT_PASSWORD;
const beliotApiBaseUrl = process.env.BELIOT_API_BASE_URL || process.env.VITE_BELIOT_API_BASE_URL || 'https://beliot.by:4443/api';

// Проверка переменных окружения
console.log('🔍 Проверка переменных окружения:');
console.log(`   SUPABASE_URL: ${supabaseUrl ? '✅ установлен' : '❌ не найден'}`);
console.log(`   SUPABASE_SERVICE_ROLE_KEY: ${supabaseServiceKey ? '✅ установлен' : '❌ не найден'}`);
console.log(`   BELIOT_LOGIN: ${beliotLogin ? '✅ установлен' : '❌ не найден'}`);
console.log(`   BELIOT_PASSWORD: ${beliotPassword ? '✅ установлен' : '❌ не найден'}`);

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('\n❌ Переменные окружения не настроены!');
  console.error('Нужны: SUPABASE_URL (или VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY (или VITE_SUPABASE_SERVICE_ROLE_KEY)');
  console.error('\nПроверьте:');
  console.error('   1. Файл .env.local в корне проекта');
  console.error('   2. Переменные окружения в системе');
  process.exit(1);
}

if (!beliotPassword) {
  console.error('❌ BELIOT_PASSWORD не настроен!');
  process.exit(1);
}

// Создаем Supabase клиент с Service Role key
const supabase: SupabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * Интерфейсы для Beliot API
 */
interface BeliotDevice {
  device_id: string;
  name?: string;
  [key: string]: any;
}

interface DeviceReading {
  value: number;
  date: string | Date;
  unit?: string;
  [key: string]: any;
}

interface DeviceReadings {
  current?: DeviceReading;
  previous?: DeviceReading;
}

/**
 * Получить токен Beliot API
 */
async function getBeliotToken(): Promise<string> {
  try {
    console.log('🔐 Получение токена Beliot API...');
    
    const response = await fetch(`${beliotApiBaseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: beliotLogin,
        password: beliotPassword,
        personal_data_access: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ошибка аутентификации: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Извлекаем токен из различных возможных форматов ответа
    const token = data?.token || data?.access_token || data?.bearer_token || 
                  data?.data?.token || data?.data?.access_token || data?.data?.bearer_token;

    if (!token) {
      throw new Error('Токен не найден в ответе API');
    }

    console.log('✅ Токен получен');
    return token;
  } catch (error: any) {
    console.error('❌ Ошибка получения токена:', error.message);
    throw error;
  }
}

/**
 * Получить список всех устройств компании
 * 
 * Использует endpoint: POST /api/device/metering_devices
 * Или fallback: POST /api/abonent/main/data
 */
async function getCompanyDevices(token: string): Promise<BeliotDevice[]> {
  try {
    console.log('📋 Получение списка устройств...');
    
    // Пробуем основной endpoint: POST /api/device/metering_devices
    let response = await fetch(`${beliotApiBaseUrl}/device/metering_devices`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    let data;
    
    if (!response.ok) {
      console.log(`⚠️ Endpoint /device/metering_devices вернул ${response.status}, пробуем fallback...`);
      
      // Fallback: POST /api/abonent/main/data
      response = await fetch(`${beliotApiBaseUrl}/abonent/main/data`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        throw new Error(`Ошибка получения устройств: ${response.status} ${response.statusText}`);
      }

      data = await response.json();
      
      // Извлекаем устройства из abonent/main/data
      const devices = data?.data?.devices_list || 
                     data?.devices_list || 
                     data?.data?.devices || 
                     data?.devices || 
                     [];
      
      if (!Array.isArray(devices)) {
        throw new Error('Ожидался массив устройств в ответе API (abonent/main/data)');
      }

      console.log(`✅ Найдено устройств (через abonent/main/data): ${devices.length}`);
      return devices;
    }

    data = await response.json();
    
    // Логируем структуру ответа для отладки
    console.log('🔍 Структура ответа API:', {
      hasData: !!data?.data,
      dataKeys: data?.data ? Object.keys(data.data) : [],
      topLevelKeys: Object.keys(data || {}),
      isArray: Array.isArray(data),
      isDataArray: Array.isArray(data?.data),
    });
    
    // Извлекаем массив устройств из различных возможных форматов ответа
    let devices: BeliotDevice[] = [];
    
    // Формат 1: { data: { data: { metering_devices: { data: [...] } } } }
    if (data?.data?.data?.metering_devices?.data && Array.isArray(data.data.data.metering_devices.data)) {
      devices = data.data.data.metering_devices.data;
      console.log('✅ Формат 1: data.data.metering_devices.data');
    }
    // Формат 2: { data: { metering_devices: { data: [...] } } }
    else if (data?.data?.metering_devices?.data && Array.isArray(data.data.metering_devices.data)) {
      devices = data.data.metering_devices.data;
      console.log('✅ Формат 2: data.metering_devices.data');
    }
    // Формат 3: { data: [...] }
    else if (data?.data && Array.isArray(data.data)) {
      devices = data.data;
      console.log('✅ Формат 3: data (массив)');
    }
    // Формат 4: { devices: [...] }
    else if (data?.devices && Array.isArray(data.devices)) {
      devices = data.devices;
      console.log('✅ Формат 4: devices');
    }
    // Формат 5: прямой массив
    else if (Array.isArray(data)) {
      devices = data;
      console.log('✅ Формат 5: прямой массив');
    }
    // Формат 6: { data: { devices: [...] } }
    else if (data?.data?.devices && Array.isArray(data.data.devices)) {
      devices = data.data.devices;
      console.log('✅ Формат 6: data.devices');
    }
    // Формат 7: { data: { devices_list: [...] } }
    else if (data?.data?.devices_list && Array.isArray(data.data.devices_list)) {
      devices = data.data.devices_list;
      console.log('✅ Формат 7: data.devices_list');
    }
    
    if (!Array.isArray(devices) || devices.length === 0) {
      console.warn('⚠️ Устройства не найдены в основном формате, пробуем fallback...');
      console.log('🔍 Полный ответ API (первые 500 символов):', JSON.stringify(data, null, 2).substring(0, 500));
      
      // Пробуем fallback
      const fallbackResponse = await fetch(`${beliotApiBaseUrl}/abonent/main/data`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (fallbackResponse.ok) {
        const fallbackData = await fallbackResponse.json();
        console.log('🔍 Структура fallback ответа:', {
          hasData: !!fallbackData?.data,
          dataKeys: fallbackData?.data ? Object.keys(fallbackData.data) : [],
          topLevelKeys: Object.keys(fallbackData || {}),
        });
        
        devices = fallbackData?.data?.devices_list || 
                 fallbackData?.devices_list || 
                 fallbackData?.data?.devices || 
                 fallbackData?.devices || 
                 [];
        
        if (devices.length > 0) {
          console.log('✅ Устройства найдены через fallback (abonent/main/data)');
        }
      }
    }
    
    if (!Array.isArray(devices)) {
      throw new Error('Ожидался массив устройств в ответе API');
    }

    console.log(`✅ Найдено устройств: ${devices.length}`);
    return devices;
  } catch (error: any) {
    console.error('❌ Ошибка получения устройств:', error.message);
    throw error;
  }
}

/**
 * Получить показания устройства за период из Beliot API
 * 
 * Использует endpoint: POST /api/device/messages
 * 
 * @param deviceId - ID устройства
 * @param startDate - Начало периода (unix timestamp в секундах)
 * @param stopDate - Конец периода (unix timestamp в секундах)
 * @param token - Bearer token
 * @param msgType - Тип сообщений (1=тариф, по умолчанию)
 * @returns Promise с массивом показаний
 */
async function getDeviceMessagesFromApi(
  deviceId: string | number,
  startDate: number,
  stopDate: number,
  token: string,
  msgType: number = 1
): Promise<any[]> {
  try {
    const response = await fetch(`${beliotApiBaseUrl}/device/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        device_id: Number(deviceId),
        msgType: msgType,
        msgGroup: 0, // все группы
        startDate: startDate,
        stopDate: stopDate,
        per_page: 10000, // Максимальное количество записей
        paginate: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ошибка получения показаний: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Извлекаем сообщения из ответа
    // Структура: { data: { messages: { data: [...] } } }
    let messages: any[] = [];
    
    if (data?.data?.messages?.data && Array.isArray(data.data.messages.data)) {
      messages = data.data.messages.data;
    } else if (data?.data?.messages && Array.isArray(data.data.messages)) {
      messages = data.data.messages;
    } else if (data?.messages?.data && Array.isArray(data.messages.data)) {
      messages = data.messages.data;
    } else if (Array.isArray(data?.data)) {
      messages = data.data;
    } else if (Array.isArray(data)) {
      messages = data;
    }

    return messages;
  } catch (error: any) {
    console.error(`Ошибка получения показаний для устройства ${deviceId}:`, error.message);
    throw error;
  }
}

/**
 * Фильтровать показания - выбрать первое показание в каждом часе (ближайшее к началу часа)
 * 
 * @param messages - Массив показаний из API
 * @returns Отфильтрованный массив (по одному показанию на час) с timestamp
 */
function filterByHourStart(messages: any[]): Array<any & { timestamp: number }> {
  const hourMap = new Map<string, any & { timestamp: number; minutesFromHourStart: number }>();
  
  for (const msg of messages) {
    // Извлекаем timestamp
    let timestamp: number | null = null;
    
    if (msg.realdatetime) {
      timestamp = typeof msg.realdatetime === 'number' ? msg.realdatetime : parseInt(String(msg.realdatetime), 10);
    } else if (msg.datetime) {
      timestamp = typeof msg.datetime === 'number' ? msg.datetime : parseInt(String(msg.datetime), 10);
    }
    
    if (timestamp) {
      const date = new Date(timestamp * 1000);
      const year = date.getFullYear();
      const month = date.getMonth();
      const day = date.getDate();
      const hour = date.getHours();
      const minutes = date.getMinutes();
      const seconds = date.getSeconds();
      
      // Ключ: год-месяц-день-час (для уникальности часа)
      const hourKey = `${year}-${month}-${day}-${hour}`;
      
      // Вычисляем количество минут от начала часа
      const minutesFromHourStart = minutes + seconds / 60;
      
      // Если для этого часа еще нет показания или это показание ближе к началу часа
      if (!hourMap.has(hourKey)) {
        hourMap.set(hourKey, { ...msg, timestamp, minutesFromHourStart });
      } else {
        const existing = hourMap.get(hourKey)!;
        // Выбираем показание, которое ближе к началу часа (00:00)
        if (minutesFromHourStart < existing.minutesFromHourStart) {
          hourMap.set(hourKey, { ...msg, timestamp, minutesFromHourStart });
        }
      }
    }
  }
  
  // Преобразуем Map в массив и сортируем по времени
  return Array.from(hourMap.values())
    .map(({ minutesFromHourStart, ...msg }) => msg) // Удаляем временное поле
    .sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Получить показания устройства (старый метод, оставлен для совместимости)
 * 
 * Использует endpoint: POST /api/device/attributes
 * Или fallback: GET /api/device/metering_device/{id} для получения last_message_type
 */
async function getDeviceReadings(deviceId: string, token: string): Promise<DeviceReadings> {
  try {
    // Пробуем получить показания через device/attributes
    const response = await fetch(`${beliotApiBaseUrl}/device/attributes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        device_id: deviceId,
      }),
    });

    if (!response.ok) {
      console.warn(`⚠️ Endpoint /device/attributes вернул ${response.status} для устройства ${deviceId}, пробуем fallback...`);
    } else {
      const data = await response.json();
      
      // Извлекаем показания из ответа
      const readings: DeviceReadings = {
        current: undefined,
        previous: undefined,
      };

      // Пробуем найти показания в различных форматах ответа
      if (data?.data && Array.isArray(data.data)) {
        const attributes = data.data;
        
        // Ищем атрибуты связанные с показаниями (in1, in2, и т.д.)
        const readingAttributes = attributes.filter((attr: any) => 
          attr.attribute_name && /in\d+|reading|measurement|value/i.test(attr.attribute_name)
        );
        
        if (readingAttributes.length > 0) {
          // Сортируем по дате и берем последние два
          const sortedByDate = readingAttributes.sort((a: any, b: any) => {
            const dateA = new Date(a.date || a.created_at || 0).getTime();
            const dateB = new Date(b.date || b.created_at || 0).getTime();
            return dateB - dateA;
          });
          
          if (sortedByDate.length > 0) {
            readings.current = {
              value: Number(sortedByDate[0].value || sortedByDate[0].attribute_value || 0),
              date: sortedByDate[0].date || sortedByDate[0].created_at || new Date(),
              unit: sortedByDate[0].unit || 'м³',
            };
          }
          
          if (sortedByDate.length > 1) {
            readings.previous = {
              value: Number(sortedByDate[1].value || sortedByDate[1].attribute_value || 0),
              date: sortedByDate[1].date || sortedByDate[1].created_at || new Date(),
              unit: sortedByDate[1].unit || 'м³',
            };
          }
          
          if (readings.current) {
            return readings;
          }
        }
      } else if (data?.current || data?.previous) {
        // Прямой формат с current/previous
        if (data.current) {
          readings.current = {
            value: Number(data.current.value || 0),
            date: data.current.date || new Date(),
            unit: data.current.unit || 'м³',
          };
        }
        if (data.previous) {
          readings.previous = {
            value: Number(data.previous.value || 0),
            date: data.previous.date || new Date(),
            unit: data.previous.unit || 'м³',
          };
        }
        
        if (readings.current) {
          return readings;
        }
      }
    }

    // Fallback: получаем показания из устройства через last_message_type
    console.log(`🔍 Пробуем получить показания из устройства ${deviceId} через last_message_type...`);
    
    const deviceResponse = await fetch(`${beliotApiBaseUrl}/device/metering_device/${deviceId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!deviceResponse.ok) {
      console.warn(`⚠️ Не удалось получить устройство ${deviceId}: ${deviceResponse.status}`);
      return { current: undefined, previous: undefined };
    }

    const deviceData = await deviceResponse.json();
    
    // Извлекаем устройство из ответа
    const device = deviceData?.data?.metering_device || deviceData?.data?.data?.metering_device || deviceData?.metering_device || deviceData?.data || deviceData;
    
    if (!device) {
      console.warn(`⚠️ Устройство ${deviceId} не найдено в ответе`);
      return { current: undefined, previous: undefined };
    }

    const readings: DeviceReadings = {
      current: undefined,
      previous: undefined,
    };

    // Пробуем извлечь показания из last_message_type
    if (device.last_message_type && typeof device.last_message_type === 'object') {
      const msgType = device.last_message_type as any;
      
      // Функция для правильного парсинга даты
      const parseDate = (dateValue: any, fallback: Date = new Date()): Date => {
        if (!dateValue) return fallback;
        
        // Если это уже Date объект
        if (dateValue instanceof Date) {
          return dateValue;
        }
        
        // Если это строка ISO
        if (typeof dateValue === 'string') {
          const parsed = new Date(dateValue);
          // Проверяем, что дата валидна (не 1970 год)
          if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 2000) {
            return parsed;
          }
        }
        
        // Если это timestamp в секундах (Unix timestamp)
        if (typeof dateValue === 'number') {
          // Проверяем, это секунды или миллисекунды
          // Если число меньше 1e12, это скорее всего секунды
          const timestamp = dateValue < 1e12 ? dateValue * 1000 : dateValue;
          const parsed = new Date(timestamp);
          if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 2000) {
            return parsed;
          }
        }
        
        return fallback;
      };
      
      // Текущие показания из in1 (тип сообщения '1')
      if (msgType['1'] && msgType['1'].in1 !== undefined) {
        // Используем realdatetime (timestamp в секундах) или datetime, или updated_at устройства
        // realdatetime - это реальное время получения сообщения
        // datetime - это время показания с устройства
        const timestamp = msgType['1'].realdatetime || 
                         msgType['1'].datetime || 
                         device.updated_at || 
                         device.last_update;
        
        const readingDate = parseDate(
          timestamp,
          new Date() // Fallback на текущую дату
        );
        
        readings.current = {
          value: Number(msgType['1'].in1),
          date: readingDate,
          unit: 'м³',
        };
      }
      
      // Предыдущие показания из in1 (тип сообщения '2') или из in2
      if (msgType['2'] && msgType['2'].in1 !== undefined) {
        const readingDate = parseDate(
          msgType['2'].date || msgType['2'].timestamp,
          new Date()
        );
        
        readings.previous = {
          value: Number(msgType['2'].in1),
          date: readingDate,
          unit: 'м³',
        };
      } else if (msgType['1'] && msgType['1'].in2 !== undefined) {
        const readingDate = parseDate(
          msgType['1'].date || msgType['1'].timestamp || device.updated_at || device.last_update,
          new Date()
        );
        
        readings.previous = {
          value: Number(msgType['1'].in2),
          date: readingDate,
          unit: 'м³',
        };
      }
    }

    // Если показания все еще не найдены, логируем структуру устройства для отладки
    if (!readings.current) {
      console.warn(`⚠️ Показания не найдены для устройства ${deviceId}`);
      console.log('🔍 Структура устройства (первые 500 символов):', JSON.stringify(device, null, 2).substring(0, 500));
    } else {
      // Логируем структуру last_message_type для отладки парсинга даты
      if (device.last_message_type) {
        console.log(`   🔍 last_message_type структура:`, JSON.stringify(device.last_message_type, null, 2).substring(0, 200));
        console.log(`   🔍 device.updated_at:`, device.updated_at);
        console.log(`   🔍 device.last_update:`, device.last_update);
      }
    }

    return readings;
  } catch (error: any) {
    console.error(`❌ Ошибка получения показаний для устройства ${deviceId}:`, error.message);
    // Не бросаем ошибку, возвращаем пустые показания
    return { current: undefined, previous: undefined };
  }
}

/**
 * Синхронизировать показания устройства за период
 * 
 * Получает показания из Beliot API и сохраняет их в Supabase
 */
async function syncDeviceReadingsForPeriod(
  deviceId: string | number,
  startDate: Date,
  endDate: Date,
  token: string
): Promise<{ success: number; errors: number; skipped: number; total: number }> {
  const startTimestamp = Math.floor(startDate.getTime() / 1000);
  const endTimestamp = Math.floor(endDate.getTime() / 1000);
  
  console.log(`   📅 Период: ${startDate.toISOString()} - ${endDate.toISOString()}`);
  
  try {
    // Получаем показания из API
    const messages = await getDeviceMessagesFromApi(deviceId, startTimestamp, endTimestamp, token, 1);
    
    console.log(`   📊 Получено ${messages.length} показаний из API`);
    
    if (messages.length === 0) {
      return { success: 0, errors: 0, skipped: 0, total: 0 };
    }
    
    // Фильтруем по часам
    const readingsToSave = filterByHourStart(messages);
    
    console.log(`   📊 После фильтрации: ${readingsToSave.length} показаний для сохранения`);
    
    let success = 0;
    let errors = 0;
    let skipped = 0;
    
    // Сохраняем каждое показание
    for (const reading of readingsToSave) {
      try {
        const timestamp = reading.timestamp || reading.realdatetime || reading.datetime || 0;
        const value = reading.in1 || 0;
        
        if (!timestamp || value === 0) {
          skipped++;
          continue;
        }
        
        // Создаем дату на начало часа
        const readingDate = new Date(timestamp * 1000);
        readingDate.setMinutes(0, 0, 0);
        readingDate.setSeconds(0, 0);
        readingDate.setMilliseconds(0);
        
        // Сохраняем в Supabase
        const { data: readingId, error } = await supabase.rpc('insert_beliot_reading', {
          p_device_id: String(deviceId),
          p_reading_date: readingDate.toISOString(),
          p_reading_value: Number(value),
          p_unit: 'м³',
          p_reading_type: 'hourly',
          p_source: 'api',
          p_period: 'current',
        });
        
        if (error) {
          errors++;
          console.error(`   ❌ Ошибка сохранения показания за ${readingDate.toISOString()}:`, error.message);
        } else {
          success++;
        }
      } catch (error: any) {
        errors++;
        console.error(`   ❌ Ошибка обработки показания:`, error.message);
      }
    }
    
    return { success, errors, skipped, total: readingsToSave.length };
  } catch (error: any) {
    console.error(`   ❌ Ошибка синхронизации:`, error.message);
    return { success: 0, errors: 1, skipped: 0, total: 0 };
  }
}

/**
 * Собрать показания для всех устройств
 * 
 * НОВАЯ ЛОГИКА: Синхронизирует показания за период (за последние 24 часа или за текущий день)
 * вместо получения только текущего показания. Это позволяет заполнить пропуски даже при задержках.
 */
async function collectReadings(): Promise<void> {
  console.log('🔄 Начало автоматической синхронизации показаний...');
  console.log(`⏰ Время запуска: ${new Date().toISOString()}`);

  try {
    // 1. Получаем токен Beliot API
    const token = await getBeliotToken();

    // 2. Получаем список всех устройств
    const devices = await getCompanyDevices(token);

    if (devices.length === 0) {
      console.log('⚠️ Устройства не найдены');
      return;
    }

    // 3. Определяем период синхронизации
    // Синхронизируем за последние 24 часа (сутки) от текущего момента
    // Это позволяет заполнить пропуски даже при задержках, но не перегружает запросы
    const now = new Date();
    const endDate = new Date(now);
    endDate.setSeconds(59, 999); // До текущего момента (включительно)
    
    // Начало: ровно 24 часа назад от текущего момента
    const startDate = new Date(now);
    startDate.setTime(now.getTime() - 24 * 60 * 60 * 1000); // Минус 24 часа в миллисекундах
    startDate.setSeconds(0, 0);
    startDate.setMilliseconds(0);
    
    console.log(`📅 Период синхронизации: последние 24 часа (сутки)`);
    console.log(`   Начало: ${startDate.toISOString()}`);
    console.log(`   Конец: ${endDate.toISOString()}`);
    console.log(`   Длительность: ${((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60)).toFixed(1)} часов`);
    console.log(`📋 Всего устройств: ${devices.length}`);

    let totalSuccess = 0;
    let totalErrors = 0;
    let totalSkipped = 0;
    let devicesProcessed = 0;

    // 4. Для каждого устройства синхронизируем показания за период
    for (const device of devices) {
      const deviceId = device.device_id || device.id || device._id;
      
      if (!deviceId) {
        console.warn(`⚠️ Пропущено устройство без ID: ${JSON.stringify(device)}`);
        totalSkipped++;
        continue;
      }

      try {
        console.log(`\n📊 Синхронизация устройства: ${deviceId} (${device.name || 'Без названия'})`);
        
        // Синхронизируем показания за период
        const result = await syncDeviceReadingsForPeriod(deviceId, startDate, endDate, token);
        
        totalSuccess += result.success;
        totalErrors += result.errors;
        totalSkipped += result.skipped;
        devicesProcessed++;
        
        console.log(`   ✅ Успешно: ${result.success}, ошибок: ${result.errors}, пропущено: ${result.skipped}`);

        // Небольшая задержка между запросами, чтобы не перегружать API
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error: any) {
        totalErrors++;
        console.error(`❌ Ошибка для устройства ${deviceId}:`, error.message);
      }
    }

    // 5. Выводим итоги
    console.log('\n📊 Итоги синхронизации:');
    console.log(`   ✅ Успешно сохранено показаний: ${totalSuccess}`);
    console.log(`   ❌ Ошибок: ${totalErrors}`);
    console.log(`   ⚠️ Пропущено устройств: ${totalSkipped}`);
    console.log(`   📋 Обработано устройств: ${devicesProcessed}/${devices.length}`);
    
    // Процент успеха
    const successRate = devices.length > 0 
      ? ((devicesProcessed / devices.length) * 100).toFixed(1)
      : '0.0';
    console.log(`   📈 Процент успеха: ${successRate}% (${devicesProcessed}/${devices.length} устройств обработано)`);
    
    if (totalErrors > 0) {
      console.log(`\n⚠️ ВНИМАНИЕ: ${totalErrors} ошибок при синхронизации!`);
      console.log(`   Проверьте логи выше для деталей.`);
    }

    console.log('\n✅ Синхронизация завершена');
  } catch (error: any) {
    console.error('\n❌ Критическая ошибка при сборе показаний:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Запускаем сбор показаний
collectReadings()
  .then(() => {
    console.log('✅ Скрипт завершен успешно');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Скрипт завершен с ошибкой:', error);
    process.exit(1);
  });

