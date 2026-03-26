/**
 * Code.gs - Главный файл HTTP обработчиков
 * 
 * Google Apps Script API для базы данных оборудования
 * 
 * Предоставляет REST API для работы с Google Sheets таблицей "Оборудование"
 * 
 * МОДУЛЬНАЯ СТРУКТУРА:
 * Этот файл содержит только HTTP обработчики (doOptions, doGet, doPost) и тестовые функции.
 * Все остальные функции вынесены в отдельные модули для улучшения организации кода:
 * 
 * Модули:
 * 1. Utils.gs - утилиты
 *    - formatDate(dateValue) - форматирование дат
 *    - generateId() - генерация UUID
 * 
 * 2. ResponseHelpers.gs - формирование HTTP ответов
 *    - createJsonResponse(data) - создание JSON ответа
 *    - createErrorResponse(message) - создание ответа с ошибкой
 * 
 * 3. SheetHelpers.gs - работа с листами Google Sheets
 *    - getEquipmentSheet() - получение/создание листа "Оборудование"
 *    - parseRowToEquipment(row, headers) - парсинг строки в объект Equipment
 * 
 * 4. EquipmentQueries.gs - чтение данных об оборудовании
 *    - getAllEquipment() - получить все оборудование
 *    - getEquipmentById(id) - получить оборудование по ID
 *    - getEquipmentByType(type) - получить оборудование по типу
 * 
 * 5. EquipmentMutations.gs - изменение данных об оборудовании
 *    - addEquipment(data) - создание оборудования
 *    - updateEquipment(id, data) - обновление оборудования
 *    - deleteEquipment(id) - удаление оборудования
 * 
 * 6. DriveOperations.gs - операции с Google Drive
 *    - createDriveFolder(equipmentName, parentFolderId) - создание папки
 *    - deleteDriveFolder(folderUrl) - удаление папки
 *    - getFolderFiles(folderUrlOrId) - получение файлов из папки
 *    - extractDriveIdFromUrl(urlOrId) - извлечение ID из URL
 * 
 * 7. MaintenanceLog.gs - работа с журналом обслуживания
 *    - getMaintenanceLogSheet() - получение/создание листа журнала
 *    - getMaintenanceLog(equipmentId, maintenanceSheetId) - получение записей
 *    - _addMaintenanceEntry(equipmentId, entry) - добавление записи
 *    - _updateMaintenanceEntry(entryId, entry) - обновление записи
 *    - _deleteMaintenanceEntry(entryId) - удаление записи
 *    - И вспомогательные функции для синхронизации с индивидуальными файлами журнала
 * 
 * 8. UserManagement.gs - управление пользователями и аутентификацией
 *    - getUsersSheet() - получение/создание листа "Пользователи"
 *    - getLoginHistorySheet() - получение/создание листа "История входов"
 *    - getAdminsSheet() - получение/создание листа "Администраторы"
 *    - hashPassword(password) - хеширование пароля
 *    - verifyPassword(password, passwordHash) - проверка пароля
 *    - registerUser(email, password, name) - регистрация пользователя
 *    - loginUser(email, password) - вход пользователя
 *    - changePassword(email, currentPassword, newPassword) - смена пароля
 *    - getUserByEmail(email) - получение пользователя по email
 *    - verifyAdminAccess(email) - проверка прав администратора
 *    - checkSessionTimeout(email) - проверка таймаута сессии
 *    - updateLastActivity(email) - обновление времени активности
 *    - addLoginHistory(email, success, failureReason) - добавление записи в историю
 *    - getLoginHistory(email, limit) - получение истории входов
 *    - addAdminManually(email, note) - добавление администратора
 *    - removeAdminManually(email) - удаление администратора
 *    - getAllAdmins() - получение всех администраторов
 * 
 * ЗАВИСИМОСТИ МЕЖДУ МОДУЛЯМИ:
 * - SheetHelpers.gs использует Utils.gs (formatDate)
 * - EquipmentQueries.gs использует SheetHelpers.gs
 * - EquipmentMutations.gs использует Utils.gs, SheetHelpers.gs, EquipmentQueries.gs, DriveOperations.gs
 * - MaintenanceLog.gs использует Utils.gs, SheetHelpers.gs, EquipmentQueries.gs, DriveOperations.gs
 * - UserManagement.gs использует Utils.gs (generateId)
 * - DriveOperations.gs использует свои внутренние функции
 * 
 * ПРИМЕЧАНИЕ: Управление участками (workshops) перенесено в Supabase.
 * См. docs/migrations/create-workshops-table.sql для миграции.
 * 
 * Все модули работают с одной таблицей Google Sheets через SpreadsheetApp.getActiveSpreadsheet()
 * 
 * Инструкция по установке:
 * 1. Откройте вашу Google Sheets таблицу "База данных оборудования"
 * 2. Расширения → Apps Script
 * 3. Создайте все файлы модулей (см. MODULAR_SETUP.md)
 * 4. Скопируйте код из каждого файла в соответствующий файл в Google Apps Script
 * 5. Сохраните все файлы (Ctrl+S)
 * 6. Разверните как веб-приложение (см. README.md)
 * 
 * Структура таблицы "Оборудование":
 * Колонка A: ID (уникальный идентификатор)
 * Колонка B: Название
 * Колонка C: Тип
 * Колонка D: Характеристики (JSON строка)
 * Колонка E: Google Drive URL
 * Колонка F: QR Code URL
 * Колонка G: Дата ввода в эксплуатацию
 * Колонка H: Последнее обслуживание
 * Колонка I: Статус (active/inactive/archived)
 * Колонка J: Создано (дата и время)
 * Колонка K: Обновлено (дата и время)
 * Колонка L: Maintenance Sheet ID
 * Колонка M: Maintenance Sheet URL
 */

// ============================================================================
// ОСНОВНЫЕ ФУНКЦИИ ОБРАБОТКИ HTTP ЗАПРОСОВ
// ============================================================================

/**
 * Обработка OPTIONS запросов (CORS preflight)
 * 
 * Браузер отправляет OPTIONS запрос перед POST запросами для проверки CORS
 * Эта функция обрабатывает preflight запросы и возвращает необходимые заголовки
 * 
 * @param {Object} e - объект события
 * @returns {TextOutput} Ответ с CORS заголовками
 */
