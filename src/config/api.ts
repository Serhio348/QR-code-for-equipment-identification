/**
 * Конфигурация API endpoints
 * 
 * После развертывания Google Apps Script веб-приложений,
 * скопируйте URL сюда
 */

export const API_CONFIG = {
  /**
   * URL веб-приложения Google Apps Script для базы данных оборудования
   * 
   * Получить после развертывания:
   * 1. Откройте backend/equipment-db/Code.gs в Google Apps Script
   * 2. Разверните как веб-приложение
   * 3. Скопируйте URL веб-приложения
   * 4. Вставьте сюда
   * 
   * Пример: 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec'
   */
  EQUIPMENT_API_URL: import.meta.env.VITE_EQUIPMENT_API_URL || 'https://script.google.com/macros/s/AKfycbxJ4B_eXLuuwm8bgpIeWoa0qAaYbHdEDImwImyuovYtjZJuaaiPkHEhNVEHf_IP7E6UHg/exec',

  /**
   * URL веб-приложения для журнала обслуживания (существующий)
   * 
   * Если у вас уже есть URL для журнала обслуживания, вставьте его сюда
   */
  MAINTENANCE_API_URL: 'https://script.google.com/macros/s/AKfycbyt7M8596y4rn9IDihwRu73fzdXV6MpkqmAI0D9lNrW7AObWPyoOKsk1YmxX_6xAsZ_lw/exec',

  /**
   * Beliot API конфигурация
   * 
   * API для работы с оборудованием через beliot.by
   * Swagger документация: https://beliot.by:4443/api/documentation
   * 
   * Примечание: API может быть доступен только из внутренней сети или через VPN
   */
  BELIOT_API_BASE_URL: import.meta.env.VITE_BELIOT_API_BASE_URL || 'https://beliot.by:4443/api',
  BELIOT_API_KEY: import.meta.env.VITE_BELIOT_API_KEY || '',
  
  /**
   * Учетные данные для Beliot API
   * 
   * Используются для автоматической аутентификации и получения Bearer token
   */
  BELIOT_LOGIN: import.meta.env.VITE_BELIOT_LOGIN || 'energo@brestvodka.by',
  BELIOT_PASSWORD: import.meta.env.VITE_BELIOT_PASSWORD || 'wSjzy2WJxnj5DPk!',
  
  /**
   * Использовать beliot API вместо Google Apps Script
   * 
   * Если true, приложение будет использовать beliot API как основной источник данных
   */
  USE_BELIOT_API: import.meta.env.VITE_USE_BELIOT_API === 'true' || false,

  /**
   * Таймаут запросов в миллисекундах
   * Если запрос не выполнится за это время, будет ошибка таймаута
   * Google Apps Script может работать медленно при большом количестве данных
   */
  TIMEOUT: 60000, // 60 секунд (увеличено для надежности)
  
  /**
   * Количество попыток повтора при ошибке таймаута
   */
  MAX_RETRIES: 3,
  
  /**
   * Задержка между попытками в миллисекундах
   */
  RETRY_DELAY: 2000, // 2 секунды
};

/**
 * Проверка конфигурации API
 * 
 * Проверяет, что URL API настроены
 * 
 * @returns {boolean} true если конфигурация валидна, false если нет
 */
export function validateApiConfig(): boolean {
  if (!API_CONFIG.EQUIPMENT_API_URL) {
    console.warn('⚠️ EQUIPMENT_API_URL не настроен. Установите URL в src/config/api.ts');
    return false;
  }
  return true;
}

