/**
 * UserManagement.gs
 * 
 * Функции для управления пользователями и аутентификацией
 * 
 * Этот модуль содержит функции для:
 * - Работы с листами "Пользователи" и "История входов"
 * - Хеширования и проверки паролей
 * - Регистрации и входа пользователей
 * - Управления администраторами
 * - Проверки сессий и таймаутов
 * 
 * Все функции работают с таблицей, к которой привязан проект Google Apps Script
 * через SpreadsheetApp.getActiveSpreadsheet()
 * 
 * Зависимости:
 * - Utils.gs (generateId, formatDate)
 * - ResponseHelpers.gs (createJsonResponse, createErrorResponse)
 * - DriveOperations.gs (для проверки прав администратора через Google Drive)
 */

// ============================================================================
// ФУНКЦИИ РАБОТЫ С ЛИСТАМИ
// ============================================================================

/**
 * Получить лист "Пользователи" из текущей таблицы
 * 
 * Если лист не существует, создает его автоматически с заголовками
 * и форматированием
 * 
 * @returns {Sheet} Объект листа Google Sheets
 * 
 * Структура создаваемого листа:
 * - Заголовки в первой строке:
 *   * ID (UUID)
 *   * Email (уникальный)
 *   * Имя
 *   * Пароль (хеш пароля)
 *   * Роль (admin/user)
 *   * Дата создания
 *   * Последний вход
 *   * Дата последней активности
 * - Заголовки отформатированы (жирный шрифт, синий фон, белый текст)
 * - Первая строка заморожена
 */
function getUsersSheet() {
  const sheetName = 'Пользователи';
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(sheetName);
  
  if (!sheet) {
    // Создаем новый лист
    sheet = spreadsheet.insertSheet(sheetName);
    
    // Устанавливаем заголовки
    const headers = [
      'ID',                      // Колонка A
      'Email',                   // Колонка B
      'Имя',                     // Колонка C
      'Пароль',                  // Колонка D (хеш пароля)
      'Роль',                    // Колонка E (admin/user)
      'Дата создания',           // Колонка F
      'Последний вход',          // Колонка G
      'Дата последней активности' // Колонка H
    ];
    
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    
    // Форматирование заголовков
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#4285f4');
    headerRange.setFontColor('#ffffff');
    
    // Замораживаем первую строку
    sheet.setFrozenRows(1);
    
    // Устанавливаем ширину колонок
    sheet.setColumnWidth(1, 250); // ID
    sheet.setColumnWidth(2, 200); // Email
    sheet.setColumnWidth(3, 150); // Имя
    sheet.setColumnWidth(4, 300); // Пароль (хеш)
    sheet.setColumnWidth(5, 100); // Роль
    sheet.setColumnWidth(6, 150); // Дата создания
    sheet.setColumnWidth(7, 150); // Последний вход
    sheet.setColumnWidth(8, 180); // Дата последней активности
    
    Logger.log('✅ Создан лист "Пользователи" с заголовками');
  }
  
  return sheet;
}

/**
 * Получить лист "История входов" из текущей таблицы
 * 
 * Если лист не существует, создает его автоматически с заголовками
 * и форматированием
 * 
 * @returns {Sheet} Объект листа Google Sheets
 * 
 * Структура создаваемого листа:
 * - Заголовки в первой строке:
 *   * ID записи (UUID)
 *   * Email пользователя
 *   * Дата и время входа
 *   * IP адрес (опционально)
 *   * Успешный вход (true/false)
 *   * Причина неуспешного входа (если есть)
 */
function getLoginHistorySheet() {
  const sheetName = 'История входов';
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(sheetName);
  
  if (!sheet) {
    // Создаем новый лист
    sheet = spreadsheet.insertSheet(sheetName);
    
    // Устанавливаем заголовки
    const headers = [
      'ID',                      // Колонка A
      'Email',                   // Колонка B
      'Дата и время входа',      // Колонка C
      'IP адрес',                // Колонка D (опционально)
      'Успешный вход',           // Колонка E (true/false)
      'Причина неуспешного входа' // Колонка F (если success = false)
    ];
    
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    
    // Форматирование заголовков
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#4285f4');
    headerRange.setFontColor('#ffffff');
    
    // Замораживаем первую строку
    sheet.setFrozenRows(1);
    
    // Устанавливаем ширину колонок
    sheet.setColumnWidth(1, 250); // ID
    sheet.setColumnWidth(2, 200); // Email
    sheet.setColumnWidth(3, 180); // Дата и время входа
    sheet.setColumnWidth(4, 150); // IP адрес
    sheet.setColumnWidth(5, 120); // Успешный вход
    sheet.setColumnWidth(6, 250); // Причина неуспешного входа
    
    Logger.log('✅ Создан лист "История входов" с заголовками');
  }
  
  return sheet;
}

