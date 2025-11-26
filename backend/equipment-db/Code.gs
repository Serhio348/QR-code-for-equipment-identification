/**
 * Google Apps Script API для базы данных оборудования
 * 
 * Предоставляет REST API для работы с Google Sheets таблицей "Оборудование"
 * 
 * Инструкция по установке:
 * 1. Откройте вашу Google Sheets таблицу "База данных оборудования"
 * 2. Расширения → Apps Script
 * 3. Скопируйте весь этот код
 * 4. Сохраните (Ctrl+S)
 * 5. Разверните как веб-приложение (см. README.md)
 * 
 * Структура таблицы:
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
        return createJsonResponse(getMaintenanceLog(equipmentId));
      
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
// ФУНКЦИИ ЧТЕНИЯ ДАННЫХ
// ============================================================================

/**
 * Получить все оборудование из таблицы
 * 
 * Читает все строки из листа "Оборудование", начиная со второй строки
 * (первая строка - заголовки), и преобразует их в массив объектов Equipment
 * 
 * @returns {Array} Массив объектов Equipment
 * 
 * Структура возвращаемого объекта:
 * {
 *   id: "uuid",
 *   name: "Название",
 *   type: "filter",
 *   specs: {...},
 *   googleDriveUrl: "https://...",
 *   qrCodeUrl: "https://...",
 *   commissioningDate: "2024-01-15",
 *   lastMaintenanceDate: "2024-01-20",
 *   status: "active",
 *   createdAt: "2024-01-15T10:30:00.000Z",
 *   updatedAt: "2024-01-20T14:00:00.000Z"
 * }
 */
function getAllEquipment() {
  try {
    // Получаем лист "Оборудование"
    const sheet = getEquipmentSheet();
    
    // Получаем все данные из листа (включая заголовки)
    const data = sheet.getDataRange().getValues();
    
    // Если в таблице только заголовки или она пуста, возвращаем пустой массив
    if (data.length <= 1) {
      return [];
    }
    
    // Первая строка - заголовки колонок
    const headers = data[0];
    const equipment = [];
    
    // Обрабатываем каждую строку, начиная со второй (индекс 1)
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      
      // Проверяем, что в первой колонке есть ID (не пустая строка)
      if (row[0] && row[0] !== '') {
        // Преобразуем строку таблицы в объект Equipment
        const item = parseRowToEquipment(row, headers);
        if (item) {
          equipment.push(item);
        }
      }
    }
    
    return equipment;
  } catch (error) {
    // Логируем ошибку
    Logger.log('Ошибка при получении оборудования: ' + error);
    // Пробрасываем ошибку дальше для обработки в doGet/doPost
    throw error;
  }
}

/**
 * Получить оборудование по уникальному ID
 * 
 * Ищет строку в таблице, где колонка A (ID) совпадает с переданным ID
 * 
 * @param {string} id - Уникальный идентификатор оборудования (UUID)
 * @returns {Object|null} Объект Equipment или null, если не найдено
 * 
 * Пример использования:
 * const equipment = getEquipmentById('550e8400-e29b-41d4-a716-446655440000');
 */
function getEquipmentById(id) {
  try {
    const sheet = getEquipmentSheet();
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    // Ищем строку с нужным ID
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      // Сравниваем ID в первой колонке (индекс 0)
      if (row[0] === id) {
        // Найдено - преобразуем строку в объект и возвращаем
        return parseRowToEquipment(row, headers);
      }
    }
    
    // Не найдено - возвращаем null
    return null;
  } catch (error) {
    Logger.log('Ошибка при получении оборудования по ID: ' + error);
    throw error;
  }
}

/**
 * Получить оборудование по типу
 * 
 * Фильтрует все оборудование по типу (filter, pump, tank, valve, electrical, ventilation, plumbing, industrial, other)
 * 
 * @param {string} type - Тип оборудования для фильтрации
 * @returns {Array} Массив объектов Equipment указанного типа
 * 
 * Пример использования:
 * const filters = getEquipmentByType('filter');
 */
function getEquipmentByType(type) {
  try {
    // Получаем все оборудование
    const allEquipment = getAllEquipment();
    
    // Фильтруем по типу
    return allEquipment.filter(eq => eq.type === type);
  } catch (error) {
    Logger.log('Ошибка при получении оборудования по типу: ' + error);
    throw error;
  }
}

// ============================================================================
// ФУНКЦИИ ЗАПИСИ ДАННЫХ
// ============================================================================

/**
 * Добавить новое оборудование в таблицу
 * 
 * Создает новую строку в таблице с автоматически сгенерированным UUID
 * и текущей датой/временем создания и обновления
 * 
 * @param {Object} data - Данные нового оборудования
 * @param {string} data.name - Название оборудования (обязательно)
 * @param {string} data.type - Тип оборудования (обязательно)
 * @param {Object} data.specs - Характеристики оборудования (JSON объект)
 * @param {string} data.googleDriveUrl - URL папки в Google Drive
 * @param {string} data.qrCodeUrl - URL для QR-кода
 * @param {string} data.commissioningDate - Дата ввода в эксплуатацию (YYYY-MM-DD)
 * @param {string} data.lastMaintenanceDate - Дата последнего обслуживания (YYYY-MM-DD)
 * @param {string} data.status - Статус (active/inactive/archived, по умолчанию active)
 * 
 * @returns {Object} Созданный объект Equipment с присвоенным ID
 * 
 * @throws {Error} Если не указано название или тип
 * 
 * Пример использования:
 * const newEquipment = addEquipment({
 *   name: "Фильтр №1",
 *   type: "filter",
 *   specs: { height: "1,5 м", diameter: "0,8 м" },
 *   status: "active"
 * });
 */
