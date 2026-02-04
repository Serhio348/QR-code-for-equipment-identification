/**
 * env.ts
 *
 * Модуль конфигурации - загружает и валидирует переменные окружения.
 * Централизованное место для всех настроек приложения.
 */

// Импортируем dotenv для загрузки .env файла
import dotenv from 'dotenv';

// Импортируем path для работы с путями файлов
import path from 'path';

// Импортируем fileURLToPath для преобразования import.meta.url в путь
import { fileURLToPath } from 'url';

// ============================================
// Определяем __dirname для ES модулей
// ============================================

// В ES модулях нет встроенного __dirname, нужно создать вручную
// import.meta.url - URL текущего файла (file:///path/to/env.ts)
const __filename = fileURLToPath(import.meta.url);

// path.dirname() извлекает директорию из полного пути
const __dirname = path.dirname(__filename);

// ============================================
// Загружаем переменные окружения
// ============================================

// path.resolve() создает абсолютный путь
// __dirname - текущая директория (src/config/)
// '../..' - поднимаемся на 2 уровня вверх (mcp-google-drive-sheets/)
// '.env' - имя файла
const envPath = path.resolve(__dirname, '../..', '.env');

// dotenv.config() читает .env файл и добавляет переменные в process.env
const result = dotenv.config({ path: envPath });

// Проверяем, успешно ли загружен файл
if (result.error) {
  console.warn('⚠️ Файл .env не найден, используются значения по умолчанию');
}

// ============================================
// Экспортируем конфигурацию
// ============================================

/**
 * Объект конфигурации приложения.
 * Все значения берутся из process.env с fallback на значения по умолчанию.
 */
export const config = {
  // ----------------------------------------
  // Google Apps Script API
  // ----------------------------------------

  /**
   * URL Google Apps Script Web App.
   * Используется для CRUD операций с оборудованием.
   * process.env.XXX возвращает string | undefined
   * || '' - если undefined, используем пустую строку
   */
  gasApiUrl: process.env.GAS_EQUIPMENT_API_URL || '',

  /**
   * Таймаут API запросов в миллисекундах.
   * parseInt() преобразует строку в число
   * 10 - десятичная система счисления
   */
  apiTimeout: parseInt(process.env.API_TIMEOUT || '60000', 10),

  /**
   * Максимальное количество повторных попыток.
   */
  apiMaxRetries: parseInt(process.env.API_MAX_RETRIES || '3', 10),

  /**
   * Задержка между повторными попытками.
   */
  apiRetryDelay: parseInt(process.env.API_RETRY_DELAY || '2000', 10),

  // ----------------------------------------
  // Google Service Account
  // ----------------------------------------

  /**
   * Путь к файлу ключей сервисного аккаунта.
   * Относительный путь от корня проекта.
   */
  googleServiceAccountPath: process.env.GOOGLE_SERVICE_ACCOUNT_PATH || './credentials/service-account.json',

  /**
   * ID родительской папки Google Drive.
   * Все папки оборудования создаются внутри этой папки.
   */
  googleDriveParentFolderId: process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID || '',

  // ----------------------------------------
  // Отладка
  // ----------------------------------------

  /**
   * Режим отладки.
   * Преобразуем строку 'true' в boolean true
   */
  debug: process.env.DEBUG === 'true',
} as const;
// as const - делает объект неизменяемым (readonly)

// ============================================
// Валидация обязательных настроек
// ============================================

/**
 * Проверяет наличие обязательных переменных окружения.
 * Вызывается при запуске сервера.
 * Throws Error если отсутствуют критические настройки.
 */
export function validateConfig(): void {
  const errors: string[] = [];

  // Проверяем GAS API URL
  if (!config.gasApiUrl) {
    errors.push('GAS_EQUIPMENT_API_URL не установлен');
  }

  // Если есть ошибки, выбрасываем исключение
  if (errors.length > 0) {
    throw new Error(
      `Ошибки конфигурации:\n${errors.map(e => `  - ${e}`).join('\n')}`
    );
  }

  // Если всё ок, выводим информацию
  if (config.debug) {
    console.log('✅ Конфигурация загружена:');
    console.log(`   GAS API: ${config.gasApiUrl.substring(0, 50)}...`);
    console.log(`   Таймаут: ${config.apiTimeout}ms`);
    console.log(`   Попытки: ${config.apiMaxRetries}`);
  }
}

// ============================================
// Экспорт по умолчанию
// ============================================

// Экспортируем config как default для удобства импорта
// import config from './config/env.js'
export default config;