/**
 * Получить лист "Администраторы" из текущей таблицы
 * 
 * Если лист не существует, создает его автоматически с заголовками
 * и форматированием
 * 
 * Этот лист используется для резервного списка администраторов,
 * если проверка через Google Drive не сработала
 * 
 * @returns {Sheet} Объект листа Google Sheets
 * 
 * Структура создаваемого листа:
 * - Заголовки в первой строке:
 *   * Email (уникальный)
 *   * Дата добавления
 *   * Добавлен вручную (true/false)
 *   * Приоритет (основной/резервный)
 *   * Примечание
 */
function getAdminsSheet() {
  const sheetName = 'Администраторы';
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(sheetName);
  
  if (!sheet) {
    // Создаем новый лист
    sheet = spreadsheet.insertSheet(sheetName);
    
    // Устанавливаем заголовки
    const headers = [
      'Email',              // Колонка A
      'Дата добавления',    // Колонка B
      'Добавлен вручную',   // Колонка C (true/false)
      'Приоритет',          // Колонка D (primary/backup)
      'Примечание'          // Колонка E
    ];
    
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    
    // Форматирование заголовков
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#4285f4');
    headerRange.setFontColor('#ffffff');
    
    // Замораживаем первую строку
    sheet.setFrozenRows(1);
    
    // Устанавливаем ширину колонок
    sheet.setColumnWidth(1, 200); // Email
    sheet.setColumnWidth(2, 150); // Дата добавления
    sheet.setColumnWidth(3, 130); // Добавлен вручную
    sheet.setColumnWidth(4, 120); // Приоритет
    sheet.setColumnWidth(5, 250); // Примечание
    
    Logger.log('✅ Создан лист "Администраторы" с заголовками');
  }
  
  return sheet;
}

// ============================================================================
// ФУНКЦИИ ХЕШИРОВАНИЯ И ПРОВЕРКИ ПАРОЛЕЙ
// ============================================================================

/**
 * Хеширование пароля
 * 
 * Использует SHA-256 для создания хеша пароля
 * В Google Apps Script используется Utilities.computeDigest()
 * 
 * @param {string} password - Пароль в открытом виде
 * @returns {string} Хеш пароля в виде hex строки
 * 
 * Пример:
 * hashPassword("mypassword123") -> "a1b2c3d4e5f6..."
 */
function hashPassword(password) {
  if (!password || typeof password !== 'string') {
    throw new Error('Пароль должен быть непустой строкой');
  }
  
  // Используем SHA-256 для хеширования
  // Utilities.computeDigest возвращает массив байтов
  const hashBytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    password,
    Utilities.Charset.UTF_8
  );
  
  // Преобразуем массив байтов в hex строку
  const hashHex = hashBytes.map(function(byte) {
    // Преобразуем байт (-128 до 127) в беззнаковый байт (0 до 255)
    const unsignedByte = byte < 0 ? byte + 256 : byte;
    // Преобразуем в hex с ведущим нулем, если нужно
    return ('0' + unsignedByte.toString(16)).slice(-2);
  }).join('');
  
  return hashHex;
}

/**
 * Проверка пароля
 * 
 * Сравнивает хеш введенного пароля с сохраненным хешем
 * 
 * @param {string} password - Пароль в открытом виде
 * @param {string} passwordHash - Сохраненный хеш пароля
 * @returns {boolean} true если пароль совпадает, false если нет
 * 
 * Пример:
 * verifyPassword("mypassword123", "a1b2c3d4e5f6...") -> true/false
 */
function verifyPassword(password, passwordHash) {
  if (!password || !passwordHash) {
    return false;
  }
  
  // Хешируем введенный пароль
  const inputHash = hashPassword(password);
  
  // Сравниваем хеши (безопасное сравнение строк)
  return inputHash === passwordHash;
}

// ============================================================================
// ФУНКЦИИ ВАЛИДАЦИИ
// ============================================================================

/**
 * Валидация email
 * 
 * Проверяет формат email адреса
 * 
 * @param {string} email - Email адрес для проверки
 * @returns {boolean} true если email валиден, false если нет
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }
  
  // Простая проверка формата email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Валидация пароля
 * 
 * Проверяет требования к паролю:
 * - Минимальная длина: 6 символов
 * - Максимальная длина: 128 символов
 * 
 * @param {string} password - Пароль для проверки
 * @returns {Object} {valid: boolean, message: string}
 */
function validatePassword(password) {
  if (!password || typeof password !== 'string') {
    return {
      valid: false,
      message: 'Пароль должен быть строкой'
    };
  }
  
  if (password.length < 6) {
    return {
      valid: false,
      message: 'Пароль должен содержать минимум 6 символов'
    };
  }
  
  if (password.length > 128) {
    return {
      valid: false,
      message: 'Пароль не должен превышать 128 символов'
    };
  }
  
  return {
    valid: true,
    message: 'Пароль валиден'
  };
}