function doOptions(e) {
  // Обработка CORS preflight запросов
  // Браузер отправляет OPTIONS запрос перед POST запросами для проверки CORS
  // Google Apps Script автоматически устанавливает CORS заголовки при настройке "У кого есть доступ: Все"
  return ContentService
    .createTextOutput('')
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Обработка GET запросов
 * 
 * GET запросы используются для чтения данных из таблицы,
 * а также для некоторых операций аутентификации
 * 
 * Поддерживаемые действия (оборудование):
 * - getAll - получить все оборудование
 * - getById - получить оборудование по ID
 * - getByType - получить оборудование по типу
 * - getFolderFiles - получить список файлов из папки Google Drive
 * - getMaintenanceLog - получить журнал обслуживания для оборудования
 * - addMaintenanceEntry - добавить запись в журнал обслуживания (fallback для no-cors)
 * 
 * Поддерживаемые действия (аутентификация):
 * - verify-admin - проверка прав администратора (email)
 * - get-login-history - получение истории входов (email, limit) - только для админов
 * 
 * @param {Object} e - объект события с параметрами запроса
 * @param {Object} e.parameter - параметры URL запроса
 * @param {string} e.parameter.action - действие для выполнения
 * @param {string} e.parameter.id - ID оборудования (для getById)
 * @param {string} e.parameter.type - тип оборудования (для getByType)
 * @param {string} e.parameter.email - Email пользователя (для действий аутентификации)
 * @param {number} e.parameter.limit - Лимит записей (для get-login-history)
 * 
 * @returns {TextOutput} JSON ответ с данными или ошибкой
 * 
 * Примеры использования:
 * - ?action=getAll - получить все записи оборудования
 * - ?action=getById&id=123 - получить запись с ID 123
 * - ?action=getByType&type=filter - получить все фильтры
 * - ?action=verify-admin&email=user@example.com - проверить права администратора
 * - ?action=get-login-history&email=user@example.com&limit=50 - получить историю входов
 */
function doGet(e) {
  try {
    // Логируем входящий запрос для отладки (самое первое, что должно быть видно)
    Logger.log('📥 ========== doGet ВЫЗВАН ==========');
    
    // Проверяем, что объект события передан
    // Если e равен undefined, создаем пустой объект (может быть при прямом вызове из редактора)
    if (!e) {
      Logger.log('⚠️ Объект события (e) не передан, создаем пустой объект');
      e = {
        parameter: {}
      };
    }
    
    // Проверяем наличие параметров
    if (!e.parameter) {
      Logger.log('⚠️ e.parameter отсутствует, создаем пустой объект');
      e.parameter = {};
    }
    
    // Получаем параметр action из URL
    const action = e.parameter.action;
    
    Logger.log('📥 GET запрос получен');
    Logger.log('  - e: ' + (e ? 'есть' : 'НЕТ'));
    Logger.log('  - e.parameter: ' + (e.parameter ? 'есть' : 'НЕТ'));
    Logger.log('  - action: ' + action);
    Logger.log('  - parameters: ' + JSON.stringify(e.parameter));
    
    // Выполняем действие в зависимости от параметра
    switch(action) {
      case 'getAll':
        // Получить все оборудование из таблицы
        return createJsonResponse(getAllEquipment());
      
      case 'getById':
        // Получить оборудование по уникальному ID
        const id = e.parameter.id;
        if (!id) {
          return createErrorResponse('ID не указан');
        }
        return createJsonResponse(getEquipmentById(id));
      
      case 'getByType':
        // Получить оборудование определенного типа (filter, pump, tank, valve, electrical, ventilation, plumbing, energy_source, industrial, other)
        const type = e.parameter.type;
        if (!type) {
          return createErrorResponse('Тип не указан');
        }
        return createJsonResponse(getEquipmentByType(type));
      
      case 'getFolderFiles':
        // Получить список файлов/папок из папки Google Drive
        Logger.log('📁 Обработка getFolderFiles');
        const folderUrl = e.parameter.folderUrl || e.parameter.folderId;
        const folderMimeType = e.parameter.mimeType || null;
        const folderQuery = e.parameter.query || null;
        Logger.log('  - folderUrl: ' + folderUrl);
        Logger.log('  - mimeType: ' + folderMimeType);
        Logger.log('  - query: ' + folderQuery);
        if (!folderUrl) {
          Logger.log('❌ URL папки не указан');
          return createErrorResponse('URL или ID папки не указан');
        }
        Logger.log('✅ Вызов getFolderFiles');
        const files = getFolderFiles(folderUrl, folderMimeType, folderQuery);
        Logger.log('✅ getFolderFiles вернул ' + files.length + ' элементов');
        return createJsonResponse(files);
      
      case 'getMaintenanceLog':
        // Получить журнал обслуживания для оборудования
        const equipmentId = e.parameter.equipmentId;
        if (!equipmentId) {
          return createErrorResponse('ID оборудования не указан');
        }
        // Поддержка опционального maintenanceSheetId для использования индивидуального файла журнала
        const maintenanceSheetId = e.parameter.maintenanceSheetId || null;
        return createJsonResponse(getMaintenanceLog(equipmentId, maintenanceSheetId));
      
      case 'addMaintenanceEntry':
        // Обработка addMaintenanceEntry через GET (для no-cors запросов)
        // Это fallback для случаев, когда POST не работает из-за CORS
        Logger.log('📝 Обработка addMaintenanceEntry через GET (no-cors fallback)');
        Logger.log('  - e.parameter: ' + JSON.stringify(e.parameter));
        
        const getEquipmentId = e.parameter.equipmentId;
        const getMaintenanceSheetId = e.parameter.maintenanceSheetId || null;
        if (!getEquipmentId) {
          Logger.log('❌ ID оборудования не указан в GET параметрах');
          return createErrorResponse('ID оборудования не указан');
        }
        
        const getEntryData = {
          date: e.parameter.date || '',
          type: e.parameter.type || '',
          description: e.parameter.description || '',
          performedBy: e.parameter.performedBy || '',
          status: e.parameter.status || 'completed'
        };
        
        Logger.log('  - equipmentId: ' + getEquipmentId);
        Logger.log('  - maintenanceSheetId: ' + (getMaintenanceSheetId || 'не указан'));
        Logger.log('  - entryData: ' + JSON.stringify(getEntryData));
        
        if (!getEntryData.date || !getEntryData.type || !getEntryData.description || !getEntryData.performedBy) {
          return createErrorResponse('Не все обязательные поля заполнены');
        }
        
        try {
          const result = _addMaintenanceEntry(getEquipmentId, getEntryData);
          Logger.log('✅ Запись добавлена успешно через GET: ' + JSON.stringify(result));
          return createJsonResponse(result);
        } catch (error) {
          Logger.log('❌ Ошибка в addMaintenanceEntry через GET: ' + error.toString());
          return createErrorResponse('Ошибка при добавлении записи: ' + error.toString());
        }
      
      // ========================================================================
      // ДЕЙСТВИЯ АУТЕНТИФИКАЦИИ И УПРАВЛЕНИЯ ПОЛЬЗОВАТЕЛЯМИ (GET)
      // ========================================================================
      
      case 'verify-admin':
        // Проверка прав администратора через GET
        Logger.log('👑 Обработка verify-admin (GET)');
        const getEmail = e.parameter.email;
        if (!getEmail) {
          return createErrorResponse('Email не указан');
        }
        const getRole = verifyAdminAccess(getEmail);
        return createJsonResponse({
          isAdmin: getRole === 'admin',
          role: getRole,
          email: getEmail
        });
      
      case 'get-login-history':
        // Получение истории входов через GET
        Logger.log('📜 Обработка get-login-history (GET)');
        const historyEmail = e.parameter.email || null; // Опционально, если не указан - все записи
        const historyLimit = e.parameter.limit ? parseInt(e.parameter.limit) : 100;
        // TODO: Добавить проверку прав (только админы могут просматривать историю)
        const history = getLoginHistory(historyEmail, historyLimit);
        return createJsonResponse(history);
      
      case 'getAllUserAccess':
        // Получить все настройки доступа через GET
        Logger.log('🔐 [doGet] Обработка getAllUserAccess (GET)');
        return handleGetAllUserAccess();
      
      case 'getUserAccess':
        // Получить настройки доступа для пользователя через GET
        Logger.log('🔐 [doGet] Обработка getUserAccess (GET)');
        const getUserEmail = e.parameter.email;
        if (!getUserEmail) {
          return createErrorResponse('Email пользователя обязателен');
        }
        return handleGetUserAccess({ email: getUserEmail });

      case 'syncFolderAccess':
        // Синхронизировать доступ к папкам оборудования через GET
        Logger.log('🔄 [doGet] Обработка syncFolderAccess (GET)');
        const syncFolderUrl = e.parameter.folderUrl || null;
        return handleSyncFolderAccess({ folderUrl: syncFolderUrl });

      case 'setAllFoldersPublicLink':
        // Открыть все папки оборудования для просмотра по ссылке (ANYONE_WITH_LINK)
        Logger.log('🔓 [doGet] Обработка setAllFoldersPublicLink');
        return createJsonResponse(setAllFoldersPublicLink());

      // ========================================================================
      // ДЕЙСТВИЯ ДЛЯ СЧЕТЧИКОВ BELIOT (GET)
      // ========================================================================
      
      case 'getBeliotDevicesOverrides':
        // Получить все пользовательские изменения счетчиков Beliot
        Logger.log('📊 Обработка getBeliotDevicesOverrides');
        return createJsonResponse(getBeliotDevicesOverrides());
      
      case 'getBeliotDeviceOverride':
        // Получить изменения для конкретного устройства
        Logger.log('📊 Обработка getBeliotDeviceOverride');
        const overrideDeviceId = e.parameter.deviceId;
        if (!overrideDeviceId) {
          return createErrorResponse('deviceId не указан');
        }
        const override = getBeliotDeviceOverride(overrideDeviceId);
        return createJsonResponse(override);

      case 'getFileContent':
        // Получить содержимое файла (PDF, Google Docs и т.д.)
        Logger.log('📄 Обработка getFileContent');
        const contentFileUrl = e.parameter.fileId || e.parameter.fileUrl;
        if (!contentFileUrl) {
          return createErrorResponse('Не указан fileId или fileUrl');
        }
        return handleGetFileContent({
          fileId: contentFileUrl,
          maxLength: e.parameter.maxLength,
          keepTempFile: e.parameter.keepTempFile
        });

      case 'getMaintenancePhotos':
        // Получить список фото обслуживания для оборудования
        Logger.log('📷 Обработка getMaintenancePhotos');
        const photosEquipmentId = e.parameter.equipmentId;
        if (!photosEquipmentId) {
          return createErrorResponse('ID оборудования не указан');
        }
        try {
          const photosResult = getMaintenancePhotos(photosEquipmentId);
          return createJsonResponse(photosResult);
        } catch (error) {
          Logger.log('❌ Ошибка getMaintenancePhotos: ' + error.toString());
          return createErrorResponse('Ошибка получения фото: ' + error.toString());
        }

      default:
        // Если действие не распознано, возвращаем ошибку
        Logger.log('❌ Неизвестное действие: ' + action);
        Logger.log('  - Доступные действия: getAll, getById, getByType, getFolderFiles, getMaintenanceLog, addMaintenanceEntry, verify-admin, get-login-history, getAllUserAccess, getUserAccess, getBeliotDevicesOverrides, getBeliotDeviceOverride, getFileContent, getMaintenancePhotos');
        return createErrorResponse('Неизвестное действие. Используйте: getAll, getById, getByType, getFolderFiles, getMaintenanceLog, addMaintenanceEntry, verify-admin, get-login-history, getAllUserAccess, getUserAccess, getBeliotDevicesOverrides, getBeliotDeviceOverride, getFileContent, getMaintenancePhotos');
    }
  } catch (error) {
    // Логируем ошибку для отладки
    Logger.log('Ошибка в doGet: ' + error);
    // Возвращаем ошибку пользователю
    return createErrorResponse('Ошибка сервера: ' + error.toString());
  }
}

/**
 * Обработка POST запросов
 * 
 * POST запросы используются для создания, обновления и удаления данных,
 * а также для аутентификации и управления пользователями
 * 
 * Поддерживаемые действия (оборудование):
 * - add - добавить новое оборудование
 * - update - обновить существующее оборудование
 * - delete - удалить оборудование (физическое удаление с удалением папки в Google Drive)
 * - createFolder - создать папку в Google Drive для оборудования
 * - addMaintenanceEntry - добавить запись в журнал обслуживания
 * - updateMaintenanceEntry - обновить запись в журнале обслуживания
 * - deleteMaintenanceEntry - удалить запись из журнала обслуживания
 * 
 * Поддерживаемые действия (аутентификация):
 * - register - регистрация нового пользователя (email, password, name)
 * - login - вход пользователя (email, password)
 * - logout - выход пользователя (email)
 * - change-password - смена пароля (email, currentPassword, newPassword)
 * - check-session - проверка активности сессии (email)
 * - verify-admin - проверка прав администратора (email)
 * - add-admin - добавление администратора в резервный список (email, note) - только для админов
 * - remove-admin - удаление администратора из резервного списка (email) - только для админов
 * 
 * @param {Object} e - объект события с данными запроса
 * @param {string} e.postData.contents - тело запроса в формате JSON или URL-encoded
 * 
 * @returns {TextOutput} JSON ответ с результатом операции
 * 
 * Пример тела запроса для регистрации:
 * {
 *   "action": "register",
 *   "email": "user@example.com",
 *   "password": "password123",
 *   "name": "Иван Иванов"
 * }
 * 
 * Пример тела запроса для входа:
 * {
 *   "action": "login",
 *   "email": "user@example.com",
 *   "password": "password123"
 * }
 */
function doPost(e) {
  try {
    // Логируем входящий запрос для отладки (самое первое, что должно быть видно)
    Logger.log('📨 ========== doPost ВЫЗВАН ==========');
    Logger.log('📨 Получен POST запрос');
    Logger.log('  - Timestamp: ' + new Date().toISOString());
    Logger.log('  - Это HTTP запрос: ' + (typeof e !== 'undefined' && e !== null));
    
    // Проверяем, что объект события передан
    if (!e) {
      Logger.log('❌ Ошибка: объект события (e) не передан в doPost');
      return createErrorResponse('Ошибка: объект события не передан');
    }
    Logger.log('  - e: ' + (e ? 'есть' : 'НЕТ'));
    Logger.log('  - postData: ' + (e.postData ? 'есть' : 'НЕТ'));
    if (e.postData && e.postData.contents) {
      const contentsLength = e.postData.contents.length;
      Logger.log('  - postData.contents length: ' + contentsLength + ' символов');
      // Для больших данных показываем только первые и последние 200 символов
      if (contentsLength > 400) {
        Logger.log('  - postData.contents (первые 200): ' + e.postData.contents.substring(0, 200));
        Logger.log('  - postData.contents (последние 200): ' + e.postData.contents.substring(contentsLength - 200));
      } else {
        Logger.log('  - postData.contents: ' + e.postData.contents);
      }
    } else {
      Logger.log('  - postData.contents: НЕТ ДАННЫХ');
    }
    Logger.log('  - postData.type: ' + (e.postData ? e.postData.type : 'НЕТ'));
    Logger.log('  - parameters count: ' + (e.parameter ? Object.keys(e.parameter).length : 0));
    if (e.parameter && Object.keys(e.parameter).length > 0) {
      Logger.log('  - e.parameter keys: ' + JSON.stringify(Object.keys(e.parameter)));
      Logger.log('  - e.parameter values: ' + JSON.stringify(e.parameter));
    }
    
    // Парсим данные из тела запроса
    let data;
    
    // Проверяем, есть ли данные в postData
    if (e.postData && e.postData.contents) {
      const contentType = e.postData.type || '';
      Logger.log('  - Content-Type: ' + contentType);
      
      // Если это JSON
      if (contentType.includes('application/json')) {
        try {
          data = JSON.parse(e.postData.contents);
        } catch (parseError) {
          Logger.log('❌ Ошибка парсинга JSON из postData.contents: ' + parseError);
          Logger.log('  - Содержимое: ' + e.postData.contents);
          return createErrorResponse('Ошибка парсинга JSON: ' + parseError.toString());
        }
      } 
      // Если это FormData (multipart/form-data)
      else if (contentType.includes('multipart/form-data')) {
        Logger.log('📝 Обнаружен multipart/form-data формат, парсим...');
        // FormData данные приходят в e.parameter
        if (e.parameter && Object.keys(e.parameter).length > 0) {
          data = e.parameter;
          Logger.log('  - Данные из e.parameter: ' + JSON.stringify(Object.keys(data)));
        } else {
          Logger.log('⚠️ e.parameter пуст для multipart/form-data');
          return createErrorResponse('Не удалось получить данные из FormData');
        }
      }
      // Если это URL-encoded
      // ВАЖНО: Используем ручной парсинг через split('&') и split('='), так как URLSearchParams
      // недоступен в Google Apps Script V8 runtime
      else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('form-urlencoded') || !contentType) {
        Logger.log('📝 Обнаружен URL-encoded формат или пустой Content-Type, парсим...');
        Logger.log('  - Content-Type: ' + (contentType || 'ПУСТОЙ'));
        Logger.log('  - e.parameter существует: ' + (e.parameter ? 'ДА' : 'НЕТ'));
        Logger.log('  - e.parameter keys count: ' + (e.parameter ? Object.keys(e.parameter).length : 0));
        Logger.log('  - e.postData.contents существует: ' + (e.postData && e.postData.contents ? 'ДА' : 'НЕТ'));
        Logger.log('  - e.postData.contents length: ' + (e.postData && e.postData.contents ? e.postData.contents.length : 0));
        
        // Сначала пробуем получить из e.parameter (может быть для некоторых типов запросов)
        if (e.parameter && Object.keys(e.parameter).length > 0) {
          Logger.log('  - Используем данные из e.parameter');
          data = {};
          for (const key in e.parameter) {
            if (e.parameter.hasOwnProperty(key)) {
              data[key] = e.parameter[key];
            }
          }
          Logger.log('  - Данные из e.parameter: ' + JSON.stringify(data));
          Logger.log('  - Количество параметров: ' + Object.keys(data).length);
          Logger.log('  - Ключи: ' + JSON.stringify(Object.keys(data)));
          Logger.log('  - action в e.parameter: ' + (data.action || 'НЕТ'));
        } 
        // Если e.parameter пустой, пробуем распарсить из postData.contents
        // Используем ручной парсинг, так как URLSearchParams недоступен в Google Apps Script
        if ((!data || Object.keys(data).length === 0) && e.postData && e.postData.contents) {
          Logger.log('  - Парсинг postData.contents вручную (URLSearchParams недоступен в GAS)...');
          Logger.log('  - Полное содержимое: ' + e.postData.contents);
          // Ручной парсинг URL-encoded строки через split('&') и split('=')
          const contents = e.postData.contents;
          data = {};
          const pairs = contents.split('&');
          Logger.log('  - Найдено пар: ' + pairs.length);
          for (let i = 0; i < pairs.length; i++) {
            const pair = pairs[i].split('=');
            if (pair.length === 2) {
              const key = decodeURIComponent(pair[0].replace(/\+/g, ' '));
              const value = decodeURIComponent(pair[1].replace(/\+/g, ' '));
            data[key] = value;
              Logger.log('    - Пара ' + (i + 1) + ': ' + key + ' = ' + value.substring(0, Math.min(100, value.length)));
            } else if (pair.length === 1 && pair[0]) {
              // Пара без значения (ключ без =)
              const key = decodeURIComponent(pair[0].replace(/\+/g, ' '));
              data[key] = '';
              Logger.log('    - Пара ' + (i + 1) + ' (без значения): ' + key);
            } else {
              Logger.log('    - Пара ' + (i + 1) + ' не распознана: ' + pairs[i]);
            }
          }
          Logger.log('  - Данные из postData.contents (распарсены): ' + JSON.stringify(data));
          Logger.log('  - Количество параметров: ' + Object.keys(data).length);
          Logger.log('  - action в postData.contents: ' + (data.action || 'НЕТ'));
        }
        
        if (!data || Object.keys(data).length === 0) {
          Logger.log('⚠️ Нет данных ни в e.parameter, ни в postData.contents для URL-encoded');
          Logger.log('  - e.parameter: ' + (e.parameter ? JSON.stringify(e.parameter) : 'НЕТ'));
          Logger.log('  - e.postData: ' + (e.postData ? 'есть' : 'НЕТ'));
          Logger.log('  - e.postData.contents: ' + (e.postData && e.postData.contents ? 'есть (' + e.postData.contents.length + ' символов)' : 'НЕТ'));
        }
      } else {
        // Пытаемся распарсить как JSON по умолчанию
        try {
          data = JSON.parse(e.postData.contents);
        } catch (parseError) {
          Logger.log('⚠️ Не удалось распарсить как JSON, пробуем как URL-encoded');
          // Пробуем как URL-encoded (ручной парсинг, так как URLSearchParams недоступен в Google Apps Script)
          if (e.parameter && Object.keys(e.parameter).length > 0) {
            data = e.parameter;
          } else if (e.postData && e.postData.contents) {
            // Ручной парсинг URL-encoded строки из postData.contents
            Logger.log('  - Парсинг postData.contents как URL-encoded (fallback)...');
            const contents = e.postData.contents;
            data = {};
            const pairs = contents.split('&');
            for (let i = 0; i < pairs.length; i++) {
              const pair = pairs[i].split('=');
              if (pair.length === 2) {
                const key = decodeURIComponent(pair[0].replace(/\+/g, ' '));
                const value = decodeURIComponent(pair[1].replace(/\+/g, ' '));
                data[key] = value;
              }
            }
            Logger.log('  - Распарсено параметров: ' + Object.keys(data).length);
          } else {
            return createErrorResponse('Не удалось распарсить данные запроса. Content-Type: ' + contentType);
          }
        }
      }
    } else if (e.parameter && Object.keys(e.parameter).length > 0) {
      // Если postData пустое, пытаемся получить данные из параметров URL
      // Это может быть для no-cors запросов или URL-encoded данных
      Logger.log('⚠️ postData пустое, пытаемся получить данные из параметров');
      Logger.log('  - e.parameter keys: ' + JSON.stringify(Object.keys(e.parameter)));
      Logger.log('  - e.parameter values: ' + JSON.stringify(e.parameter));
      
      // Создаем новый объект и копируем все параметры
      data = {};
      for (const key in e.parameter) {
        if (e.parameter.hasOwnProperty(key)) {
          data[key] = e.parameter[key];
        }
      }
      
      Logger.log('  - Данные из e.parameter (после копирования): ' + JSON.stringify(data));
      Logger.log('  - data.action: ' + (data.action || 'НЕ УКАЗАНО'));
      Logger.log('  - data.equipmentId: ' + (data.equipmentId || 'НЕ УКАЗАН'));
      
      // Преобразуем строковые значения в нужные типы
      if (data.specs && typeof data.specs === 'string') {
        try {
          data.specs = JSON.parse(data.specs);
        } catch (e) {
          // Игнорируем ошибку парсинга specs
        }
      }
    } else {
      Logger.log('❌ Нет данных в запросе (ни postData, ни parameters)');
      Logger.log('  - e.postData: ' + (e.postData ? 'есть' : 'НЕТ'));
      Logger.log('  - e.parameter: ' + (e.parameter ? JSON.stringify(e.parameter) : 'НЕТ'));
      return createErrorResponse('Нет данных в запросе. Проверьте, что данные отправляются в теле запроса.');
    }
    
    // Проверяем, что данные распарсены
    if (!data || typeof data !== 'object') {
      Logger.log('❌ data не является объектом: ' + typeof data);
      return createErrorResponse('Неверный формат данных запроса');
    }
    
    const action = data.action;
    Logger.log('  - action: ' + (action || 'НЕ УКАЗАНО'));
    Logger.log('  - data.name: ' + (data.name || 'НЕ УКАЗАНО'));
    Logger.log('  - data.email: ' + (data.email || 'НЕ УКАЗАНО'));
    Logger.log('  - data.equipmentId: ' + (data.equipmentId || 'НЕ УКАЗАН'));
    Logger.log('  - Полный объект data: ' + JSON.stringify(data));
    Logger.log('  - Все ключи data: ' + JSON.stringify(Object.keys(data || {})));
    
    // Если action не указан, возвращаем ошибку
    if (!action) {
      Logger.log('❌ action не указан в данных');
      Logger.log('  - Доступные ключи: ' + JSON.stringify(Object.keys(data)));
      return createErrorResponse('Действие (action) не указано в запросе. Доступные ключи: ' + JSON.stringify(Object.keys(data)));
    }
    
    // Выполняем действие в зависимости от параметра
    switch(action) {
      case 'add':
        // Добавить новое оборудование в таблицу
        return createJsonResponse(addEquipment(data));
      
      case 'update':
        // Обновить существующее оборудование
        if (!data.id) {
          return createErrorResponse('ID не указан');
        }
        return createJsonResponse(updateEquipment(data.id, data));
      
      case 'delete':
        // Удалить оборудование (физическое удаление с удалением папки в Google Drive)
        if (!data.id) {
          return createErrorResponse('ID не указан');
        }
        try {
          deleteEquipment(data.id);
          Logger.log('✅ deleteEquipment выполнена успешно');
          return createJsonResponse({ success: true, message: 'Оборудование и папка в Google Drive удалены' });
        } catch (deleteError) {
          Logger.log('❌ Ошибка в deleteEquipment: ' + deleteError);
          Logger.log('   Стек: ' + (deleteError.stack || 'нет стека'));
          return createErrorResponse('Ошибка при удалении оборудования: ' + deleteError.toString());
        }
      
      case 'createFolder':
        // Создать папку в Google Drive для оборудования
        if (!data.name) {
          return createErrorResponse('Название оборудования не указано');
        }
        return createJsonResponse(createDriveFolder(data.name, data.parentFolderId));

      case 'createDocument':
        // Создать документ (Google Doc или Google Sheet) в Google Drive
        Logger.log('📄 Обработка createDocument');
        if (!data.name) {
          return createErrorResponse('Название документа не указано');
        }
        if (!data.docType) {
          return createErrorResponse('Тип документа не указан (doc или sheet)');
        }
        if (!data.content) {
          return createErrorResponse('Содержимое документа не указано');
        }
        try {
          const docResult = createDocument(data.name, data.docType, data.content, data.folderId || null);
          Logger.log('✅ Документ создан: ' + JSON.stringify(docResult));
          return createJsonResponse(docResult);
        } catch (docError) {
          Logger.log('❌ Ошибка createDocument: ' + docError.toString());
          return createErrorResponse('Ошибка создания документа: ' + docError.toString());
        }

      case 'addMaintenanceEntry':
        // Добавить запись в журнал обслуживания
        Logger.log('📝 Обработка addMaintenanceEntry');
        Logger.log('  - data существует: ' + (data ? 'ДА' : 'НЕТ'));
        Logger.log('  - data: ' + JSON.stringify(data));
        Logger.log('  - data.equipmentId: ' + (data && data.equipmentId ? data.equipmentId : 'НЕ УКАЗАН'));
        Logger.log('  - data.date: ' + (data && data.date ? data.date : 'НЕ УКАЗАНО'));
        Logger.log('  - data.type: ' + (data && data.type ? data.type : 'НЕ УКАЗАНО'));
        Logger.log('  - data.description: ' + (data && data.description ? data.description : 'НЕ УКАЗАНО'));
        Logger.log('  - data.performedBy: ' + (data && data.performedBy ? data.performedBy : 'НЕ УКАЗАНО'));
        Logger.log('  - Все ключи data: ' + (data ? JSON.stringify(Object.keys(data)) : 'data is null/undefined'));
        
        // Проверяем наличие данных
    if (!data) {
          Logger.log('❌ data is null или undefined');
          return createErrorResponse('Данные не получены. Проверьте формат запроса.');
        }
        
        if (!data.equipmentId) {
          Logger.log('❌ ID оборудования не указан в data');
          Logger.log('   data: ' + JSON.stringify(data));
          Logger.log('   Все ключи: ' + JSON.stringify(Object.keys(data)));
          return createErrorResponse('ID оборудования не указан. Проверьте, что equipmentId передается в запросе.');
        }
        
        // Извлекаем equipmentId и остальные данные записи
        const equipmentId = String(data.equipmentId).trim();
        const maintenanceSheetId = data.maintenanceSheetId ? String(data.maintenanceSheetId).trim() : null;
        const entryData = {
          date: data.date ? String(data.date).trim() : '',
          type: data.type ? String(data.type).trim() : '',
          description: data.description ? String(data.description).trim() : '',
          performedBy: data.performedBy ? String(data.performedBy).trim() : '',
          status: data.status ? String(data.status).trim() : 'completed'
        };
        
        Logger.log('  - Извлеченный equipmentId: "' + equipmentId + '"');
        Logger.log('  - maintenanceSheetId: ' + (maintenanceSheetId || 'не указан'));
        Logger.log('  - Данные записи: ' + JSON.stringify(entryData));
        
        if (!equipmentId || equipmentId === '') {
          Logger.log('❌ equipmentId пустой после извлечения');
          return createErrorResponse('ID оборудования пустой после обработки');
        }
        
        try {
          Logger.log('📞 Вызов addMaintenanceEntry с equipmentId="' + equipmentId + '" и entryData=' + JSON.stringify(entryData));
          // maintenanceSheetId передается в _addMaintenanceEntry, но функция его не использует напрямую
          // Она использует его через getMaintenanceLog, но для добавления всегда используется основной лист
          const result = _addMaintenanceEntry(equipmentId, entryData);
          Logger.log('✅ Запись добавлена успешно: ' + JSON.stringify(result));
          return createJsonResponse(result);
  } catch (error) {
          Logger.log('❌ Ошибка в addMaintenanceEntry: ' + error.toString());
          Logger.log('   Стек: ' + (error.stack || 'нет стека'));
          return createErrorResponse('Ошибка при добавлении записи: ' + error.toString());
        }
      
      case 'updateMaintenanceEntry':
        // Обновить запись в журнале обслуживания
        if (!data.entryId) {
          return createErrorResponse('ID записи не указан');
        }
        return createJsonResponse(_updateMaintenanceEntry(data.entryId, data));
      
      case 'deleteMaintenanceEntry':
        // Удалить запись из журнала обслуживания
        if (!data.entryId) {
          return createErrorResponse('ID записи не указан');
        }
        return createJsonResponse(_deleteMaintenanceEntry(data.entryId));
      
      // ========================================================================
      // ДЕЙСТВИЯ АУТЕНТИФИКАЦИИ И УПРАВЛЕНИЯ ПОЛЬЗОВАТЕЛЯМИ
      // ========================================================================
      
      case 'register':
        // Регистрация нового пользователя
        Logger.log('👤 Обработка register');
        if (!data.email) {
          return createErrorResponse('Email не указан');
        }
        if (!data.password) {
          return createErrorResponse('Пароль не указан');
        }
        const registerResult = registerUser(data.email, data.password, data.name || '');
        if (!registerResult.success) {
          return createErrorResponse(registerResult.message);
        }
        // После успешной регистрации автоматически авторизуем пользователя
        const autoLoginResult = loginUser(data.email, data.password);
        if (!autoLoginResult.success) {
          // Если авторизация не удалась, все равно возвращаем успешную регистрацию
          Logger.log('⚠️ Регистрация успешна, но автоматический вход не удался: ' + autoLoginResult.message);
          return createJsonResponse({
            success: true,
            user: registerResult.user,
            message: registerResult.message + ' Пожалуйста, войдите в систему.'
          });
        }
        return createJsonResponse({
          success: true,
          user: autoLoginResult.user,
          sessionToken: autoLoginResult.sessionToken,
          expiresAt: autoLoginResult.expiresAt,
          message: registerResult.message
        });
      
      case 'login':
        // Вход пользователя
        Logger.log('🔐 Обработка login');
        if (!data.email) {
          return createErrorResponse('Email не указан');
        }
        if (!data.password) {
          return createErrorResponse('Пароль не указан');
        }
        const loginResult = loginUser(data.email, data.password);
        if (!loginResult.success) {
          return createErrorResponse(loginResult.message);
        }
        return createJsonResponse({
          success: true,
          user: loginResult.user,
          sessionToken: loginResult.sessionToken,
          expiresAt: loginResult.expiresAt,
          message: loginResult.message
        });
      
      case 'logout':
        // Выход пользователя (обновление времени последней активности)
        Logger.log('🚪 Обработка logout');
        if (!data.email) {
          return createErrorResponse('Email не указан');
        }
        // Обновляем время последней активности (можно использовать для статистики)
        updateLastActivity(data.email);
        return createJsonResponse({
          success: true,
          message: 'Выход выполнен успешно'
        });
      
      case 'change-password':
        // Смена пароля пользователя
        Logger.log('🔑 Обработка change-password');
        if (!data.email) {
          return createErrorResponse('Email не указан');
        }
        if (!data.currentPassword) {
          return createErrorResponse('Текущий пароль не указан');
        }
        if (!data.newPassword) {
          return createErrorResponse('Новый пароль не указан');
        }
        const changePasswordResult = changePassword(data.email, data.currentPassword, data.newPassword);
        if (!changePasswordResult.success) {
          return createErrorResponse(changePasswordResult.message);
        }
        return createJsonResponse({
          success: true,
          message: changePasswordResult.message
        });
      
      // ========================================================================
      // ДЕЙСТВИЯ УПРАВЛЕНИЯ ДОСТУПОМ К ПРИЛОЖЕНИЯМ
      // ========================================================================
      
      case 'getAllUserAccess':
        // Получить все настройки доступа
        Logger.log('🔐 [Code.gs] Обработка getAllUserAccess');
        Logger.log('🔐 [Code.gs] Вызов handleGetAllUserAccess()');
        try {
          const result = handleGetAllUserAccess();
          Logger.log('🔐 [Code.gs] handleGetAllUserAccess() вернул результат');
          Logger.log('🔐 [Code.gs] Тип результата: ' + typeof result);
          
          // Проверяем содержимое ответа перед возвратом
          if (result && typeof result.getContent === 'function') {
            const content = result.getContent();
            Logger.log('🔐 [Code.gs] Размер ответа перед возвратом: ' + content.length + ' символов');
            Logger.log('🔐 [Code.gs] Первые 500 символов ответа: ' + content.substring(0, 500));
            
            // Проверяем, что данные действительно в ответе
            try {
              const parsed = JSON.parse(content);
              Logger.log('🔐 [Code.gs] Парсинг ответа успешен, data.length=' + (parsed.data?.length || 0));
            } catch (parseErr) {
              Logger.log('❌ [Code.gs] Ошибка парсинга ответа: ' + parseErr.toString());
            }
          }
          
          return result;
        } catch (err) {
          Logger.log('❌ [Code.gs] Ошибка в handleGetAllUserAccess(): ' + err.toString());
          Logger.log('❌ [Code.gs] Stack: ' + (err.stack || 'нет'));
          throw err;
        }
      
      case 'getUserAccess':
        // Получить настройки доступа для пользователя
        Logger.log('🔐 Обработка getUserAccess');
        return handleGetUserAccess(data);
      
      case 'updateUserAccess':
        // Обновить настройки доступа для пользователя
        Logger.log('🔐 Обработка updateUserAccess');
        // TODO: Добавить проверку прав администратора
        // const adminEmail = data.adminEmail || null;
        return handleUpdateUserAccess(data, data.adminEmail || null);

      case 'syncFolderAccess':
        // Синхронизировать доступ к папкам оборудования
        Logger.log('🔄 Обработка syncFolderAccess');
        return handleSyncFolderAccess(data);
      
      case 'check-session':
        // Проверка активности сессии
        Logger.log('⏱️ Обработка check-session');
        if (!data.email) {
          return createErrorResponse('Email не указан');
        }
        const sessionCheck = checkSessionTimeout(data.email);
        if (!sessionCheck.active) {
          return createErrorResponse(sessionCheck.message || 'Сессия истекла');
        }
        // Обновляем время последней активности при успешной проверке
        updateLastActivity(data.email);
        return createJsonResponse({
          active: true,
          remainingTime: sessionCheck.remainingTime,
          message: 'Сессия активна'
        });
      
      case 'verify-admin':
        // Проверка прав администратора
        Logger.log('👑 Обработка verify-admin');
        if (!data.email) {
          return createErrorResponse('Email не указан');
        }
        const role = verifyAdminAccess(data.email);
        return createJsonResponse({
          isAdmin: role === 'admin',
          role: role,
          email: data.email
        });
      
      case 'add-admin':
        // Добавление администратора в резервный список (только для админов)
        Logger.log('➕ Обработка add-admin');
        if (!data.email) {
          return createErrorResponse('Email не указан');
        }
        // TODO: Добавить проверку прав текущего пользователя (только админы могут добавлять админов)
        const addAdminResult = addAdminManually(data.email, data.note || '');
        if (!addAdminResult.success) {
          return createErrorResponse(addAdminResult.message);
        }
        return createJsonResponse({
          success: true,
          message: addAdminResult.message
        });
      
      case 'remove-admin':
        // Удаление администратора из резервного списка (только для админов)
        Logger.log('➖ Обработка remove-admin');
        if (!data.email) {
          return createErrorResponse('Email не указан');
        }
        // TODO: Добавить проверку прав текущего пользователя (только админы могут удалять админов)
        const removeAdminResult = removeAdminManually(data.email);
        if (!removeAdminResult.success) {
          return createErrorResponse(removeAdminResult.message);
        }
        return createJsonResponse({
          success: true,
          message: removeAdminResult.message
        });
      
      // ========================================================================
      // ДЕЙСТВИЯ ДЛЯ СЧЕТЧИКОВ BELIOT (POST)
      // ========================================================================
      
      case 'saveBeliotDeviceOverride':
        // Сохранить изменения для устройства
        Logger.log('📊 Обработка saveBeliotDeviceOverride');
        Logger.log('📊 data существует: ' + (data ? 'ДА' : 'НЕТ'));
        Logger.log('📊 data type: ' + typeof data);
        Logger.log('📊 Все ключи data: ' + JSON.stringify(data ? Object.keys(data) : []));
        Logger.log('📊 Полный объект data: ' + JSON.stringify(data));
        Logger.log('📊 Полученные данные: deviceId=' + (data ? data.deviceId : 'undefined') + ', serialNumber=' + (data ? data.serialNumber : 'undefined') + ', object=' + (data ? data.object : 'undefined'));
        
        if (!data) {
          Logger.log('❌ data is null или undefined');
          return createErrorResponse('Данные не получены. Проверьте формат запроса.');
        }
        
        if (!data.deviceId) {
          Logger.log('❌ deviceId не указан в data');
          Logger.log('   data: ' + JSON.stringify(data));
          Logger.log('   Все ключи: ' + JSON.stringify(Object.keys(data)));
          return createErrorResponse('deviceId не указан. Проверьте, что deviceId передается в запросе.');
        }
        
        const overrideData = {
          name: data.name,
          address: data.address,
          serialNumber: data.serialNumber,
          group: data.group,
          object: data.object,
          modifiedBy: data.modifiedBy,
        };
        Logger.log('📊 Данные для сохранения: ' + JSON.stringify(overrideData));
        Logger.log('📊 Вызов saveBeliotDeviceOverride с deviceId="' + data.deviceId + '" и overrideData=' + JSON.stringify(overrideData));
        try {
          const result = saveBeliotDeviceOverride(data.deviceId, overrideData);
          Logger.log('✅ Данные успешно сохранены в Google Sheets');
          Logger.log('📊 Результат: ' + JSON.stringify(result));
          return createJsonResponse(result);
        } catch (error) {
          Logger.log('❌ Ошибка при сохранении: ' + error.toString());
          Logger.log('❌ Стек ошибки: ' + (error.stack || 'нет стека'));
          return createErrorResponse('Ошибка при сохранении: ' + error.toString());
        }
      
      case 'saveBeliotDevicesOverrides':
        // Сохранить несколько изменений за раз
        Logger.log('📊 Обработка saveBeliotDevicesOverrides');
        if (!data.overrides || typeof data.overrides !== 'object') {
          return createErrorResponse('overrides не указаны или имеют неверный формат');
        }
        return createJsonResponse(saveBeliotDevicesOverrides(data.overrides, data.modifiedBy));
      
      case 'deleteBeliotDeviceOverride':
        // Удалить изменения для устройства
        Logger.log('📊 Обработка deleteBeliotDeviceOverride');
        if (!data.deviceId) {
          return createErrorResponse('deviceId не указан');
        }
        const deleted = deleteBeliotDeviceOverride(data.deviceId);
        return createJsonResponse({
          success: deleted,
          message: deleted ? 'Изменения удалены успешно' : 'Изменения не найдены'
        });
      
      // ========================================================================
      // ДЕЙСТВИЯ ДЛЯ УПРАВЛЕНИЯ УЧАСТКАМИ (POST)
      // ========================================================================
      
      case 'addWorkshop':
        // Добавить новый участок
        Logger.log('🏭 Обработка addWorkshop');
        if (!data.name) {
          return createErrorResponse('Название участка обязательно');
        }
        return createJsonResponse(addWorkshop(data));
      
      case 'updateWorkshop':
        // Обновить участок
        Logger.log('🏭 Обработка updateWorkshop');
        if (!data.id) {
          return createErrorResponse('ID участка не указан');
        }
        return createJsonResponse(updateWorkshop(data.id, data));
      
      case 'deleteWorkshop':
        // Удалить участок
        Logger.log('🏭 Обработка deleteWorkshop');
        if (!data.id) {
          return createErrorResponse('ID участка не указан');
        }
        try {
          const deleted = deleteWorkshop(data.id);
          return createJsonResponse({
            success: deleted !== false,
            message: deleted !== false ? 'Участок удален успешно' : 'Участок не найден'
          });
        } catch (error) {
          Logger.log('❌ Ошибка при удалении участка: ' + error.toString());
          return createErrorResponse('Ошибка при удалении участка: ' + error.toString());
        }

      case 'uploadMaintenancePhoto':
        // Загрузить фото обслуживания
        Logger.log('📷 Обработка uploadMaintenancePhoto');
        Logger.log('  - data: ' + JSON.stringify(Object.keys(data)));

        if (!data.equipmentId) {
          return createErrorResponse('ID оборудования не указан');
        }
        if (!data.photoBase64) {
          return createErrorResponse('Фото не предоставлено');
        }

        try {
          const uploadResult = uploadMaintenancePhoto(
            data.equipmentId,
            data.photoBase64,
            data.mimeType || 'image/jpeg',
            data.description || '',
            data.date || new Date().toISOString().split('T')[0],
            data.maintenanceType || 'Обслуживание'
          );
          Logger.log('✅ Фото успешно загружено');
          return createJsonResponse(uploadResult);
        } catch (error) {
          Logger.log('❌ Ошибка uploadMaintenancePhoto: ' + error.toString());
          return createErrorResponse('Ошибка загрузки фото: ' + error.toString());
        }

      case 'ensureDriveFolderPath':
        // Создать (если нужно) подпапки по пути внутри указанной папки Drive
        Logger.log('📁 Обработка ensureDriveFolderPath');
        if (!data.parentFolderId) {
          return createErrorResponse('parentFolderId не указан');
        }
        if (!data.subfolderPath) {
          return createErrorResponse('subfolderPath не указан');
        }
        try {
          var ensureResult = ensureDriveFolderPath(
            data.parentFolderId,
            data.subfolderPath
          );
          return createJsonResponse(ensureResult);
        } catch (ensureError) {
          Logger.log('❌ Ошибка ensureDriveFolderPath: ' + ensureError.toString());
          return createErrorResponse('Ошибка создания подпапок: ' + ensureError.toString());
        }

      case 'uploadPhotosToFolder':
        // Загрузить фото в указанную папку Drive (произвольная папка)
        Logger.log('📷 Обработка uploadPhotosToFolder');
        if (!data.folderId) {
          return createErrorResponse('folderId не указан');
        }
        if (!data.photoBase64) {
          return createErrorResponse('Фото не предоставлено');
        }
        try {
          var uploadToFolderResult = uploadPhotosToFolder(
            data.folderId,
            data.photoBase64,
            data.mimeType || 'image/jpeg',
            data.name || '',
            data.description || '',
            data.date || new Date().toISOString().split('T')[0],
            data.maintenanceType || 'Фото',
            data.index || 1,
            data.total || 1
          );
          return createJsonResponse(uploadToFolderResult);
        } catch (uploadToFolderError) {
          Logger.log('❌ Ошибка uploadPhotosToFolder: ' + uploadToFolderError.toString());
          return createErrorResponse('Ошибка загрузки фото: ' + uploadToFolderError.toString());
        }

      case 'uploadMaintenanceDocument':
        // Загрузить документ обслуживания (PDF, Word, Excel и др.)
        Logger.log('📎 Обработка uploadMaintenanceDocument');

        if (!data.equipmentId) {
          return createErrorResponse('ID оборудования не указан');
        }
        if (!data.fileBase64) {
          return createErrorResponse('Файл не предоставлен');
        }
        if (!data.entryId) {
          return createErrorResponse('ID записи журнала не указан');
        }

        try {
          const docUploadResult = uploadMaintenanceDocument(
            data.equipmentId,
            data.fileBase64,
            data.mimeType || 'application/octet-stream',
            data.originalFileName || 'document',
            data.date || new Date().toISOString().split('T')[0],
            data.entryId
          );
          Logger.log('✅ Документ успешно загружен');
          return createJsonResponse(docUploadResult);
        } catch (docUploadError) {
          Logger.log('❌ Ошибка uploadMaintenanceDocument: ' + docUploadError.toString());
          return createErrorResponse('Ошибка загрузки документа: ' + docUploadError.toString());
        }

      case 'attachFilesToEntry':
        // Прикрепить ссылки на файлы к записи журнала обслуживания
        Logger.log('📎 Обработка attachFilesToEntry');

        if (!data.entryId) {
          return createErrorResponse('ID записи не указан');
        }
        if (!data.files) {
          return createErrorResponse('Файлы не указаны');
        }

        try {
          var filesToAttach = typeof data.files === 'string' ? JSON.parse(data.files) : data.files;
          const attachResult = _updateMaintenanceEntry(data.entryId, { files: filesToAttach });
          Logger.log('✅ Файлы прикреплены к записи');
          return createJsonResponse(attachResult);
        } catch (attachError) {
          Logger.log('❌ Ошибка attachFilesToEntry: ' + attachError.toString());
          return createErrorResponse('Ошибка прикрепления файлов: ' + attachError.toString());
        }

      default:
        // Если действие не распознано, возвращаем ошибку
        return createErrorResponse('Неизвестное действие: ' + action);
    }
      } catch (error) {
    // Логируем ошибку для отладки
    Logger.log('Ошибка в doPost: ' + error);
    // Возвращаем ошибку пользователю
    return createErrorResponse('Ошибка сервера: ' + error.toString());
  }
}

