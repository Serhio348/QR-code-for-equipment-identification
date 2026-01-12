/**
 * Скрипт для тестирования показаний конкретного устройства
 * 
 * Получает почасовые показания устройства за указанную дату
 * и выводит статистику
 * 
 * Использование:
 *   npm run test-device-readings -- --device-id 11013 --date 2026-01-10
 * 
 * Или с переменными окружения:
 *   DEVICE_ID=11013 DATE=2026-01-10 npm run test-device-readings
 */

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
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        continue;
      }
      
      const equalIndex = trimmedLine.indexOf('=');
      if (equalIndex === -1) {
        continue;
      }
      
      const key = trimmedLine.substring(0, equalIndex).trim();
      let value = trimmedLine.substring(equalIndex + 1).trim();
      
      if ((value.startsWith('"') && value.endsWith('"')) || 
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch (error: any) {
    // Игнорируем ошибку, если файл не найден
  }
}

loadEnvFile();

// Для Beliot API может потребоваться отключение проверки SSL (только для разработки)
if (process.env.NODE_ENV !== 'production') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const beliotApiBaseUrl = process.env.BELIOT_API_BASE_URL || process.env.VITE_BELIOT_API_BASE_URL || 'https://beliot.by:4443/api';
const beliotLogin = process.env.BELIOT_LOGIN || process.env.VITE_BELIOT_LOGIN || 'energo@brestvodka.by';
const beliotPassword = process.env.BELIOT_PASSWORD || process.env.VITE_BELIOT_PASSWORD;

// Парсим аргументы командной строки
const args = process.argv.slice(2);
const deviceIdArg = args.find(arg => arg.startsWith('--device-id='))?.split('=')[1] || 
                    args[args.indexOf('--device-id') + 1];
const dateArg = args.find(arg => arg.startsWith('--date='))?.split('=')[1] || 
                args[args.indexOf('--date') + 1];

const deviceId = parseInt(deviceIdArg || process.env.DEVICE_ID || '11013', 10);
const dateStr = dateArg || process.env.DATE || '2026-01-10';

// Парсим дату
let targetDate: Date;
try {
  targetDate = new Date(dateStr + 'T00:00:00');
  if (isNaN(targetDate.getTime())) {
    throw new Error('Неверный формат даты');
  }
} catch (error) {
  console.error('❌ Ошибка парсинга даты. Используйте формат YYYY-MM-DD (например, 2026-01-10)');
  process.exit(1);
}

/**
 * Получить токен Beliot API
 */
async function getBeliotToken(): Promise<string> {
  if (!beliotLogin || !beliotPassword) {
    throw new Error('Учетные данные Beliot API не указаны. Установите BELIOT_LOGIN и BELIOT_PASSWORD');
  }

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
      const errorText = await response.text();
      throw new Error(`Ошибка аутентификации: ${response.status} ${response.statusText}\n${errorText}`);
    }

    const data = await response.json();
    
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
 * Получить показания устройства за период
 */
async function getDeviceMessages(
  token: string,
  deviceId: number,
  startDate: number,
  stopDate: number,
  msgType: number = 1
): Promise<any> {
  try {
    console.log(`📡 Запрос показаний устройства ${deviceId}...`);
    console.log(`   Период: ${new Date(startDate * 1000).toLocaleString('ru-RU')} - ${new Date(stopDate * 1000).toLocaleString('ru-RU')}`);
    console.log(`   Тип сообщений: ${msgType} (${msgType === 1 ? 'тариф' : msgType === 5 ? 'профиль мощности' : msgType === 6 ? 'текущее значение' : 'другой'})`);
    
    const response = await fetch(`${beliotApiBaseUrl}/device/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        device_id: deviceId,
        msgType: msgType,
        msgGroup: 0, // все группы
        startDate: startDate,
        stopDate: stopDate,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${response.statusText}\n${errorText}`);
    }

    const data = await response.json();
    return data;
  } catch (error: any) {
    console.error('❌ Ошибка получения показаний:', error.message);
    throw error;
  }
}

/**
 * Форматировать дату для вывода
 */
