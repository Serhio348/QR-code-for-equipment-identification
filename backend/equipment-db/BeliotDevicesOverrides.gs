/**
 * BeliotDevicesOverrides.gs
 * 
 * Модуль для работы с пользовательскими изменениями данных счетчиков Beliot
 * 
 * Хранит только пользовательские изменения (overrides):
 * - name (пользовательское имя)
 * - address (пользовательский адрес)
 * - serialNumber (серийный номер, введенный вручную)
 * - group (группа устройства)
 * - object (объект, под объектом основного меню)
 * 
 * Полные данные счетчиков получаются из Beliot API, а не хранятся здесь.
 */

/**
 * Получить или создать лист "Счетчики Beliot"
 * 
 * @returns {Sheet} Лист Google Sheets
 */
function getBeliotDevicesSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName('Счетчики Beliot');
  
  if (!sheet) {
    sheet = spreadsheet.insertSheet('Счетчики Beliot');
    
    // Заголовки колонок
    sheet.getRange(1, 1, 1, 9).setValues([[
      'deviceId',        // A: ID устройства из Beliot API (уникальный ключ)
      'name',            // B: Пользовательское имя (если изменено)
      'address',         // C: Пользовательский адрес (если изменен)
      'serialNumber',    // D: Серийный номер (если введен вручную)
      'group',           // E: Группа устройства (ХВО, АБК и т.д.)
      'object',          // F: Объект (под объектом основного меню)
      'lastSync',        // G: Дата последней синхронизации с Beliot API
      'lastModified',    // H: Дата последнего изменения пользователем
      'modifiedBy'       // I: Email пользователя, который изменил
    ]]);
    
    // Форматирование заголовков
    const headerRange = sheet.getRange(1, 1, 1, 9);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#4285f4');
    headerRange.setFontColor('#ffffff');
    
    // Установка ширины колонок
    sheet.setColumnWidth(1, 100);  // deviceId
    sheet.setColumnWidth(2, 200);   // name
    sheet.setColumnWidth(3, 200);   // address
    sheet.setColumnWidth(4, 150);   // serialNumber
    sheet.setColumnWidth(5, 150);   // group
    sheet.setColumnWidth(6, 150);   // object
    sheet.setColumnWidth(7, 150);   // lastSync
    sheet.setColumnWidth(8, 150);   // lastModified
    sheet.setColumnWidth(9, 200);   // modifiedBy
  }
  
  return sheet;
}

/**
 * Получить все пользовательские изменения счетчиков
 * 
 * @returns {Object} Объект с изменениями по deviceId
 * 
 * Формат возвращаемого объекта:
 * {
 *   "10596": {
 *     name: "Новое имя",
 *     address: "Новый адрес",
 *     serialNumber: "13001660",
 *     group: "ХВО",
 *     lastModified: 1705312800000,
 *     modifiedBy: "user@example.com"
 *   },
 *   ...
 * }
 */
function getBeliotDevicesOverrides() {
  try {
    const sheet = getBeliotDevicesSheet();
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    
    if (values.length <= 1) {
      return {};
    }
    
    const headers = values[0];
    const overrides = {};
    
    // Обрабатываем каждую строку, начиная со второй (индекс 1)
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const deviceId = String(row[0] || '').trim(); // Колонка A: deviceId
      
      if (deviceId) {
        const name = row[1] ? String(row[1]).trim() : '';
        const address = row[2] ? String(row[2]).trim() : '';
        const serialNumber = row[3] ? String(row[3]).trim() : '';
        const group = row[4] ? String(row[4]).trim() : '';
        const object = row[5] ? String(row[5]).trim() : '';
        const lastSync = row[6] ? new Date(row[6]).getTime() : null;
        const lastModified = row[7] ? new Date(row[7]).getTime() : null;
        const modifiedBy = row[8] ? String(row[8]).trim() : '';
        
        overrides[deviceId] = {
          name: name || undefined,
          address: address || undefined,
          serialNumber: serialNumber || undefined,
          group: group || undefined,
          object: object || undefined,
          lastSync: lastSync || undefined,
          lastModified: lastModified || undefined,
          modifiedBy: modifiedBy || undefined,
        };
      }
    }
    
    return overrides;
  } catch (error) {
    Logger.log('Ошибка при получении изменений счетчиков: ' + error);
    throw error;
  }
}

/**
 * Получить изменения для конкретного устройства
 * 
 * @param {string} deviceId - ID устройства из Beliot API
 * @returns {Object|null} Объект с изменениями или null
 */