// ============================================================================
// ФУНКЦИИ ПОИСКА ПОЛЬЗОВАТЕЛЕЙ
// ============================================================================

/**
 * Получить пользователя по email
 * 
 * Ищет пользователя в таблице "Пользователи" по email
 * 
 * @param {string} email - Email пользователя
 * @returns {Object|null} Объект пользователя или null, если не найден
 * 
 * Структура возвращаемого объекта:
 * {
 *   id: string,
 *   email: string,
 *   name: string,
 *   passwordHash: string,
 *   role: string,
 *   createdAt: string,
 *   lastLoginAt: string,
 *   lastActivityAt: string
 * }
 */
function getUserByEmail(email) {
  if (!email) {
    return null;
  }
  
  const sheet = getUsersSheet();
  const data = sheet.getDataRange().getValues();
  
  if (data.length < 2) {
    return null; // Нет данных (только заголовки)
  }
  
  // Заголовки находятся в первой строке (индекс 0)
  const headers = data[0];
  const emailIndex = headers.indexOf('Email');
  
  if (emailIndex === -1) {
    Logger.log('❌ Колонка "Email" не найдена в листе "Пользователи"');
    return null;
  }
  
  // Ищем пользователя по email (без учета регистра)
  const normalizedEmail = email.trim().toLowerCase();
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rowEmail = row[emailIndex];
    
    if (rowEmail && rowEmail.toString().trim().toLowerCase() === normalizedEmail) {
      // Найден пользователь, формируем объект
      const user = {
        id: row[headers.indexOf('ID')] || '',
        email: row[emailIndex] || '',
        name: row[headers.indexOf('Имя')] || '',
        passwordHash: row[headers.indexOf('Пароль')] || '',
        role: row[headers.indexOf('Роль')] || 'user',
        createdAt: row[headers.indexOf('Дата создания')] || '',
        lastLoginAt: row[headers.indexOf('Последний вход')] || '',
        lastActivityAt: row[headers.indexOf('Дата последней активности')] || ''
      };
      
      return user;
    }
  }
  
  return null; // Пользователь не найден
}

/**
 * Проверить, существует ли пользователь с данным email
 * 
 * @param {string} email - Email для проверки
 * @returns {boolean} true если пользователь существует, false если нет
 */
function userExists(email) {
  return getUserByEmail(email) !== null;
}

// ============================================================================
// ФУНКЦИИ РЕГИСТРАЦИИ И ВХОДА
// ============================================================================

/**
 * Регистрация нового пользователя
 * 
 * Создает новую запись пользователя в таблице "Пользователи"
 * 
 * @param {string} email - Email пользователя
 * @param {string} password - Пароль пользователя (будет захеширован)
 * @param {string} name - Имя пользователя (опционально)
 * @returns {Object} Объект с результатом регистрации
 * 
 * Возвращает:
 * {
 *   success: boolean,
 *   user: Object|null,
 *   message: string
 * }
 */
function registerUser(email, password, name) {
  try {
    // Валидация email
    if (!isValidEmail(email)) {
      return {
        success: false,
        user: null,
        message: 'Неверный формат email адреса'
      };
    }
    
    // Проверка уникальности email
    if (userExists(email)) {
      return {
        success: false,
        user: null,
        message: 'Пользователь с таким email уже существует'
      };
    }
    
    // Валидация пароля
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return {
        success: false,
        user: null,
        message: passwordValidation.message
      };
    }
    
    // Хеширование пароля
    const passwordHash = hashPassword(password);
    
    // Генерация ID
    const userId = generateId();
    
    // Текущая дата и время
    const now = new Date();
    const nowISO = now.toISOString();
    
    // Определение роли (по умолчанию 'user', будет обновлена при первом входе)
    const role = 'user';
    
    // Получаем лист
    const sheet = getUsersSheet();
    
    // Добавляем новую строку
    const newRow = [
      userId,           // ID
      email.trim(),     // Email
      name ? name.trim() : '', // Имя
      passwordHash,     // Пароль (хеш)
      role,             // Роль
      nowISO,           // Дата создания
      '',               // Последний вход (пусто)
      nowISO            // Дата последней активности
    ];
    
    sheet.appendRow(newRow);
    
    Logger.log('✅ Пользователь зарегистрирован: ' + email);
    
    // Возвращаем данные пользователя (без пароля)
    return {
      success: true,
      user: {
        id: userId,
        email: email.trim(),
        name: name ? name.trim() : '',
        role: role,
        createdAt: nowISO,
        lastLoginAt: null,
        lastActivityAt: nowISO
      },
      message: 'Пользователь успешно зарегистрирован'
    };
    
  } catch (error) {
    Logger.log('❌ Ошибка при регистрации пользователя: ' + error.toString());
    return {
      success: false,
      user: null,
      message: 'Ошибка при регистрации: ' + error.toString()
    };
  }
}