// ============================================================================
// СПРАВКА О МОДУЛЬНОЙ СТРУКТУРЕ
// ============================================================================
// Все функции бизнес-логики вынесены в отдельные модули для улучшения организации кода.
// Подробное описание модулей и их зависимостей см. в заголовке файла выше.
//
// Модули доступны глобально в проекте Google Apps Script и автоматически
// загружаются при выполнении любого скрипта в проекте.

// ============================================================================
// ТЕСТОВЫЕ ФУНКЦИИ
// ============================================================================

/**
 * Тестовая функция для проверки addEquipment
 * 
 * Запустите эту функцию для тестирования создания оборудования
 * В меню: Выполнить → testAddEquipment
 */
function testAddEquipment() {
  try {
    const testData = {
      name: 'Тестовое оборудование',
      type: 'filter',
      specs: {
        height: '1,5 м',
        diameter: '0,8 м'
      },
      status: 'active'
    };
    
    Logger.log('🧪 Тестирование addEquipment с данными:');
    Logger.log(JSON.stringify(testData, null, 2));
    
    const result = addEquipment(testData);
    
    Logger.log('✅ Тест успешен! Создано оборудование:');
    Logger.log(JSON.stringify(result, null, 2));
    
    return result;
  } catch (error) {
    Logger.log('❌ Ошибка при тестировании: ' + error.toString());
    Logger.log('Стек ошибки: ' + (error.stack || 'нет стека'));
    throw error;
  }
}