function getBeliotDeviceOverride(deviceId) {
  try {
    const sheet = getBeliotDevicesSheet();
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    
    if (values.length <= 1) {
      return null;
    }
    
    const deviceIdStr = String(deviceId).trim();
    
    // Ищем строку с нужным deviceId
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      if (String(row[0] || '').trim() === deviceIdStr) {
        const name = row[1] ? String(row[1]).trim() : '';
        const address = row[2] ? String(row[2]).trim() : '';
        const serialNumber = row[3] ? String(row[3]).trim() : '';
        const group = row[4] ? String(row[4]).trim() : '';
        const object = row[5] ? String(row[5]).trim() : '';
        const lastSync = row[6] ? new Date(row[6]).getTime() : null;
        const lastModified = row[7] ? new Date(row[7]).getTime() : null;
        const modifiedBy = row[8] ? String(row[8]).trim() : '';
        
        return {
          name: name || undefined,
          address: address || undefined,
          serialNumber: serialNumber || undefined,
          group: group || undefined,
          object: object || undefined,
          lastSync: lastSync || undefined,
          lastModified: lastModified || undefined,
          modifiedBy: modifiedBy || undefined,
        };
      }
    }
    
    return null;
  } catch (error) {
    Logger.log('Ошибка при получении изменений для устройства ' + deviceId + ': ' + error);
    throw error;
  }
}

/**
 * Сохранить изменения для устройства
 * 
 * @param {string} deviceId - ID устройства из Beliot API
 * @param {Object} data - Данные для сохранения
 *   - name (string, optional) - Пользовательское имя
 *   - address (string, optional) - Пользовательский адрес
 *   - serialNumber (string, optional) - Серийный номер
 *   - group (string, optional) - Группа устройства
 *   - modifiedBy (string, optional) - Email пользователя
 * @returns {Object} Сохраненные данные
 */
function saveBeliotDeviceOverride(deviceId, data) {
  try {
    Logger.log('💾 saveBeliotDeviceOverride: Начало сохранения для deviceId=' + deviceId);
    Logger.log('💾 Данные для сохранения: ' + JSON.stringify(data));
    
    const sheet = getBeliotDevicesSheet();
    Logger.log('✅ Лист "Счетчики Beliot" получен');
    Logger.log('📊 Имя листа: ' + sheet.getName());
    Logger.log('📊 ID листа: ' + sheet.getSheetId());
    
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    Logger.log('📊 Текущее количество строк в листе: ' + values.length);
    
    const deviceIdStr = String(deviceId).trim();
    if (!deviceIdStr) {
      throw new Error('deviceId не может быть пустым');
    }
    
    // Ищем существующую строку
    let rowIndex = -1;
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0] || '').trim() === deviceIdStr) {
        rowIndex = i + 1; // Индекс строки в Sheets (начинается с 1)
        Logger.log('📊 Найдена существующая строка для deviceId=' + deviceIdStr + ' в строке ' + rowIndex);
        break;
      }
    }
    
    if (rowIndex === -1) {
      Logger.log('📊 Строка для deviceId=' + deviceIdStr + ' не найдена, будет создана новая');
    }
    
    const now = new Date();
    const modifiedBy = data.modifiedBy || '';
    
    if (rowIndex > 0) {
      // Обновляем существующую строку
      if (data.name !== undefined) {
        sheet.getRange(rowIndex, 2).setValue(data.name || ''); // Колонка B: name
      }
      if (data.address !== undefined) {
        sheet.getRange(rowIndex, 3).setValue(data.address || ''); // Колонка C: address
      }
      if (data.serialNumber !== undefined) {
        sheet.getRange(rowIndex, 4).setValue(data.serialNumber || ''); // Колонка D: serialNumber
      }
      if (data.group !== undefined) {
        sheet.getRange(rowIndex, 5).setValue(data.group || ''); // Колонка E: group
      }
      if (data.object !== undefined) {
        sheet.getRange(rowIndex, 6).setValue(data.object || ''); // Колонка F: object
        Logger.log('✅ Обновлено поле object: ' + (data.object || ''));
      }
      sheet.getRange(rowIndex, 7).setValue(now); // Колонка G: lastSync
      sheet.getRange(rowIndex, 8).setValue(now); // Колонка H: lastModified
      if (modifiedBy) {
        sheet.getRange(rowIndex, 9).setValue(modifiedBy); // Колонка I: modifiedBy
      }
      Logger.log('✅ Существующая строка обновлена в строке ' + rowIndex);
    } else {
      // Создаем новую строку
      const newRow = [
        deviceIdStr,                    // A: deviceId
        data.name || '',                // B: name
        data.address || '',             // C: address
        data.serialNumber || '',        // D: serialNumber
        data.group || '',               // E: group
        data.object || '',              // F: object
        now,                            // G: lastSync
        now,                            // H: lastModified
        modifiedBy,                     // I: modifiedBy
      ];
      Logger.log('📊 Создаем новую строку: ' + JSON.stringify(newRow));
      sheet.appendRow(newRow);
      Logger.log('✅ Новая строка добавлена в лист');
      rowIndex = sheet.getLastRow();
      Logger.log('📊 Номер новой строки: ' + rowIndex);
    }
    
    // Проверяем, что данные действительно сохранились
    const savedRow = sheet.getRange(rowIndex, 1, 1, 9).getValues()[0];
    Logger.log('📊 Проверка сохраненных данных в строке ' + rowIndex + ':');
    Logger.log('   deviceId: ' + savedRow[0]);
    Logger.log('   name: ' + savedRow[1]);
    Logger.log('   address: ' + savedRow[2]);
    Logger.log('   serialNumber: ' + savedRow[3]);
    Logger.log('   group: ' + savedRow[4]);
    Logger.log('   object: ' + savedRow[5]);
    Logger.log('   lastSync: ' + savedRow[6]);
    Logger.log('   lastModified: ' + savedRow[7]);
    Logger.log('   modifiedBy: ' + savedRow[8]);
    
    // Возвращаем сохраненные данные
    const result = {
      deviceId: deviceIdStr,
      name: data.name || undefined,
      address: data.address || undefined,
      serialNumber: data.serialNumber || undefined,
      group: data.group || undefined,
      object: data.object || undefined,
      lastSync: now.getTime(),
      lastModified: now.getTime(),
      modifiedBy: modifiedBy || undefined,
    };
    Logger.log('✅ saveBeliotDeviceOverride завершено успешно');
    return result;
  } catch (error) {
    Logger.log('❌ Ошибка при сохранении изменений для устройства ' + deviceId + ': ' + error);
    Logger.log('❌ Стек ошибки: ' + (error.stack || 'нет стека'));
    throw error;
  }
}