/**
 * Вход пользователя
 * 
 * Проверяет email и пароль, обновляет время последнего входа и активности,
 * записывает в историю входов
 * 
 * @param {string} email - Email пользователя
 * @param {string} password - Пароль пользователя
 * @returns {Object} Объект с результатом входа
 * 
 * Возвращает:
 * {
 *   success: boolean,
 *   user: Object|null,
 *   sessionToken: string|null,
 *   expiresAt: string|null,
 *   message: string
 * }
 */
function loginUser(email, password) {
  try {
    // Валидация email
    if (!isValidEmail(email)) {
      addLoginHistory(email, false, 'Неверный формат email');
      return {
        success: false,
        user: null,
        sessionToken: null,
        expiresAt: null,
        message: 'Неверный формат email адреса'
      };
    }
    
    // Получаем пользователя
    const user = getUserByEmail(email);
    
    if (!user) {
      addLoginHistory(email, false, 'Пользователь не найден');
      return {
        success: false,
        user: null,
        sessionToken: null,
        expiresAt: null,
        message: 'Пользователь не найден'
      };
    }
    
    // Проверка пароля
    if (!verifyPassword(password, user.passwordHash)) {
      addLoginHistory(email, false, 'Неверный пароль');
      return {
        success: false,
        user: null,
        sessionToken: null,
        expiresAt: null,
        message: 'Неверный пароль'
      };
    }
    
    // Пароль верный, обновляем данные пользователя
    const now = new Date();
    const nowISO = now.toISOString();
    
    // Обновляем время последнего входа и активности
    updateUserLastActivity(email, nowISO, nowISO);
    
    // Проверяем и обновляем роль (может измениться, если пользователь стал админом)
    const updatedRole = verifyAdminAccess(email);
    
    // Генерация токена сессии (UUID)
    const sessionToken = generateId();
    
    // Время истечения сессии (1 час от текущего времени)
    const expiresAt = new Date(now.getTime() + 3600000); // +1 час в миллисекундах
    
    // Записываем успешный вход в историю
    addLoginHistory(email, true);
    
    Logger.log('✅ Пользователь вошел: ' + email);
    
    // Возвращаем данные пользователя (без пароля)
    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: updatedRole,
        createdAt: user.createdAt,
        lastLoginAt: nowISO,
        lastActivityAt: nowISO
      },
      sessionToken: sessionToken,
      expiresAt: expiresAt.toISOString(),
      message: 'Вход выполнен успешно'
    };
    
  } catch (error) {
    Logger.log('❌ Ошибка при входе пользователя: ' + error.toString());
    addLoginHistory(email, false, 'Ошибка сервера: ' + error.toString());
    return {
      success: false,
      user: null,
      sessionToken: null,
      expiresAt: null,
      message: 'Ошибка при входе: ' + error.toString()
    };
  }
}

// ============================================================================
// ФУНКЦИИ ОБНОВЛЕНИЯ ДАННЫХ ПОЛЬЗОВАТЕЛЯ
// ============================================================================

/**
 * Обновить время последней активности пользователя
 * 
 * @param {string} email - Email пользователя
 * @param {string} lastLoginAt - Дата и время последнего входа (ISO строка)
 * @param {string} lastActivityAt - Дата и время последней активности (ISO строка)
 */
function updateUserLastActivity(email, lastLoginAt, lastActivityAt) {
  const sheet = getUsersSheet();
  const data = sheet.getDataRange().getValues();
  
  if (data.length < 2) {
    return; // Нет данных
  }
  
  const headers = data[0];
  const emailIndex = headers.indexOf('Email');
  const lastLoginIndex = headers.indexOf('Последний вход');
  const lastActivityIndex = headers.indexOf('Дата последней активности');
  
  if (emailIndex === -1 || lastLoginIndex === -1 || lastActivityIndex === -1) {
    Logger.log('❌ Не найдены необходимые колонки в листе "Пользователи"');
    return;
  }
  
  const normalizedEmail = email.trim().toLowerCase();
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rowEmail = row[emailIndex];
    
    if (rowEmail && rowEmail.toString().trim().toLowerCase() === normalizedEmail) {
      // Найдена строка пользователя, обновляем значения
      sheet.getRange(i + 1, lastLoginIndex + 1).setValue(lastLoginAt);
      sheet.getRange(i + 1, lastActivityIndex + 1).setValue(lastActivityAt);
      return;
    }
  }
}

/**
 * Обновить роль пользователя
 * 
 * @param {string} email - Email пользователя
 * @param {string} role - Новая роль (admin/user)
 */