/**
 * Тестовая функция для проверки createDriveFolder
 * 
 * Запустите эту функцию для тестирования создания папки
 * В меню: Выполнить → testCreateDriveFolder
 * 
 * ВАЖНО: При первом запуске Google запросит разрешения.
 * Нажмите "Разрешить" и выберите ваш аккаунт.
 */
function testCreateDriveFolder() {
  try {
    const testName = 'Тестовая папка ' + new Date().getTime();
    
    Logger.log('🧪 Тестирование createDriveFolder с названием: "' + testName + '"');
    
    const result = createDriveFolder(testName);
    
    Logger.log('✅ Тест успешен! Создана папка:');
    Logger.log(JSON.stringify(result, null, 2));
    
    // Удаляем тестовую папку
    try {
      const folder = DriveApp.getFolderById(result.folderId);
      folder.setTrashed(true);
      Logger.log('🗑️ Тестовая папка удалена');
    } catch (deleteError) {
      Logger.log('⚠️ Не удалось удалить тестовую папку: ' + deleteError);
    }
    
    return result;
  } catch (error) {
    Logger.log('❌ Ошибка при тестировании: ' + error.toString());
    Logger.log('Стек ошибки: ' + (error.stack || 'нет стека'));
    throw error;
  }
}

/**
 * Функция для принудительного запроса разрешений на ЧТЕНИЕ
 * 
 * Запустите эту функцию, чтобы Google запросил разрешения на чтение
 * В меню: Выполнить → requestDrivePermissions
 */
