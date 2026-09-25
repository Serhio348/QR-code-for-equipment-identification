/**
 * Utils.gs
 * 
 * Утилитарные функции для работы с данными
 * 
 * Этот модуль содержит вспомогательные функции, которые используются
 * в различных частях приложения для форматирования, генерации ID и т.д.
 * 
 * Все функции работают независимо от Google Sheets и могут быть использованы
 * в любом контексте приложения.
 */

// ============================================================================
// ФУНКЦИИ ФОРМАТИРОВАНИЯ
// ============================================================================

/**
 * Форматирование даты в формат YYYY-MM-DD
 * 
 * Преобразует дату из различных форматов (Date объект, строка, число)
 * в единый формат YYYY-MM-DD для использования в API
 * 
 * @param {*} dateValue - Дата в любом формате (Date, строка, число)
 * @returns {string} Дата в формате YYYY-MM-DD или пустая строка, если дата невалидна
 * 
 * Примеры:
 * formatDate(new Date(2024, 0, 15)) -> "2024-01-15"
 * formatDate("2024-01-15") -> "2024-01-15"
 * formatDate(null) -> ""
 */
function formatDate(dateValue) {
  // Обрабатываем все случаи пустых значений
  // null, undefined, пустая строка, 0, false - все вернет пустую строку
  if (!dateValue || dateValue === '' || dateValue === null || dateValue === undefined) {
    return '';
  }
  
  try {
    // Если значение уже в формате YYYY-MM-DD, возвращаем как есть
    if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      return dateValue;
    }
    
    // Если это объект Date (из Google Sheets), используем его напрямую
    let date;
    if (dateValue instanceof Date) {
      date = dateValue;
      Logger.log('  - Это объект Date из Google Sheets');
      Logger.log('  - date.toString(): ' + date.toString());
      Logger.log('  - date.toISOString(): ' + date.toISOString());
      Logger.log('  - date.getFullYear(): ' + date.getFullYear());
      Logger.log('  - date.getMonth(): ' + date.getMonth());
      Logger.log('  - date.getDate(): ' + date.getDate());
    } else {
      // Создаем объект Date из переданного значения
      date = new Date(dateValue);
      Logger.log('  - Создан объект Date из: ' + dateValue);
      Logger.log('  - date.toString(): ' + date.toString());
    }
    
    // Проверяем, что дата валидна (не Invalid Date)
    if (isNaN(date.getTime())) {
      Logger.log('  - ❌ Невалидная дата');
      return '';
    }
    
    // ВАЖНО: Используем локальные компоненты даты (getFullYear, getMonth, getDate)
    // вместо UTC компонентов, чтобы избежать проблем с часовыми поясами
    // Google Sheets хранит даты в локальном времени, поэтому мы должны использовать
    // локальные компоненты для форматирования
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // месяцы начинаются с 0
    const day = String(date.getDate()).padStart(2, '0');
    
    const result = year + '-' + month + '-' + day;
    Logger.log('  - ✅ Результат форматирования: ' + result);
    return result;
  } catch (e) {
    // При любой ошибке возвращаем пустую строку
    // Это безопасно - пустая дата не вызовет проблем в приложении
    Logger.log('Ошибка форматирования даты: ' + e + ', значение: ' + dateValue);
    return '';
  }
}

// ============================================================================
// ФУНКЦИИ ГЕНЕРАЦИИ ID
// ============================================================================

/**
 * Генерация уникального ID (UUID)
 * 
 * Использует встроенную функцию Google Apps Script для генерации UUID
 * UUID гарантирует уникальность идентификатора
 * 
 * @returns {string} UUID в формате "550e8400-e29b-41d4-a716-446655440000"
 * 
 * Пример:
 * generateId() -> "550e8400-e29b-41d4-a716-446655440000"
 */
function generateId() {
  // Utilities.getUuid() генерирует UUID версии 4
  return Utilities.getUuid();
}

// ============================================================================
// SEC-02: защита мутаций shared secret
// ============================================================================

/**
 * Проверяет apiSecret для мутирующих action.
 * Если Script Property API_SECRET не задан — проверка пропускается (переходный режим).
 * Если задан — без совпадающего data.apiSecret мутация отклоняется.
 *
 * @param {string} action
 * @param {Object} data
 * @returns {*} createErrorResponse или null
 */