function updateUserRole(email, role) {
  const sheet = getUsersSheet();
  const data = sheet.getDataRange().getValues();
  
  if (data.length < 2) {
    return; // Нет данных
  }
  
  const headers = data[0];
  const emailIndex = headers.indexOf('Email');
  const roleIndex = headers.indexOf('Роль');
  
  if (emailIndex === -1 || roleIndex === -1) {
    Logger.log('❌ Не найдены необходимые колонки в листе "Пользователи"');
    return;
  }
  
  const normalizedEmail = email.trim().toLowerCase();
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rowEmail = row[emailIndex];
    
    if (rowEmail && rowEmail.toString().trim().toLowerCase() === normalizedEmail) {
      // Найдена строка пользователя, обновляем роль
      sheet.getRange(i + 1, roleIndex + 1).setValue(role);
      return;
    }
  }
}

// ============================================================================
// ФУНКЦИИ ИСТОРИИ ВХОДОВ
// ============================================================================

/**
 * Добавить запись в историю входов
 * 
 * @param {string} email - Email пользователя
 * @param {boolean} success - Успешный вход (true) или неуспешный (false)
 * @param {string} failureReason - Причина неуспешного входа (если success = false)
 * @param {string} ipAddress - IP адрес (опционально)
 */
function addLoginHistory(email, success, failureReason, ipAddress) {
  try {
    const sheet = getLoginHistorySheet();
    const now = new Date();
    const nowISO = now.toISOString();
    
    const entryId = generateId();
    
    const newRow = [
      entryId,                    // ID
      email || '',                // Email
      nowISO,                     // Дата и время входа
      ipAddress || '',            // IP адрес
      success ? 'true' : 'false', // Успешный вход
      failureReason || ''         // Причина неуспешного входа
    ];
    
    sheet.appendRow(newRow);
    
    Logger.log('✅ Запись добавлена в историю входов: ' + email + ', успех: ' + success);
    
  } catch (error) {
    Logger.log('❌ Ошибка при добавлении записи в историю входов: ' + error.toString());
  }
}

/**
 * Получить историю входов пользователя
 * 
 * @param {string} email - Email пользователя (опционально, если не указан - все записи)
 * @param {number} limit - Максимальное количество записей (по умолчанию 100)
 * @returns {Array} Массив записей истории входов
 */
function getLoginHistory(email, limit) {
  const sheet = getLoginHistorySheet();
  const data = sheet.getDataRange().getValues();
  
  if (data.length < 2) {
    return []; // Нет данных
  }
  
  const headers = data[0];
  const emailIndex = headers.indexOf('Email');
  const loginAtIndex = headers.indexOf('Дата и время входа');
  const ipAddressIndex = headers.indexOf('IP адрес');
  const successIndex = headers.indexOf('Успешный вход');
  const failureReasonIndex = headers.indexOf('Причина неуспешного входа');
  
  const history = [];
  const maxLimit = limit || 100;
  const normalizedEmail = email ? email.trim().toLowerCase() : null;
  
  // Проходим с конца (последние записи первыми)
  for (let i = data.length - 1; i >= 1 && history.length < maxLimit; i--) {
    const row = data[i];
    const rowEmail = row[emailIndex];
    
    // Если указан email, фильтруем по нему
    if (normalizedEmail && rowEmail && rowEmail.toString().trim().toLowerCase() !== normalizedEmail) {
      continue;
    }
    
    const entry = {
      id: row[headers.indexOf('ID')] || '',
      email: rowEmail || '',
      loginAt: row[loginAtIndex] || '',
      ipAddress: row[ipAddressIndex] || '',
      success: row[successIndex] === 'true' || row[successIndex] === true,
      failureReason: row[failureReasonIndex] || ''
    };
    
    history.push(entry);
  }
  
  return history;
}

// ============================================================================
// ФУНКЦИИ ПРОВЕРКИ СЕССИИ И ТАЙМАУТА
// ============================================================================

/**
 * Проверить таймаут сессии пользователя
 * 
 * Проверяет, прошло ли более 1 часа (3600 секунд) с последней активности
 * 
 * @param {string} email - Email пользователя
 * @returns {Object} {active: boolean, remainingTime: number|null, message: string|null}
 */
function checkSessionTimeout(email) {
  const user = getUserByEmail(email);
  
  if (!user) {
    return {
      active: false,
      remainingTime: null,
      message: 'Пользователь не найден'
    };
  }
  
  if (!user.lastActivityAt) {
    return {
      active: false,
      remainingTime: null,
      message: 'Время последней активности не установлено'
    };
  }
  
  const lastActivity = new Date(user.lastActivityAt);
  const now = new Date();
  const diffMs = now.getTime() - lastActivity.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  
  // Таймаут: 1 час = 3600 секунд
  const timeoutSeconds = 3600;
  
  if (diffSeconds > timeoutSeconds) {
    return {
      active: false,
      remainingTime: 0,
      message: 'Сессия истекла (прошло более 1 часа бездействия)'
    };
  }
  
  const remainingSeconds = timeoutSeconds - diffSeconds;
  
  return {
    active: true,
    remainingTime: remainingSeconds * 1000, // В миллисекундах
    message: null
  };
}