function requestDrivePermissions() {
  try {
    Logger.log('🔐 Запрос разрешений на доступ к Google Drive (чтение)...');
    
    // Пытаемся выполнить простую операцию с Drive, чтобы запросить разрешения
    try {
      const rootFolder = DriveApp.getRootFolder();
      Logger.log('✅ Разрешения на чтение уже предоставлены!');
      Logger.log('   Root folder name: ' + rootFolder.getName());
      return 'Разрешения на чтение уже предоставлены';
    } catch (error) {
      Logger.log('⚠️ Разрешения не предоставлены. Google должен запросить их автоматически.');
      Logger.log('   Если окно авторизации не появилось, попробуйте:');
      Logger.log('   1. Обновить страницу Google Apps Script');
      Logger.log('   2. Запустить функцию testCreateDriveFolder');
      Logger.log('   3. Проверить настройки проекта');
      throw error; // Пробрасываем ошибку, чтобы Google показал окно авторизации
    }
  } catch (error) {
    Logger.log('❌ Ошибка: ' + error.toString());
    Logger.log('   Это нормально - Google должен показать окно авторизации');
    throw error; // Пробрасываем, чтобы вызвать окно авторизации
  }
}

/**
 * Тестовая функция для проверки удаления папки
 * 
 * Запустите эту функцию для тестирования удаления папки
 * В меню: Выполнить → testDeleteDriveFolder
 * 
 * ВАЖНО: Укажите URL папки в переменной testFolderUrl перед запуском
 */