function addEquipment(data) {
  try {
    // Проверяем, что данные переданы
    if (!data) {
      Logger.log('❌ Ошибка: данные не переданы в addEquipment');
      throw new Error('Данные оборудования не переданы');
    }
    
    // Логируем входящие данные для отладки
    Logger.log('📥 Получены данные для создания оборудования:');
    Logger.log('  - data: ' + (data ? 'есть' : 'НЕТ'));
    Logger.log('  - typeof data: ' + typeof data);
    Logger.log('  - name: ' + (data.name || 'НЕ УКАЗАНО'));
    Logger.log('  - type: ' + (data.type || 'НЕ УКАЗАНО'));
    Logger.log('  - googleDriveUrl: ' + (data.googleDriveUrl || 'не указан'));
    
    // Валидация обязательных полей
    if (!data.name) {
      Logger.log('❌ Ошибка валидации: название не указано');
      throw new Error('Название обязательно');
    }
    if (!data.type) {
      Logger.log('❌ Ошибка валидации: тип не указан');
      throw new Error('Тип обязателен');
    }
    
    const sheet = getEquipmentSheet();
    
    // Генерируем уникальный UUID для нового оборудования
    const id = generateId();
    
    // Получаем текущую дату и время
    const now = new Date();
    
    // Автоматически создаем папку в Google Drive, если URL не указан
    let googleDriveUrl = data.googleDriveUrl || '';
    let qrCodeUrl = data.qrCodeUrl || '';
    
    if (!googleDriveUrl) {
      // Проверяем, что название оборудования есть перед созданием папки
      Logger.log('🔍 Проверка данных перед созданием папки:');
      Logger.log('  - data.name: ' + (data.name !== undefined ? '"' + data.name + '"' : 'undefined'));
      Logger.log('  - typeof data.name: ' + typeof data.name);
      Logger.log('  - data.name после trim: ' + (data.name ? '"' + String(data.name).trim() + '"' : 'пусто'));
      
      // Более строгая проверка
      const equipmentName = data.name;
      if (!equipmentName) {
        Logger.log('⚠️ Предупреждение: Не указано название оборудования (equipmentName is falsy), папка не будет создана');
      } else if (typeof equipmentName !== 'string') {
        Logger.log('⚠️ Предупреждение: Название оборудования не является строкой (type: ' + typeof equipmentName + '), папка не будет создана');
      } else {
        const trimmedName = equipmentName.trim();
        if (!trimmedName) {
          Logger.log('⚠️ Предупреждение: Название оборудования пустое после trim, папка не будет создана');
        } else {
          try {
            // Создаем папку с названием оборудования
            Logger.log('📁 Вызываем createDriveFolder с названием: "' + trimmedName + '"');
            Logger.log('📁 parentFolderId: ' + (data.parentFolderId || 'не указан'));
            const folderResult = createDriveFolder(trimmedName, data.parentFolderId);
            googleDriveUrl = folderResult.folderUrl;
            // Используем URL папки для QR-кода, если не указан отдельный URL
            if (!qrCodeUrl) {
              qrCodeUrl = folderResult.folderUrl;
            }
            Logger.log('✅ УСПЕШНО создана папка для оборудования: ' + trimmedName);
            Logger.log('✅ URL папки: ' + googleDriveUrl);
            Logger.log('✅ Folder ID: ' + folderResult.folderId);
          } catch (folderError) {
            // Если не удалось создать папку, логируем ошибку с подробностями
            const errorMessage = folderError.toString();
            const errorStack = folderError.stack || 'нет стека';
            Logger.log('❌ ОШИБКА при создании папки для оборудования "' + trimmedName + '"');
            Logger.log('❌ Сообщение ошибки: ' + errorMessage);
            Logger.log('❌ Стек ошибки: ' + errorStack);
            Logger.log('⚠️ Оборудование будет создано без папки. Пользователь сможет добавить ссылку на папку позже при редактировании.');
            // Продолжаем создание оборудования без папки
            // Пользователь сможет добавить ссылку на папку позже при редактировании
          }
        }
      }
    } else if (!qrCodeUrl) {
      // Если Google Drive URL указан, но QR Code URL нет, используем Google Drive URL
      qrCodeUrl = googleDriveUrl;
    }
    
    // Формируем строку для добавления в таблицу
    // Порядок колонок: ID, Название, Тип, Характеристики, Google Drive URL, 
    // QR Code URL, Дата ввода, Последнее обслуживание, Статус, Создано, Обновлено
    const row = [
      id,                                    // A: ID
      data.name,                             // B: Название
      data.type || '',                       // C: Тип
      JSON.stringify(data.specs || {}),      // D: Характеристики (JSON строка)
      googleDriveUrl,                        // E: Google Drive URL
      qrCodeUrl,                             // F: QR Code URL
      data.commissioningDate ? String(data.commissioningDate).split('T')[0] : '',          // G: Дата ввода (только YYYY-MM-DD)
      data.lastMaintenanceDate ? String(data.lastMaintenanceDate).split('T')[0] : '',        // H: Последнее обслуживание (только YYYY-MM-DD)
      data.status || 'active',               // I: Статус (по умолчанию active)
      now,                                   // J: Создано (дата и время)
      now                                    // K: Обновлено (дата и время)
    ];
    
    // Добавляем строку в конец таблицы
    sheet.appendRow(row);
    
    // Возвращаем созданный объект Equipment
    return {
      id: id,
      name: data.name,
      type: data.type,
      specs: data.specs || {},
      googleDriveUrl: googleDriveUrl,
      qrCodeUrl: qrCodeUrl,
      commissioningDate: data.commissioningDate || '',
      lastMaintenanceDate: data.lastMaintenanceDate || '',
      status: data.status || 'active',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };
  } catch (error) {
    Logger.log('Ошибка при добавлении оборудования: ' + error);
    throw error;
  }
}

/**
 * Обновить существующее оборудование
 * 
 * Находит строку с указанным ID и обновляет только те поля, которые переданы
 * в объекте data. Автоматически обновляет поле "Обновлено"
 * 
 * @param {string} id - Уникальный идентификатор оборудования
 * @param {Object} data - Объект с полями для обновления (все поля опциональны)
 * @param {string} data.name - Новое название
 * @param {string} data.type - Новый тип
 * @param {Object} data.specs - Новые характеристики
 * @param {string} data.googleDriveUrl - Новый URL Google Drive
 * @param {string} data.qrCodeUrl - Новый URL QR-кода
 * @param {string} data.commissioningDate - Новая дата ввода
 * @param {string} data.lastMaintenanceDate - Новая дата обслуживания
 * @param {string} data.status - Новый статус
 * 
 * @returns {Object} Обновленный объект Equipment
 * 
 * @throws {Error} Если оборудование с указанным ID не найдено
 * 
 * Пример использования:
 * const updated = updateEquipment('uuid', {
 *   name: "Новое название",
 *   lastMaintenanceDate: "2024-01-25"
 * });
 */
