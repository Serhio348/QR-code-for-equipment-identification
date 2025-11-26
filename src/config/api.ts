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
  EQUIPMENT_API_URL: 'https://script.google.com/macros/s/AKfycbxQqzfSaTPt-BCrVzbHY-ngvqh1H8BZI9D9w5HkbosbbelzSxSn6RaFK263H0v0WfuPIQ/exec',

  /**
   * URL веб-приложения для журнала обслуживания (существующий)
   * 
   * Если у вас уже есть URL для журнала обслуживания, вставьте его сюда
   */
  MAINTENANCE_API_URL: 'https://script.google.com/macros/s/AKfycbyt7M8596y4rn9IDihwRu73fzdXV6MpkqmAI0D9lNrW7AObWPyoOKsk1YmxX_6xAsZ_lw/exec',

  /**
   * Таймаут запросов в миллисекундах
   * Если запрос не выполнится за это время, будет ошибка таймаута
   */
  TIMEOUT: 10000, // 10 секунд
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