/**
 * Обновить время последней активности пользователя
 * 
 * Вызывается при каждом запросе к API от авторизованного пользователя
 * 
 * @param {string} email - Email пользователя
 */
function updateLastActivity(email) {
  const now = new Date();
  const nowISO = now.toISOString();
  
  // Обновляем только время последней активности, не трогая время последнего входа
  const user = getUserByEmail(email);
  if (user) {
    updateUserLastActivity(email, user.lastLoginAt || nowISO, nowISO);
  }
}

// ============================================================================
// ФУНКЦИИ УПРАВЛЕНИЯ АДМИНИСТРАТОРАМИ
// ============================================================================

/**
 * Получить список email владельцев корневой папки Google Drive
 * 
 * Использует Drive API v3 для получения владельцев папки.
 * Если Drive API недоступен, использует DriveApp как fallback.
 * 
 * @param {string} folderId - (Опционально) ID папки для проверки. Если не указан, используется корневая папка.
 * @returns {Array<string>} Массив email адресов владельцев папки
 */
function getDriveFolderOwners(folderId) {
  try {
    const owners = [];
    
    // Если не указан folderId, используем корневую папку
    let folder;
    if (folderId) {
      try {
        folder = DriveApp.getFolderById(folderId);
      } catch (error) {
        Logger.log('⚠️ Не удалось получить папку по ID: ' + folderId);
        Logger.log('   Ошибка: ' + error.toString());
        return owners; // Возвращаем пустой массив
      }
    } else {
      folder = DriveApp.getRootFolder();
    }
    
    // Метод 1: Используем Drive API v3 (более надежный)
    try {
      // Проверяем, включен ли Drive API
      if (typeof Drive !== 'undefined' && Drive.Files) {
        const fileId = folder.getId();
        const file = Drive.Files.get(fileId, {
          fields: 'owners(emailAddress)'
        });
        
        if (file.owners && file.owners.length > 0) {
          for (let i = 0; i < file.owners.length; i++) {
            const ownerEmail = file.owners[i].emailAddress;
            if (ownerEmail) {
              owners.push(ownerEmail.toLowerCase().trim());
            }
          }
        }
        
        Logger.log('✅ Получены владельцы через Drive API v3: ' + owners.length);
        return owners;
      }
    } catch (driveApiError) {
      Logger.log('⚠️ Drive API v3 недоступен, используем DriveApp: ' + driveApiError.toString());
    }
    
    // Метод 2: Fallback на DriveApp.getOwners()
    try {
      const folderOwners = folder.getOwners();
      while (folderOwners.hasNext()) {
        const owner = folderOwners.next();
        const ownerEmail = owner.getEmail();
        if (ownerEmail) {
          owners.push(ownerEmail.toLowerCase().trim());
        }
      }
      
      Logger.log('✅ Получены владельцы через DriveApp: ' + owners.length);
      return owners;
    } catch (driveAppError) {
      Logger.log('❌ Ошибка при получении владельцев через DriveApp: ' + driveAppError.toString());
      return owners; // Возвращаем пустой массив
    }
  } catch (error) {
    Logger.log('❌ Критическая ошибка в getDriveFolderOwners: ' + error.toString());
    Logger.log('   Stack: ' + (error.stack || 'нет стека'));
    return []; // Возвращаем пустой массив в случае ошибки
  }
}

/**
 * Получить ID корневой папки Google Drive для проверки прав администратора
 * 
 * Можно настроить конкретную папку для проверки прав администратора.
 * По умолчанию используется корневая папка Google Drive.
 * 
 * @returns {string} ID папки для проверки прав администратора
 */
function getAdminCheckFolderId() {
  // TODO: Можно добавить конфигурацию в листе "Настройки" или использовать переменную
  // Пока используем корневую папку
  try {
    const rootFolder = DriveApp.getRootFolder();
    return rootFolder.getId();
  } catch (error) {
    Logger.log('⚠️ Не удалось получить ID корневой папки: ' + error.toString());
    return null;
  }
}

/**
 * Проверить права администратора для пользователя
 * 
 * Проверяет, является ли пользователь администратором через:
 * 1. Владельцы корневой папки Google Drive (приоритет)
 * 2. Резервный список администраторов в листе "Администраторы"
 * 
 * @param {string} email - Email пользователя
 * @returns {string} 'admin' или 'user'
 */