function updateEquipment(id, data) {
  try {
    const sheet = getEquipmentSheet();
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    const headers = values[0];
    
    // Ищем строку с нужным ID
    for (let i = 1; i < values.length; i++) {
      if (values[i][0] === id) {
        // Найдено! Индекс строки в Sheets (начинается с 1, поэтому +1)
        const rowIndex = i + 1;
        
        // Обновляем только те поля, которые переданы в data
        // Используем getRange(строка, колонка) для обновления конкретной ячейки
        
        if (data.name !== undefined) {
          sheet.getRange(rowIndex, 2).setValue(data.name); // Колонка B
        }
        if (data.type !== undefined) {
          sheet.getRange(rowIndex, 3).setValue(data.type); // Колонка C
        }
        if (data.specs !== undefined) {
          // Характеристики сохраняем как JSON строку
          sheet.getRange(rowIndex, 4).setValue(JSON.stringify(data.specs)); // Колонка D
        }
        if (data.googleDriveUrl !== undefined) {
          sheet.getRange(rowIndex, 5).setValue(data.googleDriveUrl); // Колонка E
        }
        if (data.qrCodeUrl !== undefined) {
          sheet.getRange(rowIndex, 6).setValue(data.qrCodeUrl); // Колонка F
        }
        if (data.commissioningDate !== undefined) {
          // Сохраняем дату как строку в формате YYYY-MM-DD
          // Это гарантирует, что Google Sheets не будет автоматически конвертировать её в Date объект
          // и дата не будет сдвигаться из-за часовых поясов
          const dateStr = data.commissioningDate ? String(data.commissioningDate).split('T')[0] : '';
          sheet.getRange(rowIndex, 7).setValue(dateStr); // Колонка G
        }
        if (data.lastMaintenanceDate !== undefined) {
          // Сохраняем дату как строку в формате YYYY-MM-DD
          const dateStr = data.lastMaintenanceDate ? String(data.lastMaintenanceDate).split('T')[0] : '';
          sheet.getRange(rowIndex, 8).setValue(dateStr); // Колонка H
        }
        if (data.status !== undefined) {
          sheet.getRange(rowIndex, 9).setValue(data.status); // Колонка I
        }
        
        // Всегда обновляем дату обновления (колонка K, индекс 11)
        sheet.getRange(rowIndex, 11).setValue(new Date());
        
        // Возвращаем обновленные данные, читая их заново из таблицы
        return getEquipmentById(id);
      }
    }
    
    // Если дошли сюда, значит ID не найден
    throw new Error('Оборудование с ID ' + id + ' не найдено');
  } catch (error) {
    Logger.log('Ошибка при обновлении оборудования: ' + error);
    throw error;
  }
}

/**
 * Удалить оборудование (мягкое удаление)
 * 
 * Не удаляет строку из таблицы, а меняет статус на "archived"
 * Это позволяет сохранить историю и при необходимости восстановить данные
 * 
 * @param {string} id - Уникальный идентификатор оборудования
 * 
 * @returns {void}
 * 
 * Пример использования:
 * deleteEquipment('uuid');
 */
/**
 * Удалить оборудование (физическое удаление)
 * 
 * Удаляет оборудование из таблицы и папку в Google Drive (если она была создана)
 * 
 * @param {string} id - UUID оборудования для удаления
 * @returns {void}
 * 
 * @throws {Error} Если оборудование не найдено или произошла ошибка
 */
function deleteEquipment(id) {
  try {
    Logger.log('🗑️ Удаление оборудования с ID: ' + id);
    
    const sheet = getEquipmentSheet();
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    
    // Ищем строку с нужным ID
    let rowIndex = -1;
    let equipment = null;
    
    for (let i = 1; i < values.length; i++) {
      if (values[i][0] === id) {
        rowIndex = i + 1; // Индекс строки в Sheets (начинается с 1)
        // Получаем данные оборудования перед удалением
        const headers = values[0];
        equipment = parseRowToEquipment(values[i], headers);
        break;
      }
    }
    
    if (rowIndex === -1) {
      throw new Error('Оборудование с ID ' + id + ' не найдено');
    }
    
    // Удаляем папку в Google Drive, если она была создана
    // Делаем это ПЕРЕД удалением строки, чтобы в случае ошибки мы могли откатить
    if (equipment && equipment.googleDriveUrl && equipment.googleDriveUrl.trim()) {
      try {
        Logger.log('📁 Попытка удалить папку в Google Drive: ' + equipment.googleDriveUrl);
        deleteDriveFolder(equipment.googleDriveUrl);
        Logger.log('✅ Папка в Google Drive успешно удалена');
      } catch (folderError) {
        Logger.log('⚠️ Предупреждение: Не удалось удалить папку в Google Drive: ' + folderError);
        Logger.log('   Ошибка: ' + folderError.toString());
        Logger.log('   Оборудование все равно будет удалено из базы данных');
        // Продолжаем удаление оборудования даже если папка не удалилась
        // Это не критическая ошибка - главное удалить оборудование из базы
      }
    } else {
      Logger.log('ℹ️ Папка в Google Drive не указана или пуста, пропускаем удаление папки');
    }
    
    // Удаляем строку из таблицы
    Logger.log('🗑️ Удаление строки из таблицы (строка ' + rowIndex + ')');
    try {
      sheet.deleteRow(rowIndex);
      Logger.log('✅ Оборудование успешно удалено из таблицы');
    } catch (deleteError) {
      Logger.log('❌ Ошибка при удалении строки из таблицы: ' + deleteError);
      throw new Error('Не удалось удалить строку из таблицы: ' + deleteError.toString());
    }
  } catch (error) {
    Logger.log('❌ Ошибка при удалении оборудования: ' + error);
    throw error;
  }
}