function testDeleteDriveFolder() {
  try {
    // УКАЖИТЕ URL ПАПКИ ДЛЯ ТЕСТИРОВАНИЯ
    const testFolderUrl = 'https://drive.google.com/drive/folders/YOUR_FOLDER_ID';
    
    Logger.log('🧪 Тестирование удаления папки');
    Logger.log('  - URL: ' + testFolderUrl);
    
    if (testFolderUrl.includes('YOUR_FOLDER_ID')) {
      Logger.log('❌ Ошибка: Укажите реальный URL папки в переменной testFolderUrl');
      Logger.log('   Пример: https://drive.google.com/drive/folders/1a2b3c4d5e6f7g8h9i0j');
      return;
    }
    
    deleteDriveFolder(testFolderUrl);
    
    Logger.log('✅ Тест успешен! Папка удалена');
  } catch (error) {
    Logger.log('❌ Ошибка при тестировании: ' + error.toString());
    Logger.log('Стек ошибки: ' + (error.stack || 'нет стека'));
    throw error;
  }
}

/**
 * Функция для запроса ПОЛНЫХ разрешений на Google Drive (чтение + запись)
 * 
 * ВАЖНО: Эта функция запросит полные права на Google Drive, включая создание папок
 * Запустите эту функцию, чтобы Google запросил разрешения на запись
 * В меню: Выполнить → requestFullDrivePermissions
 */