function verifyAdminAccess(email) {
  if (!email) {
    Logger.log('⚠️ verifyAdminAccess вызвана без email');
    return 'user';
  }
  
  const normalizedEmail = email.trim().toLowerCase();
  Logger.log('🔍 Проверка прав администратора для: ' + normalizedEmail);
  
  // Приоритет 1: Проверка через Google Drive (владельцы папки)
  try {
    const folderId = getAdminCheckFolderId();
    if (folderId) {
      const driveOwners = getDriveFolderOwners(folderId);
      Logger.log('   Владельцы папки Google Drive: ' + driveOwners.length);
      
      if (driveOwners.length > 0) {
        for (let i = 0; i < driveOwners.length; i++) {
          if (driveOwners[i] === normalizedEmail) {
            Logger.log('✅ Найден как владелец Google Drive папки');
            updateUserRole(email, 'admin');
            return 'admin';
          }
        }
      }
    }
  } catch (driveError) {
    Logger.log('⚠️ Ошибка при проверке через Google Drive: ' + driveError.toString());
    // Продолжаем проверку через резервный список
  }
  
  // Приоритет 2: Проверка резервного списка администраторов
  try {
    const sheet = getAdminsSheet();
    const data = sheet.getDataRange().getValues();
    
    if (data.length >= 2) {
      const headers = data[0];
      const emailIndex = headers.indexOf('Email');
      
      if (emailIndex !== -1) {
        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          const rowEmail = row[emailIndex];
          
          if (rowEmail && rowEmail.toString().trim().toLowerCase() === normalizedEmail) {
            Logger.log('✅ Найден в резервном списке администраторов');
            updateUserRole(email, 'admin');
            return 'admin';
          }
        }
      }
    }
  } catch (sheetError) {
    Logger.log('⚠️ Ошибка при проверке резервного списка: ' + sheetError.toString());
  }
  
  // Не найден ни в одном источнике
  Logger.log('❌ Пользователь не является администратором');
  updateUserRole(email, 'user');
  return 'user';
}

/**
 * Добавить администратора в резервный список
 * 
 * @param {string} email - Email администратора
 * @param {string} note - Примечание (опционально)
 * @returns {Object} {success: boolean, message: string}
 */
function addAdminManually(email, note) {
  try {
    if (!isValidEmail(email)) {
      return {
        success: false,
        message: 'Неверный формат email адреса'
      };
    }
    
    const sheet = getAdminsSheet();
    const data = sheet.getDataRange().getValues();
    
    // Проверяем, не существует ли уже такой администратор
    if (data.length >= 2) {
      const headers = data[0];
      const emailIndex = headers.indexOf('Email');
      
      if (emailIndex !== -1) {
        const normalizedEmail = email.trim().toLowerCase();
        
        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          const rowEmail = row[emailIndex];
          
          if (rowEmail && rowEmail.toString().trim().toLowerCase() === normalizedEmail) {
            return {
              success: false,
              message: 'Администратор с таким email уже существует'
            };
          }
        }
      }
    }
    
    // Добавляем нового администратора
    const now = new Date();
    const nowISO = now.toISOString();
    
    const newRow = [
      email.trim(),        // Email
      nowISO,             // Дата добавления
      'true',             // Добавлен вручную
      'backup',           // Приоритет (резервный)
      note || ''          // Примечание
    ];
    
    sheet.appendRow(newRow);
    
    // Обновляем роль пользователя, если он существует
    updateUserRole(email, 'admin');
    
    Logger.log('✅ Администратор добавлен в резервный список: ' + email);
    
    return {
      success: true,
      message: 'Администратор успешно добавлен'
    };
    
  } catch (error) {
    Logger.log('❌ Ошибка при добавлении администратора: ' + error.toString());
    return {
      success: false,
      message: 'Ошибка при добавлении администратора: ' + error.toString()
    };
  }
}

/**
 * Удалить администратора из резервного списка
 * 
 * @param {string} email - Email администратора
 * @returns {Object} {success: boolean, message: string}
 */
function removeAdminManually(email) {
  try {
    const sheet = getAdminsSheet();
    const data = sheet.getDataRange().getValues();
    
    if (data.length < 2) {
      return {
        success: false,
        message: 'Резервный список администраторов пуст'
      };
    }
    
    const headers = data[0];
    const emailIndex = headers.indexOf('Email');
    
    if (emailIndex === -1) {
      return {
        success: false,
        message: 'Колонка "Email" не найдена'
      };
    }
    
    const normalizedEmail = email.trim().toLowerCase();
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const rowEmail = row[emailIndex];
      
      if (rowEmail && rowEmail.toString().trim().toLowerCase() === normalizedEmail) {
        // Удаляем строку (i + 1, так как индексы начинаются с 1, а массив с 0)
        sheet.deleteRow(i + 1);
        
        // Обновляем роль пользователя на 'user', если он существует
        updateUserRole(email, 'user');
        
        Logger.log('✅ Администратор удален из резервного списка: ' + email);
        
        return {
          success: true,
          message: 'Администратор успешно удален'
        };
      }
    }
    
    return {
      success: false,
      message: 'Администратор не найден в резервном списке'
    };
    
  } catch (error) {
    Logger.log('❌ Ошибка при удалении администратора: ' + error.toString());
    return {
      success: false,
      message: 'Ошибка при удалении администратора: ' + error.toString()
    };
  }
}