/**
 * Удалить папку в Google Drive по URL
 * 
 * Извлекает ID папки из URL и удаляет её
 * 
 * @param {string} folderUrl - URL папки в Google Drive
 * @returns {void}
 * 
 * @throws {Error} Если папка не найдена или не удалось удалить
 */
function deleteDriveFolder(folderUrl) {
  try {
    Logger.log('🗑️ Удаление папки в Google Drive');
    Logger.log('  - URL: ' + folderUrl);
    Logger.log('  - URL type: ' + typeof folderUrl);
    
    if (!folderUrl || !folderUrl.trim()) {
      Logger.log('⚠️ URL папки не указан, пропускаем удаление');
      return;
    }
    
    const trimmedUrl = folderUrl.trim();
    Logger.log('  - Trimmed URL: ' + trimmedUrl);
    
    // Извлекаем ID папки из URL
    // Поддерживаем разные форматы URL:
    // - https://drive.google.com/drive/folders/FOLDER_ID
    // - https://drive.google.com/open?id=FOLDER_ID
    // - FOLDER_ID (если передан напрямую ID)
    let folderId = null;
    
    // Формат 1: /folders/FOLDER_ID
    const foldersMatch = trimmedUrl.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (foldersMatch && foldersMatch[1]) {
      folderId = foldersMatch[1];
      Logger.log('  - Извлечен ID из формата /folders/: ' + folderId);
    } else {
      // Формат 2: ?id=FOLDER_ID
      const idMatch = trimmedUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      if (idMatch && idMatch[1]) {
        folderId = idMatch[1];
        Logger.log('  - Извлечен ID из формата ?id=: ' + folderId);
      } else {
        // Формат 3: возможно это уже сам ID (проверяем длину и формат)
        const idPattern = /^[a-zA-Z0-9_-]{20,}$/;
        if (idPattern.test(trimmedUrl) && !trimmedUrl.includes('/') && !trimmedUrl.includes('?')) {
          folderId = trimmedUrl;
          Logger.log('  - Используется URL как ID: ' + folderId);
        }
      }
    }
    
    if (!folderId) {
      Logger.log('⚠️ Не удалось извлечь ID папки из URL: ' + trimmedUrl);
      Logger.log('   Поддерживаемые форматы:');
      Logger.log('   - https://drive.google.com/drive/folders/FOLDER_ID');
      Logger.log('   - https://drive.google.com/open?id=FOLDER_ID');
      Logger.log('   - FOLDER_ID (прямой ID)');
      throw new Error('Неверный формат URL папки: ' + trimmedUrl);
    }
    
    Logger.log('  - Folder ID для удаления: ' + folderId);
    
    try {
      // Проверяем доступ к DriveApp
      Logger.log('🔍 Проверка доступа к Google Drive...');
      DriveApp.getRootFolder();
      Logger.log('✅ Доступ к Google Drive получен');
      
      // Получаем папку по ID
      Logger.log('📁 Получение папки по ID...');
      const folder = DriveApp.getFolderById(folderId);
      const folderName = folder.getName();
      Logger.log('  - Название папки: "' + folderName + '"');
      Logger.log('  - Folder ID подтвержден: ' + folder.getId());
      
      // Удаляем папку (перемещаем в корзину)
      Logger.log('🗑️ Перемещение папки в корзину...');
      folder.setTrashed(true);
      
      Logger.log('✅ Папка "' + folderName + '" успешно удалена (перемещена в корзину)');
      Logger.log('  - Folder ID: ' + folderId);
      Logger.log('  - Folder URL: ' + trimmedUrl);
    } catch (driveError) {
      Logger.log('❌ Ошибка при удалении папки');
      Logger.log('  - Error: ' + driveError);
      Logger.log('  - Error type: ' + typeof driveError);
      Logger.log('  - Error message: ' + driveError.toString());
      Logger.log('  - Error stack: ' + (driveError.stack || 'нет стека'));
      
      // Проверяем тип ошибки для более понятного сообщения
      const errorMessage = driveError.toString();
      if (errorMessage.includes('not found') || errorMessage.includes('не найдена')) {
        Logger.log('⚠️ Папка не найдена - возможно, она уже удалена');
        // Не пробрасываем ошибку, если папка уже удалена
        return;
      } else if (errorMessage.includes('permission') || errorMessage.includes('access')) {
        throw new Error('Нет прав на удаление папки в Google Drive. Убедитесь, что веб-приложение имеет полные права на Google Drive.');
      } else {
        throw new Error('Не удалось удалить папку в Google Drive: ' + driveError.toString());
      }
    }
  } catch (error) {
    Logger.log('❌ Ошибка в deleteDriveFolder: ' + error);
    Logger.log('  - Error type: ' + typeof error);
    Logger.log('  - Error message: ' + error.toString());
    Logger.log('  - Error stack: ' + (error.stack || 'нет стека'));
    throw error;
  }
}

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

/**
 * Получить лист "Оборудование" из текущей таблицы
 * 
 * Если лист не существует, создает его автоматически с заголовками
 * и форматированием
 * 
 * @returns {Sheet} Объект листа Google Sheets
 * 
 * Структура создаваемого листа:
 * - Заголовки в первой строке
 * - Заголовки отформатированы (жирный шрифт, синий фон, белый текст)
 * - Первая строка заморожена (остается видимой при прокрутке)
 */
function getEquipmentSheet() {
  // Получаем текущую таблицу (та, в которой открыт Apps Script)
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  
  // Пытаемся получить лист с именем "Оборудование"
  let sheet = spreadsheet.getSheetByName('Оборудование');
  
  // Если лист не существует, создаем его
  if (!sheet) {
    // Создаем новый лист
    sheet = spreadsheet.insertSheet('Оборудование');
    
    // Создаем массив заголовков в правильном порядке
    const headers = [
      'ID',                    // Колонка A
      'Название',              // Колонка B
      'Тип',                   // Колонка C
      'Характеристики',        // Колонка D
      'Google Drive URL',      // Колонка E
      'QR Code URL',           // Колонка F
      'Дата ввода',            // Колонка G
      'Последнее обслуживание', // Колонка H
      'Статус',                // Колонка I
      'Создано',               // Колонка J
      'Обновлено'              // Колонка K
    ];
    
    // Записываем заголовки в первую строку
    // getRange(строка, колонка, количество_строк, количество_колонок)
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    
    // Форматируем заголовки для лучшей читаемости
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');        // Жирный шрифт
    headerRange.setBackground('#4285f4');     // Синий фон (цвет Google)
    headerRange.setFontColor('#ffffff');       // Белый текст
    
    // Замораживаем первую строку, чтобы она оставалась видимой при прокрутке
    sheet.setFrozenRows(1);
  }
  
  return sheet;
}