function assertMutationApiSecret(action, data) {
  var mutatingActions = {
    'add': true,
    'update': true,
    'delete': true,
    'createFolder': true,
    'createDocument': true,
    'addMaintenanceEntry': true,
    'updateMaintenanceEntry': true,
    'deleteMaintenanceEntry': true,
    'uploadMaintenancePhoto': true,
    'uploadMaintenanceDocument': true,
    'attachFilesToEntry': true,
    'ensureDriveFolderPath': true,
    'uploadPhotosToFolder': true
  };

  if (!mutatingActions[action]) {
    return null;
  }

  var expected = '';
  try {
    expected = PropertiesService.getScriptProperties().getProperty('API_SECRET') || '';
  } catch (propError) {
    Logger.log('⚠️ Не удалось прочитать API_SECRET: ' + propError);
    return null;
  }

  if (!expected) {
    Logger.log('⚠️ API_SECRET не задан в Script Properties — мутация без shared secret (переходный режим)');
    return null;
  }

  var provided = '';
  if (data && typeof data === 'object') {
    provided = String(data.apiSecret || data.api_secret || '');
  }

  if (!provided || provided !== expected) {
    Logger.log('❌ Мутация "' + action + '" отклонена: неверный или отсутствующий apiSecret');
    return createErrorResponse('Unauthorized: требуется apiSecret от доверенного backend');
  }

  return null;
}

// ============================================================================
// SEC-08: безопасное логирование (без паролей / токенов / тел документов)
// ============================================================================

/**
 * Ключи, значения которых нельзя писать в Logger (сравнение без регистра/_/-).
 */
function isSensitiveLogKey_(key) {
  var normalized = String(key || '').toLowerCase().replace(/[_-]/g, '');
  var blocked = {
    password: true,
    currentpassword: true,
    newpassword: true,
    confirmpassword: true,
    passwordhash: true,
    token: true,
    accesstoken: true,
    refreshtoken: true,
    bearertoken: true,
    authorization: true,
    authtoken: true,
    apisecret: true,
    secret: true,
    cookie: true,
    cookies: true,
    session: true,
    content: true,
    filecontent: true,
    filedata: true,
    base64: true,
    photobase64: true,
    rawbody: true,
    body: true
  };
  if (blocked[normalized]) {
    return true;
  }
  // Частичные совпадения: *password*, *token*, *secret*, *base64*
  if (
    normalized.indexOf('password') !== -1 ||
    normalized.indexOf('token') !== -1 ||
    normalized.indexOf('secret') !== -1 ||
    normalized.indexOf('base64') !== -1
  ) {
    return true;
  }
  return false;
}

/**
 * Рекурсивно маскирует чувствительные поля для логов.
 * @param {*} value
 * @param {number=} depth
 * @returns {*}
 */
function sanitizeForLog(value, depth) {
  var d = typeof depth === 'number' ? depth : 0;
  if (d > 6) {
    return '[MaxDepth]';
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    // Длинные строки в логах не нужны (документы / base64)
    if (value.length > 120) {
      return '[redacted ' + value.length + ' chars]';
    }
    return value;
  }
  if (typeof value !== 'object') {
    return value;
  }
  if (Object.prototype.toString.call(value) === '[object Array]') {
    var arr = [];
    var max = Math.min(value.length, 20);
    for (var i = 0; i < max; i++) {
      arr.push(sanitizeForLog(value[i], d + 1));
    }
    if (value.length > max) {
      arr.push('[+' + (value.length - max) + ' items]');
    }
    return arr;
  }
  var out = {};
  for (var key in value) {
    if (!value.hasOwnProperty(key)) {
      continue;
    }
    if (isSensitiveLogKey_(key)) {
      var raw = value[key];
      var len = raw === null || raw === undefined ? 0 : String(raw).length;
      out[key] = '***';
      if (len > 0) {
        out[key + '_len'] = len;
      }
    } else {
      out[key] = sanitizeForLog(value[key], d + 1);
    }
  }
  return out;
}

/**
 * Безопасная сериализация объекта для Logger.log.
 * @param {*} value
 * @returns {string}
 */
function safeJsonForLog(value) {
  try {
    return JSON.stringify(sanitizeForLog(value));
  } catch (err) {
    return '[unserializable]';
  }
}

/**
 * Метаданные входящего POST без сырого тела.
 * @param {*} e - event Apps Script
 * @returns {string}
 */
function summarizePostEventForLog(e) {
  if (!e) {
    return safeJsonForLog({ event: null });
  }
  var meta = {
    hasPostData: !!(e.postData),
    contentType: e.postData ? e.postData.type || '' : '',
    bodyLength: e.postData && e.postData.contents ? e.postData.contents.length : 0,
    parameterKeys: e.parameter ? Object.keys(e.parameter) : []
  };
  return safeJsonForLog(meta);
}