function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString('ru-RU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Группировать показания по часам
 */
function groupByHour(messages: any[]): Map<number, any[]> {
  const grouped = new Map<number, any[]>();
  
  for (const msg of messages) {
    // Пытаемся извлечь timestamp из различных форматов
    let timestamp: number | null = null;
    
    if (msg.timestamp) {
      timestamp = typeof msg.timestamp === 'number' ? msg.timestamp : parseInt(msg.timestamp, 10);
    } else if (msg.date) {
      const date = new Date(msg.date);
      timestamp = Math.floor(date.getTime() / 1000);
    } else if (msg.created_at) {
      const date = new Date(msg.created_at);
      timestamp = Math.floor(date.getTime() / 1000);
    } else if (msg.time) {
      timestamp = typeof msg.time === 'number' ? msg.time : parseInt(msg.time, 10);
    }
    
    if (timestamp) {
      const date = new Date(timestamp * 1000);
      const hour = date.getHours();
      
      if (!grouped.has(hour)) {
        grouped.set(hour, []);
      }
      grouped.get(hour)!.push({ ...msg, timestamp });
    }
  }
  
  return grouped;
}

/**
 * Вычислить статистику
 */
function calculateStats(messages: any[]): {
  count: number;
  min: number;
  max: number;
  avg: number;
  total_consumption: number;
  first: any;
  last: any;
} {
  if (messages.length === 0) {
    return {
      count: 0,
      min: 0,
      max: 0,
      avg: 0,
      total_consumption: 0,
      first: null,
      last: null,
    };
  }

  // Извлекаем значения
  const values = messages
    .map(msg => {
      const val = msg.value || msg.reading_value || msg.data?.value || msg.data?.reading_value || 0;
      return typeof val === 'number' ? val : parseFloat(val) || 0;
    })
    .filter(v => !isNaN(v) && v >= 0);

  if (values.length === 0) {
    return {
      count: messages.length,
      min: 0,
      max: 0,
      avg: 0,
      total_consumption: 0,
      first: messages[0],
      last: messages[messages.length - 1],
    };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const total_consumption = sorted.length > 1 ? sorted[sorted.length - 1] - sorted[0] : 0;

  return {
    count: values.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg,
    total_consumption,
    first: messages[0],
    last: messages[messages.length - 1],
  };
}

/**
 * Основная функция
 */
async function main() {
  console.log('🧪 Тестирование показаний устройства\n');
  console.log(`📱 Устройство ID: ${deviceId}`);
  console.log(`📅 Дата: ${dateStr}\n`);

  if (!beliotPassword) {
    console.error('❌ BELIOT_PASSWORD не настроен!');
    console.error('Установите переменную окружения BELIOT_PASSWORD или добавьте в .env.local');
    process.exit(1);
  }

  try {
    // Получаем токен
    const token = await getBeliotToken();

    // Вычисляем период (весь день)
    const startDate = Math.floor(new Date(targetDate).setHours(0, 0, 0, 0) / 1000);
    const endDate = Math.floor(new Date(targetDate).setHours(23, 59, 59, 999) / 1000);

    console.log(`\n📊 Получение показаний за ${dateStr}...\n`);

    // Получаем показания (тариф)
    const tariffData = await getDeviceMessages(token, deviceId, startDate, endDate, 1);
    
    // Извлекаем сообщения из ответа
    const messages = tariffData?.data?.messages || 
                     tariffData?.messages || 
                     tariffData?.data || 
                     (Array.isArray(tariffData) ? tariffData : []);

    console.log(`✅ Получено сообщений: ${messages.length}\n`);

    if (messages.length === 0) {
      console.log('⚠️ Показания за указанную дату не найдены');
      console.log('\nВозможные причины:');
      console.log('  - Устройство не передавало данные в этот день');
      console.log('  - Неверный ID устройства');
      console.log('  - Данные еще не загружены в систему');
      return;
    }

    // Группируем по часам
    const hourlyGrouped = groupByHour(messages);

    // Выводим почасовую статистику
    console.log('📈 Почасовая статистика показаний:\n');
    console.log('Час | Количество | Мин. | Макс. | Среднее | Потребление');
    console.log('----|------------|------|-------|---------|------------');

    const hourlyStats: Array<{ hour: number; stats: any }> = [];

    for (let hour = 0; hour < 24; hour++) {
      const hourMessages = hourlyGrouped.get(hour) || [];
      const stats = calculateStats(hourMessages);
      
      hourlyStats.push({ hour, stats });

      if (stats.count > 0) {
        console.log(
          `${hour.toString().padStart(4)} | ${stats.count.toString().padStart(10)} | ` +
          `${stats.min.toFixed(2).padStart(5)} | ${stats.max.toFixed(2).padStart(5)} | ` +
          `${stats.avg.toFixed(2).padStart(7)} | ${stats.total_consumption.toFixed(2).padStart(10)}`
        );
      } else {
        console.log(`${hour.toString().padStart(4)} | ${'нет данных'.padStart(10)} | ${'-'.padStart(5)} | ${'-'.padStart(5)} | ${'-'.padStart(7)} | ${'-'.padStart(10)}`);
      }
    }

    // Общая статистика за день
    const overallStats = calculateStats(messages);
    console.log('\n📊 Общая статистика за день:');
    console.log(`   Количество показаний: ${overallStats.count}`);
    console.log(`   Минимальное значение: ${overallStats.min.toFixed(2)}`);
    console.log(`   Максимальное значение: ${overallStats.max.toFixed(2)}`);
    console.log(`   Среднее значение: ${overallStats.avg.toFixed(2)}`);
    console.log(`   Общее потребление: ${overallStats.total_consumption.toFixed(2)}`);

    if (overallStats.first) {
      console.log(`\n   Первое показание: ${formatDate(overallStats.first.timestamp || 0)} - ${(overallStats.first.value || overallStats.first.reading_value || 0).toFixed(2)}`);
    }
    if (overallStats.last) {
      console.log(`   Последнее показание: ${formatDate(overallStats.last.timestamp || 0)} - ${(overallStats.last.value || overallStats.last.reading_value || 0).toFixed(2)}`);
    }

    // Выводим детали первых нескольких сообщений
    if (messages.length > 0) {
      console.log('\n📋 Примеры сообщений (первые 5):');
      messages.slice(0, 5).forEach((msg, index) => {
        const timestamp = msg.timestamp || (msg.date ? Math.floor(new Date(msg.date).getTime() / 1000) : 0);
        const value = msg.value || msg.reading_value || msg.data?.value || 0;
        console.log(`   ${index + 1}. ${formatDate(timestamp)} - Значение: ${value}`);
      });
    }

    console.log('\n✅ Тестирование завершено');

  } catch (error: any) {
    console.error('\n❌ Ошибка:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Запуск
main();
