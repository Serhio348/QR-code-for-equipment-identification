/**
 * MaintenanceLog.gs
 * 
 * Функции для работы с журналом обслуживания оборудования
 * 
 * Этот модуль содержит функции для управления записями журнала обслуживания:
 * - Получение журнала обслуживания для оборудования
 * - Добавление, обновление и удаление записей
 * - Синхронизация с индивидуальными файлами журнала в папках оборудования
 * 
 * Все функции работают с таблицей, к которой привязан проект Google Apps Script
 * через SpreadsheetApp.getActiveSpreadsheet()
 * 
 * Зависимости:
 * - generateId() и formatDate() из Utils.gs
 * - getEquipmentSheet() из SheetHelpers.gs
 * - getEquipmentById() из EquipmentQueries.gs
 * - extractDriveIdFromUrl() из DriveOperations.gs
 * - updateEquipment() из EquipmentMutations.gs (используется через updateEquipmentMaintenanceSheetInfo)
 */

// ============================================================================
// ФУНКЦИИ РАБОТЫ С ЖУРНАЛОМ ОБСЛУЖИВАНИЯ
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
 * Колонка I: Файлы (JSON массив ссылок на файлы)
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
      'Дата создания',      // Колонка H
      'Файлы'              // Колонка I (JSON массив ссылок на файлы)
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
 * @param {string} maintenanceSheetId - (Опционально) ID листа журнала обслуживания для использования вместо основного листа
 * @returns {Array} Массив записей журнала обслуживания
 * 
 * Зависимости:
 * - getMaintenanceLogSheet() - получение основного листа журнала
 * - formatDate() из Utils.gs - форматирование дат
 */
