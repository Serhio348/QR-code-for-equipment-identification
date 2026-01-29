/**
 * EquipmentQueries.gs
 * 
 * Функции для чтения данных об оборудовании из Google Sheets
 * 
 * Этот модуль содержит функции для получения данных об оборудовании:
 * - Получение всего оборудования
 * - Получение оборудования по ID
 * - Получение оборудования по типу
 * 
 * Все функции работают с таблицей, к которой привязан проект Google Apps Script
 * через SpreadsheetApp.getActiveSpreadsheet()
 * 
 * Зависимости:
 * - getEquipmentSheet() из SheetHelpers.gs - получение листа "Оборудование"
 * - parseRowToEquipment() из SheetHelpers.gs - парсинг строки в объект Equipment
 */

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
 *   updatedAt: "2024-01-20T14:00:00.000Z",
 *   maintenanceSheetId: "...",
 *   maintenanceSheetUrl: "..."
 * }
 * 
 * Зависимости:
 * - getEquipmentSheet() из SheetHelpers.gs
 * - parseRowToEquipment() из SheetHelpers.gs
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
 * 
 * Зависимости:
 * - getEquipmentSheet() из SheetHelpers.gs
 * - parseRowToEquipment() из SheetHelpers.gs
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
 * Фильтрует все оборудование по типу (filter, pump, tank, valve, electrical, ventilation, plumbing, energy_source, industrial, other)
 * 
 * @param {string} type - Тип оборудования для фильтрации
 * @returns {Array} Массив объектов Equipment указанного типа
 * 
 * Пример использования:
 * const filters = getEquipmentByType('filter');
 * 
 * Зависимости:
 * - getAllEquipment() - использует эту функцию для получения всех записей
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

