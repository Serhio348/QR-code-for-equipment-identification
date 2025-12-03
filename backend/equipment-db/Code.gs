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
 * ЗАВИСИМОСТИ МЕЖДУ МОДУЛЯМИ:
 * - SheetHelpers.gs использует Utils.gs (formatDate)
 * - EquipmentQueries.gs использует SheetHelpers.gs
 * - EquipmentMutations.gs использует Utils.gs, SheetHelpers.gs, EquipmentQueries.gs, DriveOperations.gs
 * - MaintenanceLog.gs использует Utils.gs, SheetHelpers.gs, EquipmentQueries.gs, DriveOperations.gs
 * - DriveOperations.gs использует свои внутренние функции
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
 * GET запросы используются для чтения данных из таблицы
 * 
 * Поддерживаемые действия:
 * - getAll - получить все оборудование
 * - getById - получить оборудование по ID
 * - getByType - получить оборудование по типу
 * - getFolderFiles - получить список файлов из папки Google Drive
 * 
 * @param {Object} e - объект события с параметрами запроса
 * @param {Object} e.parameter - параметры URL запроса
 * @param {string} e.parameter.action - действие для выполнения
 * @param {string} e.parameter.id - ID оборудования (для getById)
 * @param {string} e.parameter.type - тип оборудования (для getByType)
 * 
 * @returns {TextOutput} JSON ответ с данными или ошибкой
 * 
 * Примеры использования:
 * - ?action=getAll - получить все записи
 * - ?action=getById&id=123 - получить запись с ID 123
 * - ?action=getByType&type=filter - получить все фильтры
 * - ?action=getByType&type=industrial - получить все промышленное оборудование
 * - ?action=getFolderFiles&folderUrl=https://... - получить список файлов из папки
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
        // Получить оборудование определенного типа (filter, pump, tank, electrical, ventilation, plumbing, industrial, other)
        const type = e.parameter.type;
        if (!type) {
          return createErrorResponse('Тип не указан');
        }
        return createJsonResponse(getEquipmentByType(type));
      
      case 'getFolderFiles':
        // Получить список файлов из папки Google Drive
        Logger.log('📁 Обработка getFolderFiles');
        const folderUrl = e.parameter.folderUrl || e.parameter.folderId;
        Logger.log('  - folderUrl: ' + folderUrl);
        if (!folderUrl) {
          Logger.log('❌ URL папки не указан');
          return createErrorResponse('URL или ID папки не указан');
        }
        Logger.log('✅ Вызов getFolderFiles с URL: ' + folderUrl);
        const files = getFolderFiles(folderUrl);
        Logger.log('✅ getFolderFiles вернул ' + files.length + ' файлов');
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
      
      default:
        // Если действие не распознано, возвращаем ошибку
        Logger.log('❌ Неизвестное действие: ' + action);
        Logger.log('  - Доступные действия: getAll, getById, getByType, getFolderFiles, getMaintenanceLog, addMaintenanceEntry');
        return createErrorResponse('Неизвестное действие. Используйте: getAll, getById, getByType, getFolderFiles, getMaintenanceLog, addMaintenanceEntry');
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
 * POST запросы используются для создания, обновления и удаления данных
 * 
 * Поддерживаемые действия:
 * - add - добавить новое оборудование
 * - update - обновить существующее оборудование
 * - delete - удалить оборудование (физическое удаление с удалением папки в Google Drive)
 * - createFolder - создать папку в Google Drive для оборудования
 * 
 * @param {Object} e - объект события с данными запроса
 * @param {string} e.postData.contents - тело запроса в формате JSON
 * 
 * @returns {TextOutput} JSON ответ с результатом операции
 * 
 * Пример тела запроса для добавления:
 * {
 *   "action": "add",
 *   "name": "Фильтр №1",
 *   "type": "filter",
 *   "specs": {...},
 *   "googleDriveUrl": "https://...",
 *   "status": "active"
 * }
 */
function doPost(e) {
  try {
    // Логируем входящий запрос для отладки (самое первое, что должно быть видно)
    Logger.log('📨 ========== doPost ВЫЗВАН ==========');
    Logger.log('📨 Получен POST запрос');
    Logger.log('  - Timestamp: ' + new Date().toISOString());
    
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
      else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('form-urlencoded')) {
        Logger.log('📝 Обнаружен URL-encoded формат, парсим...');
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
        } 
        // Если e.parameter пустой, пробуем распарсить из postData.contents
        else if (e.postData && e.postData.contents) {
          // Пытаемся распарсить вручную из postData.contents
          Logger.log('  - Парсинг postData.contents вручную...');
          Logger.log('  - Содержимое (первые 500 символов): ' + e.postData.contents.substring(0, Math.min(500, e.postData.contents.length)));
          // Ручной парсинг URL-encoded строки
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
              Logger.log('    - Пара ' + (i + 1) + ': ' + key + ' = ' + value.substring(0, Math.min(50, value.length)));
            } else {
              Logger.log('    - Пара ' + (i + 1) + ' не распознана: ' + pairs[i]);
            }
          }
          Logger.log('  - Данные из postData.contents (распарсены): ' + JSON.stringify(data));
          Logger.log('  - Количество параметров: ' + Object.keys(data).length);
        } else {
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
          // Пробуем как URL-encoded
          if (e.parameter && Object.keys(e.parameter).length > 0) {
            data = e.parameter;
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
    
    const action = data.action;
    Logger.log('  - action: ' + (action || 'НЕ УКАЗАНО'));
    Logger.log('  - data.name: ' + (data.name || 'НЕ УКАЗАНО'));
    Logger.log('  - data.equipmentId: ' + (data.equipmentId || 'НЕ УКАЗАНО'));
    Logger.log('  - Полный объект data: ' + JSON.stringify(data));
    Logger.log('  - Все ключи data: ' + JSON.stringify(Object.keys(data || {})));
    
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
        const entryData = {
          date: data.date ? String(data.date).trim() : '',
          type: data.type ? String(data.type).trim() : '',
          description: data.description ? String(data.description).trim() : '',
          performedBy: data.performedBy ? String(data.performedBy).trim() : '',
          status: data.status ? String(data.status).trim() : 'completed'
        };
        
        Logger.log('  - Извлеченный equipmentId: "' + equipmentId + '"');
        Logger.log('  - Данные записи: ' + JSON.stringify(entryData));
        
        if (!equipmentId || equipmentId === '') {
          Logger.log('❌ equipmentId пустой после извлечения');
          return createErrorResponse('ID оборудования пустой после обработки');
        }
        
        try {
          Logger.log('📞 Вызов addMaintenanceEntry с equipmentId="' + equipmentId + '" и entryData=' + JSON.stringify(entryData));
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
      
      default:
        // Если действие не распознано, возвращаем ошибку
        return createErrorResponse('Неизвестное действие. Используйте: add, update, delete, createFolder, addMaintenanceEntry, updateMaintenanceEntry, deleteMaintenanceEntry');
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