function getMaintenanceLog(equipmentId, maintenanceSheetId) {
  try {
    Logger.log('📋 getMaintenanceLog вызвана: equipmentId="' + equipmentId + '", maintenanceSheetId=' + (maintenanceSheetId || 'не указан'));
    
    // Нормализуем equipmentId для сравнения
    const normalizedEquipmentId = equipmentId ? String(equipmentId).trim() : '';
    Logger.log('  - normalizedEquipmentId: "' + normalizedEquipmentId + '"');
    
    // В веб-приложении журнал всегда читается из основного листа с фильтрацией по equipmentId.
    // Ранее здесь была попытка SpreadsheetApp.openById(maintenanceSheetId), но затем все равно
    // использовался основной лист — это добавляло лишнюю задержку и таймауты.
    const useMainSheet = true;
    const sheet = getMaintenanceLogSheet();
    
    const lastRow = sheet.getLastRow();
    Logger.log('  - Всего строк в листе: ' + lastRow);
    if (lastRow <= 1) {
      Logger.log('ℹ️ Лист журнала пуст (только заголовок)');
      return [];
    }

    // Читаем только нужные 9 колонок и без строки заголовка
    const data = sheet.getRange(2, 1, lastRow - 1, 9).getValues();

    const entries = [];
    let matchedRows = 0;
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      
      // Основной лист "Журнал обслуживания"
      // A: equipmentId, B: entryId, C: date, D: type, E: description, F: performedBy, G: status, H: createdAt, I: files
      const rowEquipmentId = row[0] ? String(row[0]).trim() : '';

      // Строгое сравнение нормализованных ID (без частичного совпадения)
      if (rowEquipmentId === normalizedEquipmentId && rowEquipmentId !== '') {
        entries.push({
          id: row[1] ? String(row[1]).trim() : '',
          equipmentId: equipmentId,
          date: row[2] ? formatDate(row[2]) : '',
          type: row[3] ? String(row[3]).trim() : '',
          description: row[4] ? String(row[4]).trim() : '',
          performedBy: row[5] ? String(row[5]).trim() : '',
          status: row[6] ? String(row[6]).trim() : 'completed',
          createdAt: row[7] ? formatDate(row[7]) : '',
          files: row[8] ? (function() { try { return JSON.parse(row[8]); } catch(e) { return []; } })() : []
        });
        matchedRows++;
      }
    }
    
    Logger.log('  - Найдено записей: ' + matchedRows);
    Logger.log('  - Записей в массиве: ' + entries.length);
    Logger.log('  - Использовался основной лист: ' + useMainSheet);
    Logger.log('  - maintenanceSheetId был указан: ' + (maintenanceSheetId ? 'ДА (' + maintenanceSheetId + ')' : 'НЕТ'));
    
    if (matchedRows > 0) {
      Logger.log('✅ Найдено ' + matchedRows + ' записей для equipmentId="' + normalizedEquipmentId + '"');
    } else {
      Logger.log('ℹ️ Записи для equipmentId="' + normalizedEquipmentId + '" не найдены');
    }
    
    // Сортируем по дате обслуживания (новые сверху)
    entries.sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateB - dateA;
    });
    
    Logger.log('  - Возвращаем ' + entries.length + ' записей');
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
 * 
 * Зависимости:
 * - generateId() из Utils.gs
 * - getMaintenanceLogSheet() - получение листа журнала
 * - getEquipmentById() из EquipmentQueries.gs
 * - syncMaintenanceEntryFile() - синхронизация с файлом в папке оборудования
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

    // Получаем данные оборудования, чтобы при необходимости синхронизировать файл в папке
    let equipment = null;
    try {
      equipment = getEquipmentById(equipmentId);
      if (!equipment) {
        Logger.log('⚠️ Оборудование с ID "' + equipmentId + '" не найдено при добавлении записи');
      }
    } catch (equipmentError) {
      Logger.log('⚠️ Ошибка при получении оборудования для синхронизации журнала: ' + equipmentError);
    }
    
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
      now,                                   // H: Дата создания
      entry.files ? JSON.stringify(entry.files) : '' // I: Файлы
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
      createdAt: now.toISOString(),
      files: entry.files || []
    };

    Logger.log('✅ Запись создана: ' + JSON.stringify(result));

    // Пытаемся создать/обновить файл журнала в папке оборудования
    try {
      syncMaintenanceEntryFile(equipment, result);
    } catch (syncError) {
      Logger.log('⚠️ Не удалось синхронизировать запись с файлом в папке: ' + syncError);
    }

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
 * 
 * Зависимости:
 * - getMaintenanceLogSheet() - получение листа журнала
 * - formatDate() из Utils.gs - форматирование дат
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

        if (entry.files !== undefined) {
          sheet.getRange(row, 9).setValue(JSON.stringify(entry.files)); // I: Файлы
        }

        // Возвращаем обновленную запись
        const updatedRow = sheet.getRange(row, 1, 1, 9).getValues()[0];
        return {
          id: updatedRow[1],
          equipmentId: updatedRow[0],
          date: updatedRow[2] ? formatDate(updatedRow[2]) : '',
          type: updatedRow[3] || '',
          description: updatedRow[4] || '',
          performedBy: updatedRow[5] || '',
          status: updatedRow[6] || 'completed',
          createdAt: updatedRow[7] ? formatDate(updatedRow[7]) : '',
          files: updatedRow[8] ? (function() { try { return JSON.parse(updatedRow[8]); } catch(e) { return []; } })() : []
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
 * 
 * Зависимости:
 * - getMaintenanceLogSheet() - получение листа журнала
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
        // Запоминаем equipmentId перед удалением, чтобы найти отдельный файл журнала
        var equipmentId = data[i][0] ? String(data[i][0]).trim() : '';

        // Удаляем строку из основного листа
        sheet.deleteRow(i + 1);
        Logger.log('✅ Запись ' + entryId + ' удалена из основного листа');

        // Удаляем запись из отдельного файла журнала оборудования
        if (equipmentId) {
          try {
            var equipment = getEquipmentById(equipmentId);
            if (equipment && equipment.maintenanceSheetId) {
              deleteEntryFromEquipmentMaintenanceSheet(equipment.maintenanceSheetId, entryId);
            }
          } catch (syncError) {
            Logger.log('⚠️ Не удалось удалить запись из файла журнала оборудования: ' + syncError);
          }
        }

        return { success: true, message: 'Запись удалена' };
      }
    }

    throw new Error('Запись с ID ' + entryId + ' не найдена');
  } catch (error) {
    Logger.log('❌ Ошибка в deleteMaintenanceEntry: ' + error.toString());
    throw new Error('Ошибка при удалении записи: ' + error.toString());
  }
}

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ РАБОТЫ С ИНДИВИДУАЛЬНЫМИ ФАЙЛАМИ ЖУРНАЛА
// ============================================================================

/**
 * Синхронизирует запись журнала с индивидуальным файлом в папке оборудования
 *
 * @param {Object|null} equipment - Объект оборудования
 * @param {Object} entry - Созданная запись журнала
 * 
 * Зависимости:
 * - getOrCreateEquipmentMaintenanceSheet() - получение/создание файла журнала
 * - appendEntryToEquipmentMaintenanceSheet() - добавление записи в файл
 */
