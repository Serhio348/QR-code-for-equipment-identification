/**
 * SheetHelpers.gs
 * 
 * Функции для работы с листами Google Sheets
 * 
 * Этот модуль содержит функции для работы с листами таблицы:
 * - Получение/создание листа "Оборудование"
 * - Парсинг строк таблицы в объекты Equipment
 * - Настройка заголовков и форматирования
 * 
 * Все функции работают с таблицей, к которой привязан проект Google Apps Script
 * через SpreadsheetApp.getActiveSpreadsheet()
 */

// ============================================================================
// ФУНКЦИИ РАБОТЫ С ЛИСТАМИ
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
 * 
 * Зависимости:
 * - SpreadsheetApp.getActiveSpreadsheet() - получает таблицу, к которой привязан проект
 */
function getEquipmentSheet() {
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
    'Обновлено',             // Колонка K
    'Maintenance Sheet ID',  // Колонка L
    'Maintenance Sheet URL'  // Колонка M
  ];

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName('Оборудование');

  if (!sheet) {
    sheet = spreadsheet.insertSheet('Оборудование');
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#4285f4');
    headerRange.setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    return sheet;
  }

  // Проверяем, есть ли все необходимые заголовки
  // Если были добавлены новые колонки, добавляем их автоматически
  const currentLastColumn = sheet.getLastColumn();
  if (currentLastColumn < headers.length) {
    const missingHeaders = headers.slice(currentLastColumn);
    const newHeaderRange = sheet.getRange(1, currentLastColumn + 1, 1, missingHeaders.length);
    newHeaderRange.setValues([missingHeaders]);
    newHeaderRange.setFontWeight('bold');
    newHeaderRange.setBackground('#4285f4');
    newHeaderRange.setFontColor('#ffffff');
  }

  return sheet;
}

// ============================================================================
// ФУНКЦИИ ПАРСИНГА ДАННЫХ
// ============================================================================

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
 * - Форматирование дат (использует formatDate из Utils.gs)
 * - Значения по умолчанию для пустых полей
 * 
 * Зависимости:
 * - formatDate() из Utils.gs - для форматирования дат
 * 
 * Структура возвращаемого объекта:
 * {
 *   id: string,
 *   name: string,
 *   type: string,
 *   specs: object,
 *   googleDriveUrl: string,
 *   qrCodeUrl: string,
 *   commissioningDate: string (YYYY-MM-DD),
 *   lastMaintenanceDate: string (YYYY-MM-DD),
 *   status: string,
 *   createdAt: string (ISO 8601),
 *   updatedAt: string (ISO 8601),
 *   maintenanceSheetId: string,
 *   maintenanceSheetUrl: string
 * }
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
              // Иначе форматируем через formatDate из Utils.gs
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
              // Иначе форматируем через formatDate из Utils.gs
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

        case 'Maintenance Sheet ID':
          equipment.maintenanceSheetId = value || '';
          break;

        case 'Maintenance Sheet URL':
          equipment.maintenanceSheetUrl = value || '';
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

