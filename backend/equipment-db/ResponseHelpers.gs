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
  return ContentService
    .createTextOutput(JSON.stringify({
      success: true,
      data: data
    }))
    .setMimeType(ContentService.MimeType.JSON);
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