function syncMaintenanceEntryFile(equipment, entry) {
  if (!equipment) {
    Logger.log('ℹ️ Оборудование не найдено, пропускаем синхронизацию файла журнала');
    return;
  }

  if (!equipment.googleDriveUrl) {
    Logger.log('ℹ️ У оборудования "' + (equipment.name || equipment.id) + '" нет ссылки на папку Google Drive, пропускаем создание файла журнала');
    return;
  }

  const maintenanceSheetInfo = getOrCreateEquipmentMaintenanceSheet(equipment);
  if (!maintenanceSheetInfo || !maintenanceSheetInfo.sheet) {
    Logger.log('⚠️ Не удалось получить или создать файл журнала для оборудования "' + (equipment.name || equipment.id) + '"');
    return;
  }

  appendEntryToEquipmentMaintenanceSheet(maintenanceSheetInfo.sheet, entry);
}

/**
 * Получает или создает отдельный файл (Google Sheet) журнала обслуживания для оборудования
 *
 * @param {Object} equipment - Объект оборудования
 * @returns {Object|null} { spreadsheet, sheet, sheetId, sheetUrl } или null при ошибке
 * 
 * Зависимости:
 * - extractDriveIdFromUrl() из DriveOperations.gs
 * - buildMaintenanceSheetName() - формирование названия файла
 * - setupMaintenanceSheetHeaders() - настройка заголовков
 * - updateEquipmentMaintenanceSheetInfo() - сохранение информации о файле
 */
function getOrCreateEquipmentMaintenanceSheet(equipment) {
  try {
    const folderId = extractDriveIdFromUrl(equipment.googleDriveUrl);
    if (!folderId) {
      Logger.log('⚠️ Не удалось извлечь ID папки из URL: ' + equipment.googleDriveUrl);
      return null;
    }

    let spreadsheet = null;
    let existingSheetId = equipment.maintenanceSheetId ? String(equipment.maintenanceSheetId).trim() : '';

    if (existingSheetId) {
      try {
        spreadsheet = SpreadsheetApp.openById(existingSheetId);
      } catch (openError) {
        Logger.log('⚠️ Не удалось открыть существующий файл журнала (' + existingSheetId + '), будет создан новый: ' + openError);
        spreadsheet = null;
        existingSheetId = '';
      }
    }

    if (!spreadsheet) {
      Logger.log('📄 Создаем новый файл журнала обслуживания для оборудования "' + (equipment.name || equipment.id) + '"');
      const name = buildMaintenanceSheetName(equipment);
      spreadsheet = SpreadsheetApp.create(name);

      try {
        const file = DriveApp.getFileById(spreadsheet.getId());
        const folder = DriveApp.getFolderById(folderId);
        file.moveTo(folder);
        Logger.log('✅ Файл журнала перемещен в папку оборудования');
      } catch (folderError) {
        Logger.log('⚠️ Не удалось переместить файл журнала в папку оборудования: ' + folderError);
      }

      const sheet = spreadsheet.getSheets()[0];
      sheet.setName('Журнал');
      setupMaintenanceSheetHeaders(sheet);

      const sheetUrl = spreadsheet.getUrl();
      updateEquipmentMaintenanceSheetInfo(equipment.id, spreadsheet.getId(), sheetUrl);

      return {
        spreadsheet,
        sheet,
        sheetId: spreadsheet.getId(),
        sheetUrl
      };
    }

    const sheet = spreadsheet.getSheets()[0];
    setupMaintenanceSheetHeaders(sheet);
    const sheetUrl = equipment.maintenanceSheetUrl || spreadsheet.getUrl();

    if (!equipment.maintenanceSheetUrl) {
      updateEquipmentMaintenanceSheetInfo(equipment.id, spreadsheet.getId(), sheetUrl);
    }

    return {
      spreadsheet,
      sheet,
      sheetId: spreadsheet.getId(),
      sheetUrl
    };
  } catch (error) {
    Logger.log('⚠️ Ошибка при подготовке файла журнала оборудования: ' + error);
    return null;
  }
}

/**
 * Формирует человекочитаемое название файла журнала
 *
 * @param {Object} equipment - Объект оборудования
 * @returns {string} Название файла
 */
