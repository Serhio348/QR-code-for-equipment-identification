/**
 * ResponseHelpers.gs
 * 
 * Функции для формирования ответов API
 * 
 * Этот модуль содержит функции для создания стандартизированных
 * JSON ответов для REST API. Все ответы следуют единому формату:
 * - Успешный ответ: { success: true, data: ... }
 * - Ответ с ошибкой: { success: false, error: "..." }
 * 
 * Все функции работают с ContentService для создания HTTP ответов
 * с правильными заголовками и MIME типами.
 */

// ============================================================================
// ФУНКЦИИ ФОРМИРОВАНИЯ ОТВЕТОВ
// ============================================================================

/**
 * Создать JSON ответ с данными
 * 
 * Формирует успешный ответ API в формате JSON
 * 
 * @param {*} data - Данные для возврата (может быть объект, массив и т.д.)
 * @returns {TextOutput} JSON ответ с полями success: true и data
 * 
 * Формат ответа:
 * {
 *   "success": true,
 *   "data": { ... }
 * }
 * 
 * Пример использования:
 * return createJsonResponse({ id: "123", name: "Оборудование" });
 */
function createJsonResponse(data) {
  // Создаем JSON ответ
  // Google Apps Script автоматически устанавливает CORS заголовки при настройке "У кого есть доступ: Все"
  try {
    Logger.log('[createJsonResponse] Получены данные, тип: ' + typeof data);
    Logger.log('[createJsonResponse] Это массив: ' + Array.isArray(data));
    if (Array.isArray(data)) {
      Logger.log('[createJsonResponse] Длина массива: ' + data.length);
    }
    
    const jsonData = {
      success: true,
      data: data
    };
    
    const jsonString = JSON.stringify(jsonData);
    Logger.log('[createJsonResponse] JSON строка создана, длина: ' + jsonString.length);
    Logger.log('[createJsonResponse] Первые 500 символов: ' + jsonString.substring(0, 500));
    
    const response = ContentService
      .createTextOutput(jsonString)
      .setMimeType(ContentService.MimeType.JSON);
    
    Logger.log('[createJsonResponse] Ответ создан успешно');
    return response;
  } catch (error) {
    Logger.log('[createJsonResponse] Ошибка: ' + error.toString());
    Logger.log('[createJsonResponse] Stack: ' + (error.stack || 'нет'));
    throw error;
  }
}

/**
 * Создать JSON ответ с ошибкой
 * 
 * Формирует ответ об ошибке в формате JSON
 * 
 * @param {string} message - Сообщение об ошибке
 * @returns {TextOutput} JSON ответ с полями success: false и error
 * 
 * Формат ответа:
 * {
 *   "success": false,
 *   "error": "Сообщение об ошибке"
 * }
 * 
 * Пример использования:
 * return createErrorResponse("Оборудование не найдено");
 */
function createErrorResponse(message) {
  // Создаем JSON ответ с ошибкой
  // Google Apps Script автоматически устанавливает CORS заголовки при настройке "У кого есть доступ: Все"
  return ContentService
    .createTextOutput(JSON.stringify({
      success: false,
      error: message
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

