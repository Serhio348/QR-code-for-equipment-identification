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
 * Обработка GET запросов
 * 
 * GET запросы используются для чтения данных из таблицы
 * 
 * Поддерживаемые действия:
 * - getAll - получить все оборудование
 * - getById - получить оборудование по ID
 * - getByType - получить оборудование по типу
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
 */
function doGet(e) {
  try {
    // Получаем параметр action из URL
    const action = e.parameter.action;
    
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
        // Получить оборудование определенного типа (filter, pump, tank и т.д.)
        const type = e.parameter.type;
        if (!type) {
          return createErrorResponse('Тип не указан');
        }
        return createJsonResponse(getEquipmentByType(type));
      
      default:
        // Если действие не распознано, возвращаем ошибку
        return createErrorResponse('Неизвестное действие. Используйте: getAll, getById, getByType');
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
 * - delete - удалить оборудование (мягкое удаление - меняет статус на archived)
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
    // Парсим JSON данные из тела запроса
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    
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
        // Удалить оборудование (мягкое удаление)
        if (!data.id) {
          return createErrorResponse('ID не указан');
        }
        deleteEquipment(data.id);
        return createJsonResponse({ success: true, message: 'Оборудование удалено' });
      
      default:
        // Если действие не распознано, возвращаем ошибку
        return createErrorResponse('Неизвестное действие. Используйте: add, update, delete');
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
 * Фильтрует все оборудование по типу (filter, pump, tank, valve, other)
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
    // Валидация обязательных полей
    if (!data.name) {
      throw new Error('Название обязательно');
    }
    if (!data.type) {
      throw new Error('Тип обязателен');
    }
    
    const sheet = getEquipmentSheet();
    
    // Генерируем уникальный UUID для нового оборудования
    const id = generateId();
    
    // Получаем текущую дату и время
    const now = new Date();
    
    // Формируем строку для добавления в таблицу
    // Порядок колонок: ID, Название, Тип, Характеристики, Google Drive URL, 
    // QR Code URL, Дата ввода, Последнее обслуживание, Статус, Создано, Обновлено
    const row = [
      id,                                    // A: ID
      data.name,                             // B: Название
      data.type || '',                       // C: Тип
      JSON.stringify(data.specs || {}),      // D: Характеристики (JSON строка)
      data.googleDriveUrl || '',             // E: Google Drive URL
      data.qrCodeUrl || '',                  // F: QR Code URL
      data.commissioningDate || '',          // G: Дата ввода
      data.lastMaintenanceDate || '',        // H: Последнее обслуживание
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
      googleDriveUrl: data.googleDriveUrl || '',
      qrCodeUrl: data.qrCodeUrl || '',
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
          sheet.getRange(rowIndex, 7).setValue(data.commissioningDate); // Колонка G
        }
        if (data.lastMaintenanceDate !== undefined) {
          sheet.getRange(rowIndex, 8).setValue(data.lastMaintenanceDate); // Колонка H
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
function deleteEquipment(id) {
  try {
    // Используем функцию updateEquipment для изменения статуса
    updateEquipment(id, { status: 'archived' });
  } catch (error) {
    Logger.log('Ошибка при удалении оборудования: ' + error);
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
          equipment.commissioningDate = (value && value !== '') ? formatDate(value) : '';
          break;
          
        case 'Последнее обслуживание':
          // Форматируем дату в ISO формат (YYYY-MM-DD)
          // Обрабатываем пустые значения: null, undefined, пустая строка
          // Если обслуживание не проводилось, ячейка может быть пустой - это нормально
          equipment.lastMaintenanceDate = (value && value !== '') ? formatDate(value) : '';
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
    // Создаем объект Date из переданного значения
    const date = new Date(dateValue);
    
    // Проверяем, что дата валидна (не Invalid Date)
    if (isNaN(date.getTime())) {
      return '';
    }
    
    // Преобразуем в ISO строку и берем только часть с датой (до 'T')
    // Например: "2024-01-15T10:30:00.000Z" -> "2024-01-15"
    return date.toISOString().split('T')[0];
  } catch (e) {
    // При любой ошибке возвращаем пустую строку
    // Это безопасно - пустая дата не вызовет проблем в приложении
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
  return ContentService
    .createTextOutput(JSON.stringify({
      success: false,
      error: message
    }))
    .setMimeType(ContentService.MimeType.JSON);
}