/**
 * Преобразовать строку таблицы в объект Equipment
 * 
 * Парсит массив значений из строки таблицы и создает объект Equipment
 * с правильными типами данных
 * 
 * @param {Array} row - Массив значений из строки таблицы
 * @param {Array} headers - Массив заголовков колонок
 * 
 * @returns {Object|null} Объект Equipment или null при ошибке парсинга
 * 
 * Обрабатывает:
 * - JSON парсинг характеристик
 * - Форматирование дат
 * - Значения по умолчанию для пустых полей
 */
function parseRowToEquipment(row, headers) {
  try {
    const equipment = {};
    
    // Проходим по каждому заголовку и извлекаем соответствующее значение
    headers.forEach((header, index) => {
      const value = row[index];
      
      // Обрабатываем каждое поле в зависимости от его названия
      switch(header) {
        case 'ID':
          equipment.id = value;
          break;
          
        case 'Название':
          equipment.name = value;
          break;
          
        case 'Тип':
          equipment.type = value;
          break;
          
        case 'Характеристики':
          // Характеристики хранятся как JSON строка, нужно распарсить
          try {
            equipment.specs = value ? JSON.parse(value) : {};
          } catch (e) {
            // Если не удалось распарсить, используем пустой объект
            equipment.specs = {};
          }
          break;
          
        case 'Google Drive URL':
          equipment.googleDriveUrl = value || '';
          break;
          
        case 'QR Code URL':
          equipment.qrCodeUrl = value || '';
          break;
          
        case 'Дата ввода':
          // Форматируем дату в ISO формат (YYYY-MM-DD)
          // Обрабатываем пустые значения: null, undefined, пустая строка
          if (value && value !== '') {
            Logger.log('📅 Чтение даты ввода из таблицы:');
            Logger.log('  - value: ' + value);
            Logger.log('  - typeof value: ' + typeof value);
            Logger.log('  - value instanceof Date: ' + (value instanceof Date));
            
            // Если значение уже строка в формате YYYY-MM-DD, возвращаем как есть
            if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
              Logger.log('  - Это строка YYYY-MM-DD, возвращаем как есть: ' + value);
              equipment.commissioningDate = value;
            } else {
              // Иначе форматируем через formatDate
              Logger.log('  - Форматируем через formatDate...');
              const formatted = formatDate(value);
              Logger.log('  - Результат formatDate: ' + formatted);
              equipment.commissioningDate = formatted;
            }
          } else {
            equipment.commissioningDate = '';
          }
          break;
          
        case 'Последнее обслуживание':
          // Форматируем дату в ISO формат (YYYY-MM-DD)
          // Обрабатываем пустые значения: null, undefined, пустая строка
          // Если обслуживание не проводилось, ячейка может быть пустой - это нормально
          if (value && value !== '') {
            // Если значение уже строка в формате YYYY-MM-DD, возвращаем как есть
            if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
              equipment.lastMaintenanceDate = value;
            } else {
              // Иначе форматируем через formatDate
              equipment.lastMaintenanceDate = formatDate(value);
            }
          } else {
            equipment.lastMaintenanceDate = '';
          }
          break;
          
        case 'Статус':
          // Если статус не указан, используем 'active' по умолчанию
          equipment.status = value || 'active';
          break;
          
        case 'Создано':
          // Преобразуем дату в ISO строку
          equipment.createdAt = value ? new Date(value).toISOString() : '';
          break;
          
        case 'Обновлено':
          equipment.updatedAt = value ? new Date(value).toISOString() : '';
          break;
      }
    });
    
    return equipment;
  } catch (error) {
    // Если произошла ошибка при парсинге, логируем и возвращаем null
    Logger.log('Ошибка при парсинге строки: ' + error);
    return null;
  }
}

/**
 * Форматировать дату в ISO строку (YYYY-MM-DD)
 * 
 * Преобразует объект Date или строку даты в формат YYYY-MM-DD
 * для единообразного хранения и передачи дат
 * 
 * @param {Date|string} dateValue - Дата для форматирования
 * @returns {string} Дата в формате YYYY-MM-DD или пустая строка
 * 
 * Примеры:
 * formatDate(new Date('2024-01-15')) -> "2024-01-15"
 * formatDate('2024-01-15') -> "2024-01-15"
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
// ФУНКЦИИ РАБОТЫ С GOOGLE DRIVE
// ============================================================================

/**
 * Создать папку в Google Drive для оборудования
 * 
 * Создает новую папку в Google Drive с названием оборудования.
 * Папка будет содержать документацию и журнал обслуживания для оборудования.
 * 
 * @param {string} equipmentName - Название оборудования (будет использовано как имя папки)
 * @param {string} parentFolderId - (Опционально) ID родительской папки, в которой создать папку
 * @returns {Object} Объект с URL созданной папки
 * 
 * Формат возвращаемого объекта:
 * {
 *   folderId: "1a2b3c4d5e6f7g8h9i0j",
 *   folderUrl: "https://drive.google.com/drive/folders/1a2b3c4d5e6f7g8h9i0j",
 *   folderName: "Фильтр обезжелезивания ФО-0,8-1,5 №1"
 * }
 * 
 * @throws {Error} Если не удалось создать папку
 * 
 * Пример использования:
 * const result = createDriveFolder("Фильтр обезжелезивания ФО-0,8-1,5 №1");
 * // result.folderUrl можно использовать для googleDriveUrl и qrCodeUrl
 */