/**
 * Получить список всех администраторов
 * 
 * Возвращает администраторов из обоих источников:
 * 1. Google Drive (TODO: будет реализовано)
 * 2. Резервный список
 * 
 * @returns {Array} Массив объектов с информацией об администраторах
 */
function getAllAdmins() {
  const admins = [];
  
  // Получаем администраторов из резервного списка
  const sheet = getAdminsSheet();
  const data = sheet.getDataRange().getValues();
  
  if (data.length >= 2) {
    const headers = data[0];
    const emailIndex = headers.indexOf('Email');
    const addedAtIndex = headers.indexOf('Дата добавления');
    const addedManuallyIndex = headers.indexOf('Добавлен вручную');
    const priorityIndex = headers.indexOf('Приоритет');
    const noteIndex = headers.indexOf('Примечание');
    
    if (emailIndex !== -1) {
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const rowEmail = row[emailIndex];
        
        if (rowEmail) {
          admins.push({
            email: rowEmail.toString(),
            addedAt: row[addedAtIndex] || '',
            addedManually: row[addedManuallyIndex] === 'true' || row[addedManuallyIndex] === true,
            priority: row[priorityIndex] || 'backup',
            note: row[noteIndex] || ''
          });
        }
      }
    }
  }
  
  // Добавляем администраторов из Google Drive
  try {
    const folderId = getAdminCheckFolderId();
    if (folderId) {
      const driveAdmins = getDriveFolderOwners(folderId);
      Logger.log('📁 Найдено администраторов из Google Drive: ' + driveAdmins.length);
      
      for (let i = 0; i < driveAdmins.length; i++) {
        const email = driveAdmins[i];
        // Проверяем, не добавлен ли уже этот администратор
        if (!admins.find(function(a) { return a.email.toLowerCase() === email.toLowerCase(); })) {
          admins.push({
            email: email,
            addedAt: '',
            addedManually: false,
            priority: 'primary',
            note: 'Автоматически из Google Drive'
          });
        }
      }
    }
  } catch (driveError) {
    Logger.log('⚠️ Ошибка при получении администраторов из Google Drive: ' + driveError.toString());
  }
  
  return admins;
}

// ============================================================================
// ФУНКЦИЯ СМЕНЫ ПАРОЛЯ
// ============================================================================

/**
 * Смена пароля пользователя
 * 
 * @param {string} email - Email пользователя
 * @param {string} currentPassword - Текущий пароль
 * @param {string} newPassword - Новый пароль
 * @returns {Object} {success: boolean, message: string}
 */
function changePassword(email, currentPassword, newPassword) {
  try {
    // Получаем пользователя
    const user = getUserByEmail(email);
    
    if (!user) {
      return {
        success: false,
        message: 'Пользователь не найден'
      };
    }
    
    // Проверяем текущий пароль
    if (!verifyPassword(currentPassword, user.passwordHash)) {
      return {
        success: false,
        message: 'Неверный текущий пароль'
      };
    }
    
    // Валидация нового пароля
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      return {
        success: false,
        message: passwordValidation.message
      };
    }
    
    // Хешируем новый пароль
    const newPasswordHash = hashPassword(newPassword);
    
    // Обновляем пароль в таблице
    const sheet = getUsersSheet();
    const data = sheet.getDataRange().getValues();
    
    if (data.length < 2) {
      return {
        success: false,
        message: 'Ошибка: таблица пользователей пуста'
      };
    }
    
    const headers = data[0];
    const emailIndex = headers.indexOf('Email');
    const passwordIndex = headers.indexOf('Пароль');
    
    if (emailIndex === -1 || passwordIndex === -1) {
      return {
        success: false,
        message: 'Ошибка: не найдены необходимые колонки'
      };
    }
    
    const normalizedEmail = email.trim().toLowerCase();
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const rowEmail = row[emailIndex];
      
      if (rowEmail && rowEmail.toString().trim().toLowerCase() === normalizedEmail) {
        // Найдена строка пользователя, обновляем пароль
        sheet.getRange(i + 1, passwordIndex + 1).setValue(newPasswordHash);
        
        Logger.log('✅ Пароль изменен для пользователя: ' + email);
        
        return {
          success: true,
          message: 'Пароль успешно изменен'
        };
      }
    }
    
    return {
      success: false,
      message: 'Пользователь не найден'
    };
    
  } catch (error) {
    Logger.log('❌ Ошибка при смене пароля: ' + error.toString());
    return {
      success: false,
      message: 'Ошибка при смене пароля: ' + error.toString()
    };
  }
}