function requestFullDrivePermissions() {
  try {
    Logger.log('🔐 Запрос ПОЛНЫХ разрешений на Google Drive (чтение + запись)...');
    Logger.log('⚠️ Эта функция попытается создать тестовую папку для запроса разрешений');
    
    // Пытаемся создать тестовую папку - это запросит полные права
    try {
      const testFolderName = 'Тест разрешений ' + new Date().getTime();
      Logger.log('📁 Попытка создать тестовую папку: "' + testFolderName + '"');
      
      const testFolder = DriveApp.createFolder(testFolderName);
      Logger.log('✅ ПОЛНЫЕ разрешения получены!');
      Logger.log('   Тестовая папка создана: ' + testFolder.getName());
      Logger.log('   Folder ID: ' + testFolder.getId());
      Logger.log('   Folder URL: ' + testFolder.getUrl());
      
      // Удаляем тестовую папку
      try {
        testFolder.setTrashed(true);
        Logger.log('🗑️ Тестовая папка удалена');
      } catch (deleteError) {
        Logger.log('⚠️ Не удалось удалить тестовую папку: ' + deleteError);
      }
      
      return 'Полные разрешения получены!';
    } catch (error) {
      Logger.log('❌ Ошибка при создании папки: ' + error.toString());
      Logger.log('⚠️ Google должен показать окно авторизации для запроса полных прав');
      Logger.log('   Если окно не появилось:');
      Logger.log('   1. Обновите страницу Google Apps Script (F5)');
      Logger.log('   2. Запустите функцию еще раз');
      Logger.log('   3. Проверьте настройки проекта');
      throw error; // Пробрасываем ошибку, чтобы Google показал окно авторизации
    }
  } catch (error) {
    Logger.log('❌ Ошибка: ' + error.toString());
    Logger.log('   Это нормально - Google должен показать окно авторизации');
    Logger.log('   В окне авторизации выберите аккаунт и разрешите доступ к Google Drive');
    throw error; // Пробрасываем, чтобы вызвать окно авторизации
  }
}

// Все функции журнала обслуживания перенесены в MaintenanceLog.gs
// См. описание модулей в заголовке файла