function createDriveFolder(equipmentName, parentFolderId) {
  try {
    Logger.log('📁 createDriveFolder вызвана');
    Logger.log('  - equipmentName: ' + (equipmentName !== undefined ? '"' + equipmentName + '"' : 'undefined'));
    Logger.log('  - typeof equipmentName: ' + typeof equipmentName);
    Logger.log('  - parentFolderId: ' + (parentFolderId || 'не указан'));
    
    // Проверяем, что название оборудования передано
    if (!equipmentName) {
      Logger.log('❌ Ошибка: equipmentName is falsy');
      throw new Error('Название оборудования не указано (equipmentName is undefined or null)');
    }
    
    // Преобразуем в строку на случай, если передано не строковое значение
    const nameString = String(equipmentName);
    Logger.log('  - nameString: "' + nameString + '"');
    
    // Очищаем название от недопустимых символов для имени папки
    // Google Drive не допускает некоторые символы: / \ : * ? " < > |
    const folderName = nameString
      .replace(/[/\\:*?"<>|]/g, '_') // Заменяем недопустимые символы на подчеркивание
      .trim();
    
    Logger.log('  - folderName после обработки: "' + folderName + '"');
    
    if (!folderName || folderName === '') {
      Logger.log('❌ Ошибка: folderName пустое после обработки');
      throw new Error('Название папки не может быть пустым после обработки');
    }
    
    // Проверяем доступность DriveApp
    Logger.log('🔍 Проверка доступа к Google Drive...');
    try {
      // Пробуем получить корневую папку для проверки доступа
      const rootFolder = DriveApp.getRootFolder();
      Logger.log('✅ Доступ к Google Drive получен');
      Logger.log('  - Root folder name: ' + rootFolder.getName());
      Logger.log('  - Root folder ID: ' + rootFolder.getId());
    } catch (accessError) {
      Logger.log('❌ Ошибка доступа к Google Drive: ' + accessError);
      Logger.log('  - Error type: ' + typeof accessError);
      Logger.log('  - Error message: ' + accessError.toString());
      Logger.log('  - Error stack: ' + (accessError.stack || 'нет стека'));
      // Не прерываем выполнение - возможно, доступ есть, но проверка не прошла
      // Попробуем создать папку напрямую
      Logger.log('⚠️ Предупреждение: Проверка доступа не прошла, но попробуем создать папку');
    }
    
    let folder;
    
    // Если указана родительская папка, создаем в ней
    if (parentFolderId) {
      try {
        const parentFolder = DriveApp.getFolderById(parentFolderId);
        folder = parentFolder.createFolder(folderName);
      } catch (error) {
        // Если родительская папка не найдена, создаем в корне
        Logger.log('Родительская папка не найдена, создаем в корне: ' + error);
        try {
          folder = DriveApp.createFolder(folderName);
        } catch (createError) {
          Logger.log('Ошибка создания папки в корне: ' + createError);
          throw new Error('Не удалось создать папку в Google Drive. Возможные причины: нет прав на создание папок, недостаточно места в Drive, или проблема с авторизацией. Проверьте логи в Google Apps Script.');
        }
      }
    } else {
      // Создаем папку в корне Google Drive
      Logger.log('📁 Создание папки в корне Google Drive: "' + folderName + '"');
      try {
        folder = DriveApp.createFolder(folderName);
        Logger.log('✅ Папка успешно создана в корне');
      } catch (createError) {
        Logger.log('❌ Ошибка создания папки в корне');
        Logger.log('  - Error: ' + createError);
        Logger.log('  - Error type: ' + typeof createError);
        Logger.log('  - Error message: ' + createError.toString());
        Logger.log('  - Error stack: ' + (createError.stack || 'нет стека'));
        // Проверяем тип ошибки для более понятного сообщения
        const errorMessage = createError.toString();
        if (errorMessage.includes('permission') || errorMessage.includes('access')) {
          throw new Error('Нет прав на создание папок в Google Drive. Убедитесь, что веб-приложение развернуто "от имени" правильного аккаунта и имеет доступ к Google Drive.');
        } else if (errorMessage.includes('quota') || errorMessage.includes('storage')) {
          throw new Error('Недостаточно места в Google Drive для создания папки.');
        } else {
          throw new Error('Не удалось создать папку в Google Drive: ' + createError.toString() + '. Проверьте логи в Google Apps Script для подробностей.');
        }
      }
    }
    
    // Получаем URL папки
    const folderUrl = folder.getUrl();
    const folderId = folder.getId();
    
    // Логируем для отладки
    Logger.log('✅ Успешно создана папка: ' + folderName + ' | URL: ' + folderUrl + ' | ID: ' + folderId);
    
    return {
      folderId: folderId,
      folderUrl: folderUrl,
      folderName: folderName
    };
  } catch (error) {
    // Логируем ошибку с подробностями
    Logger.log('❌ Ошибка при создании папки "' + equipmentName + '": ' + error.toString());
    Logger.log('Стек ошибки: ' + (error.stack || 'недоступен'));
    // Пробрасываем ошибку дальше с понятным сообщением
    throw error;
  }
}

/**
 * Получить список файлов из папки Google Drive
 * 
 * Извлекает ID папки из URL и возвращает список всех файлов в папке
 * 
 * @param {string} folderUrlOrId - URL папки или ID папки
 * @returns {Array} Массив объектов с информацией о файлах
 * 
 * Формат возвращаемого объекта:
 * {
 *   id: "file_id",
 *   name: "Название файла.pdf",
 *   url: "https://drive.google.com/file/d/...",
 *   size: 12345, // размер в байтах
 *   mimeType: "application/pdf",
 *   modifiedTime: "2024-01-15T10:30:00.000Z"
 * }
 * 
 * @throws {Error} Если папка не найдена или произошла ошибка
 */
function getFolderFiles(folderUrlOrId) {
  try {
    Logger.log('📁 Получение списка файлов из папки');
    Logger.log('  - folderUrlOrId: ' + folderUrlOrId);
    
    if (!folderUrlOrId || !folderUrlOrId.trim()) {
      throw new Error('URL или ID папки не указан');
    }
    
    const trimmed = folderUrlOrId.trim();
    let folderId = null;
    
    // Извлекаем ID папки из URL
    // Формат 1: /folders/FOLDER_ID
    const foldersMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (foldersMatch && foldersMatch[1]) {
      folderId = foldersMatch[1];
      Logger.log('  - Извлечен ID из формата /folders/: ' + folderId);
    } else {
      // Формат 2: ?id=FOLDER_ID
      const idMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      if (idMatch && idMatch[1]) {
        folderId = idMatch[1];
        Logger.log('  - Извлечен ID из формата ?id=: ' + folderId);
      } else {
        // Формат 3: возможно это уже сам ID
        const idPattern = /^[a-zA-Z0-9_-]{20,}$/;
        if (idPattern.test(trimmed) && !trimmed.includes('/') && !trimmed.includes('?')) {
          folderId = trimmed;
          Logger.log('  - Используется как ID: ' + folderId);
        }
      }
    }
    
    if (!folderId) {
      throw new Error('Неверный формат URL папки: ' + trimmed);
    }
    
    Logger.log('  - Folder ID для получения файлов: ' + folderId);
    
    // Получаем папку по ID
    const folder = DriveApp.getFolderById(folderId);
    const folderName = folder.getName();
    Logger.log('  - Название папки: "' + folderName + '"');
    
    // Получаем все файлы из папки
    const files = folder.getFiles();
    const filesList = [];
    
    while (files.hasNext()) {
      const file = files.next();
      const fileData = {
        id: file.getId(),
        name: file.getName(),
        url: file.getUrl(),
        size: file.getSize(),
        mimeType: file.getMimeType(),
        modifiedTime: file.getLastUpdated().toISOString()
      };
      filesList.push(fileData);
    }
    
    Logger.log('  - Найдено файлов: ' + filesList.length);
    
    // Сортируем по дате изменения (новые сначала)
    filesList.sort((a, b) => {
      return new Date(b.modifiedTime) - new Date(a.modifiedTime);
    });
    
    return filesList;
  } catch (error) {
    Logger.log('❌ Ошибка при получении списка файлов: ' + error.toString());
    Logger.log('  - Error stack: ' + (error.stack || 'нет стека'));
    throw error;
  }
}

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

// ============================================================================
// ФУНКЦИИ ДЛЯ РАБОТЫ С ЖУРНАЛОМ ОБСЛУЖИВАНИЯ
// ============================================================================

/**
 * Получить или создать лист "Журнал обслуживания"
 * 
 * Создает лист с заголовками, если его еще нет
 * 
 * Структура листа:
 * Колонка A: ID оборудования
 * Колонка B: ID записи
 * Колонка C: Дата обслуживания
 * Колонка D: Тип работы
 * Колонка E: Описание
 * Колонка F: Выполнил
 * Колонка G: Статус
 * Колонка H: Дата создания записи
 * 
 * @returns {Sheet} Лист "Журнал обслуживания"
 */
function getMaintenanceLogSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  
  // Пытаемся получить лист с именем "Журнал обслуживания"
  let sheet = spreadsheet.getSheetByName('Журнал обслуживания');
  
  // Если лист не существует, создаем его
  if (!sheet) {
    sheet = spreadsheet.insertSheet('Журнал обслуживания');
    
    // Создаем массив заголовков
    const headers = [
      'ID оборудования',    // Колонка A
      'ID записи',          // Колонка B
      'Дата обслуживания',  // Колонка C
      'Тип работы',         // Колонка D
      'Описание',           // Колонка E
      'Выполнил',           // Колонка F
      'Статус',             // Колонка G
      'Дата создания'       // Колонка H
    ];
    
    // Записываем заголовки в первую строку
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    
    // Форматируем заголовки
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#4285f4');
    headerRange.setFontColor('#ffffff');
    
    // Замораживаем первую строку
    sheet.setFrozenRows(1);
  }
  
  return sheet;
}

/**
 * Получить журнал обслуживания для оборудования
 * 
 * @param {string} equipmentId - ID оборудования
 * @returns {Array} Массив записей журнала обслуживания
 */
function getMaintenanceLog(equipmentId) {
  try {
    const sheet = getMaintenanceLogSheet();
    const data = sheet.getDataRange().getValues();
    
    // Пропускаем заголовок (первая строка)
    const entries = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      // Проверяем, что ID оборудования совпадает
      if (row[0] === equipmentId) {
        entries.push({
          id: row[1],                    // ID записи
          equipmentId: row[0],           // ID оборудования
          date: row[2] ? formatDate(row[2]) : '',  // Дата обслуживания
          type: row[3] || '',            // Тип работы
          description: row[4] || '',     // Описание
          performedBy: row[5] || '',     // Выполнил
          status: row[6] || 'completed', // Статус
          createdAt: row[7] ? formatDate(row[7]) : '' // Дата создания
        });
      }
    }
    
    // Сортируем по дате обслуживания (новые сверху)
    entries.sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateB - dateA;
    });
    
    return entries;
  } catch (error) {
    Logger.log('❌ Ошибка в getMaintenanceLog: ' + error.toString());
    throw new Error('Ошибка при получении журнала обслуживания: ' + error.toString());
  }
}