/**
 * Сохранить несколько изменений за раз
 * 
 * @param {Object} overrides - Объект с изменениями по deviceId
 *   Формат: { "10596": { name: "...", address: "..." }, ... }
 * @param {string} modifiedBy - Email пользователя (опционально)
 * @returns {Object} Результат сохранения
 */
function saveBeliotDevicesOverrides(overrides, modifiedBy) {
  try {
    const results = {};
    const now = new Date();
    
    for (const deviceId in overrides) {
      if (overrides.hasOwnProperty(deviceId)) {
        const data = {
          ...overrides[deviceId],
          modifiedBy: modifiedBy || overrides[deviceId].modifiedBy,
        };
        results[deviceId] = saveBeliotDeviceOverride(deviceId, data);
      }
    }
    
    return {
      success: true,
      saved: Object.keys(results).length,
      results: results,
    };
  } catch (error) {
    Logger.log('Ошибка при массовом сохранении изменений: ' + error);
    throw error;
  }
}

/**
 * Удалить изменения для устройства
 * 
 * @param {string} deviceId - ID устройства
 * @returns {boolean} true если удалено успешно
 */
function deleteBeliotDeviceOverride(deviceId) {
  try {
    const sheet = getBeliotDevicesSheet();
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    
    const deviceIdStr = String(deviceId).trim();
    
    // Ищем строку с нужным deviceId
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0] || '').trim() === deviceIdStr) {
        const rowIndex = i + 1; // Индекс строки в Sheets (начинается с 1)
        sheet.deleteRow(rowIndex);
        return true;
      }
    }
    
    return false;
  } catch (error) {
    Logger.log('Ошибка при удалении изменений для устройства ' + deviceId + ': ' + error);
    throw error;
  }
}

/**
 * Очистить все изменения (использовать с осторожностью!)
 * 
 * @returns {number} Количество удаленных строк
 */
function clearAllBeliotDevicesOverrides() {
  try {
    const sheet = getBeliotDevicesSheet();
    const lastRow = sheet.getLastRow();
    
    if (lastRow > 1) {
      // Удаляем все строки кроме заголовка
      sheet.deleteRows(2, lastRow - 1);
      return lastRow - 1;
    }
    
    return 0;
  } catch (error) {
    Logger.log('Ошибка при очистке всех изменений: ' + error);
    throw error;
  }
}

