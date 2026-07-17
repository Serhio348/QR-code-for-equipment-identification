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
   * 4. Установите переменную окружения VITE_EQUIPMENT_API_URL
   * 
   * Пример: 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec'
   * 
   * ВАЖНО: URL должен быть установлен через переменную окружения VITE_EQUIPMENT_API_URL
   * Не храните URL в коде для безопасности!
   */
  EQUIPMENT_API_URL: import.meta.env.VITE_EQUIPMENT_API_URL || '',

  /**
   * URL веб-приложения для журнала обслуживания (существующий)
   * 
   * Если у вас уже есть URL для журнала обслуживания, вставьте его сюда
   */
  MAINTENANCE_API_URL:
    import.meta.env.VITE_MAINTENANCE_API_URL ||
    import.meta.env.VITE_EQUIPMENT_API_URL ||
    '',

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
  const envUrl = import.meta.env.VITE_EQUIPMENT_API_URL;
  
  console.log('🔍 Проверка конфигурации API:', {
    envUrl: envUrl ? `${envUrl.substring(0, 50)}...` : 'не установлен',
    finalUrl: API_CONFIG.EQUIPMENT_API_URL ? `${API_CONFIG.EQUIPMENT_API_URL.substring(0, 50)}...` : 'не установлен',
    isProduction: import.meta.env.PROD,
    mode: import.meta.env.MODE
  });
  
  if (!API_CONFIG.EQUIPMENT_API_URL) {
    console.error('❌ EQUIPMENT_API_URL не настроен!');
    console.error('   Установите переменную окружения VITE_EQUIPMENT_API_URL');
    console.error('   Локально: создайте файл .env.local с VITE_EQUIPMENT_API_URL=ваш_url');
    console.error('   На Railway: Settings → Variables → VITE_EQUIPMENT_API_URL');
    console.error('   URL должен быть вида: https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec');
    return false;
  }
  
  // Проверка формата URL
  try {
    const url = new URL(API_CONFIG.EQUIPMENT_API_URL);
    if (!url.hostname.includes('script.google.com')) {
      console.warn('⚠️ URL не похож на Google Apps Script URL');
    }
    if (!url.pathname.includes('/exec')) {
      console.warn('⚠️ URL должен заканчиваться на /exec');
    }
  } catch (e) {
    console.error('❌ Некорректный формат URL:', e);
    return false;
  }
  
  return true;
}