/**
 * Добавить запись в журнал обслуживания
 * 
 * @param {string} equipmentId - ID оборудования
 * @param {Object} entry - Данные записи
 * @param {string} entry.date - Дата обслуживания (YYYY-MM-DD)
 * @param {string} entry.type - Тип работы
 * @param {string} entry.description - Описание
 * @param {string} entry.performedBy - Кто выполнил
 * @param {string} entry.status - Статус (completed/planned)
 * @returns {Object} Созданная запись
 */
// Приватная функция (с префиксом _) - не должна вызываться напрямую из URL
function _addMaintenanceEntry(equipmentId, entry) {
  try {
    // Логируем стек вызовов для отладки
    try {
      const stack = new Error().stack;
      Logger.log('📝 ========== _addMaintenanceEntry ВЫЗВАНА ==========');
      Logger.log('  - Стек вызовов: ' + (stack || 'недоступен'));
      if (stack) {
        const stackLines = stack.split('\n');
        Logger.log('  - Вызвана из: ' + (stackLines[1] || 'неизвестно'));
        Logger.log('  - Вызвана из (строка 2): ' + (stackLines[2] || 'неизвестно'));
      }
    } catch (stackError) {
      Logger.log('  - Не удалось получить стек: ' + stackError);
    }
    
    Logger.log('📝 _addMaintenanceEntry вызвана');
    Logger.log('  - equipmentId type: ' + typeof equipmentId);
    Logger.log('  - equipmentId: ' + (equipmentId || 'НЕ УКАЗАН'));
    Logger.log('  - entry type: ' + typeof entry);
    Logger.log('  - entry: ' + (entry ? JSON.stringify(entry) : 'undefined'));
    Logger.log('  - entry is undefined: ' + (entry === undefined));
    Logger.log('  - entry is null: ' + (entry === null));
    
    if (!equipmentId) {
      Logger.log('❌ equipmentId is falsy');
      Logger.log('   equipmentId value: ' + equipmentId);
      Logger.log('   equipmentId type: ' + typeof equipmentId);
      throw new Error('ID оборудования не указан');
    }
    
    if (!entry) {
      Logger.log('❌ entry is falsy');
      Logger.log('   entry value: ' + entry);
      Logger.log('   entry type: ' + typeof entry);
      throw new Error('Данные записи не указаны');
    }
    
    Logger.log('📁 Получение листа "Журнал обслуживания"...');
    const sheet = getMaintenanceLogSheet();
    Logger.log('✅ Лист получен: ' + sheet.getName());
    
    // Генерируем уникальный ID для записи
    const entryId = generateId();
    
    // Получаем текущую дату и время
    const now = new Date();
    
    // Форматируем дату обслуживания
    let maintenanceDate = '';
    if (entry.date) {
      const date = new Date(entry.date);
      maintenanceDate = date;
    }
    
    // Добавляем новую строку
    const newRow = [
      equipmentId,                           // A: ID оборудования
      entryId,                               // B: ID записи
      maintenanceDate,                       // C: Дата обслуживания
      entry.type || '',                      // D: Тип работы
      entry.description || '',               // E: Описание
      entry.performedBy || '',               // F: Выполнил
      entry.status || 'completed',           // G: Статус
      now                                    // H: Дата создания
    ];
    
    // Добавляем строку в конец таблицы
    Logger.log('➕ Добавление строки в таблицу...');
    Logger.log('  - newRow: ' + JSON.stringify(newRow));
    sheet.appendRow(newRow);
    Logger.log('✅ Строка добавлена в таблицу');
    
    // Возвращаем созданную запись
    const result = {
      id: entryId,
      equipmentId: equipmentId,
      date: entry.date || '',
      type: entry.type || '',
      description: entry.description || '',
      performedBy: entry.performedBy || '',
      status: entry.status || 'completed',
      createdAt: now.toISOString()
    };
    
    Logger.log('✅ Запись создана: ' + JSON.stringify(result));
    return result;
  } catch (error) {
    Logger.log('❌ Ошибка в addMaintenanceEntry: ' + error.toString());
    Logger.log('   Стек ошибки: ' + (error.stack || 'нет стека'));
    throw new Error('Ошибка при добавлении записи в журнал: ' + error.toString());
  }
}