function buildMaintenanceSheetName(equipment) {
  const baseName = equipment && equipment.name ? String(equipment.name).trim() : equipment.id;
  const safeName = baseName || 'Оборудование';
  const fullName = 'Журнал обслуживания - ' + safeName;
  // Ограничиваем длину, чтобы избежать ошибок именования
  return fullName.substring(0, 100);
}

/**
 * Настраивает заголовки листа журнала обслуживания (идемпотентно)
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 */
function setupMaintenanceSheetHeaders(sheet) {
  const headers = [
    'Дата обслуживания',
    'Тип работы',
    'Описание',
    'Выполнил',
    'Статус',
    'Создано системой',
    'ID записи'
  ];

  const requiredColumns = headers.length;
  const lastRow = sheet.getLastRow();

  let needsHeader = lastRow === 0;
  if (!needsHeader) {
    const existing = sheet.getRange(1, 1, 1, requiredColumns).getValues()[0];
    needsHeader = headers.some((header, index) => existing[index] !== header);
    if (needsHeader) {
      sheet.insertRows(1);
    }
  }

  if (needsHeader) {
    sheet.getRange(1, 1, 1, requiredColumns).setValues([headers]);
    const headerRange = sheet.getRange(1, 1, 1, requiredColumns);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#f1f3f4');
  }

  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, requiredColumns);
}

/**
 * Добавляет запись в файл журнала обслуживания оборудования
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {Object} entry
 * 
 * Зависимости:
 * - formatDate() из Utils.gs - форматирование дат
 */
function appendEntryToEquipmentMaintenanceSheet(sheet, entry) {
  if (!sheet || !entry) {
    return;
  }

  const createdAt = entry.createdAt ? new Date(entry.createdAt) : new Date();

  const row = [
    entry.date || '',
    entry.type || '',
    entry.description || '',
    entry.performedBy || '',
    entry.status || 'completed',
    formatDate(createdAt),
    entry.id
  ];

  sheet.appendRow(row);
}

/**
 * Удаляет запись из отдельного файла журнала обслуживания оборудования по ID записи.
 *
 * Структура отдельного файла:
 * Колонка G (индекс 6): ID записи
 *
 * @param {string} maintenanceSheetId - ID Google Spreadsheet файла журнала
 * @param {string} entryId - ID записи для удаления
 */
function deleteEntryFromEquipmentMaintenanceSheet(maintenanceSheetId, entryId) {
  if (!maintenanceSheetId || !entryId) {
    return;
  }

  try {
    var spreadsheet = SpreadsheetApp.openById(maintenanceSheetId);
    var sheet = spreadsheet.getSheets()[0];
    var data = sheet.getDataRange().getValues();

    // Колонка G (индекс 6) содержит ID записи
    for (var i = 1; i < data.length; i++) {
      var rowEntryId = data[i][6] ? String(data[i][6]).trim() : '';
      if (rowEntryId === entryId) {
        sheet.deleteRow(i + 1);
        Logger.log('✅ Запись ' + entryId + ' удалена из отдельного файла журнала (' + maintenanceSheetId + ')');
        return;
      }
    }

    Logger.log('ℹ️ Запись ' + entryId + ' не найдена в отдельном файле журнала (' + maintenanceSheetId + ')');
  } catch (error) {
    Logger.log('⚠️ Ошибка при удалении из отдельного файла журнала: ' + error);
  }
}

/**
 * Сохраняет информацию о файле журнала в строке оборудования
 *
 * @param {string} equipmentId
 * @param {string} sheetId
 * @param {string} sheetUrl
 * 
 * Зависимости:
 * - getEquipmentSheet() из SheetHelpers.gs
 * 
 * Примечание: Эта функция обновляет данные оборудования напрямую в таблице,
 * но для полной синхронизации рекомендуется использовать updateEquipment() из EquipmentMutations.gs
 */
function updateEquipmentMaintenanceSheetInfo(equipmentId, sheetId, sheetUrl) {
  if (!equipmentId) {
    return;
  }

  const sheet = getEquipmentSheet();
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === equipmentId) {
      const rowIndex = i + 1;
      if (sheetId !== undefined) {
        sheet.getRange(rowIndex, 12).setValue(sheetId);
      }
      if (sheetUrl !== undefined) {
        sheet.getRange(rowIndex, 13).setValue(sheetUrl);
      }
      sheet.getRange(rowIndex, 11).setValue(new Date());
      return;
    }
  }
}