/**
 * Обновить запись в журнале обслуживания
 * 
 * @param {string} entryId - ID записи
 * @param {Object} entry - Новые данные записи
 * @returns {Object} Обновленная запись
 */
// Приватная функция (с префиксом _) - не должна вызываться напрямую из URL
function _updateMaintenanceEntry(entryId, entry) {
  try {
    if (!entryId) {
      throw new Error('ID записи не указан');
    }
    
    const sheet = getMaintenanceLogSheet();
    const data = sheet.getDataRange().getValues();
    
    // Ищем запись по ID
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] === entryId) {
        // Обновляем данные
        const row = i + 1; // Номер строки (индекс + 1)
        
        // Форматируем дату обслуживания
        if (entry.date) {
          const date = new Date(entry.date);
          sheet.getRange(row, 3).setValue(date); // C: Дата обслуживания
        }
        
        if (entry.type !== undefined) {
          sheet.getRange(row, 4).setValue(entry.type); // D: Тип работы
        }
        
        if (entry.description !== undefined) {
          sheet.getRange(row, 5).setValue(entry.description); // E: Описание
        }
        
        if (entry.performedBy !== undefined) {
          sheet.getRange(row, 6).setValue(entry.performedBy); // F: Выполнил
        }
        
        if (entry.status !== undefined) {
          sheet.getRange(row, 7).setValue(entry.status); // G: Статус
        }
        
        // Возвращаем обновленную запись
        const updatedRow = sheet.getRange(row, 1, 1, 8).getValues()[0];
        return {
          id: updatedRow[1],
          equipmentId: updatedRow[0],
          date: updatedRow[2] ? formatDate(updatedRow[2]) : '',
          type: updatedRow[3] || '',
          description: updatedRow[4] || '',
          performedBy: updatedRow[5] || '',
          status: updatedRow[6] || 'completed',
          createdAt: updatedRow[7] ? formatDate(updatedRow[7]) : ''
        };
      }
    }
    
    throw new Error('Запись с ID ' + entryId + ' не найдена');
  } catch (error) {
    Logger.log('❌ Ошибка в updateMaintenanceEntry: ' + error.toString());
    throw new Error('Ошибка при обновлении записи: ' + error.toString());
  }
}

/**
 * Удалить запись из журнала обслуживания
 * 
 * @param {string} entryId - ID записи
 * @returns {Object} Результат удаления
 */
// Приватная функция (с префиксом _) - не должна вызываться напрямую из URL
function _deleteMaintenanceEntry(entryId) {
  try {
    if (!entryId) {
      throw new Error('ID записи не указан');
    }
    
    const sheet = getMaintenanceLogSheet();
    const data = sheet.getDataRange().getValues();
    
    // Ищем запись по ID
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] === entryId) {
        // Удаляем строку
        sheet.deleteRow(i + 1);
        return { success: true, message: 'Запись удалена' };
      }
    }
    
    throw new Error('Запись с ID ' + entryId + ' не найдена');
  } catch (error) {
    Logger.log('❌ Ошибка в deleteMaintenanceEntry: ' + error.toString());
    throw new Error('Ошибка при удалении записи: ' + error.toString());
  }
}
