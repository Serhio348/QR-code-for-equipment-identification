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
    sheet.getRange(1, 1, 1, 8).setValues([[
      'deviceId',        // A: ID устройства из Beliot API (уникальный ключ)
      'name',            // B: Пользовательское имя (если изменено)
      'address',         // C: Пользовательский адрес (если изменен)
      'serialNumber',    // D: Серийный номер (если введен вручную)
      'group',           // E: Группа устройства (ХВО, АБК и т.д.)
      'lastSync',        // F: Дата последней синхронизации с Beliot API
      'lastModified',    // G: Дата последнего изменения пользователем
      'modifiedBy'       // H: Email пользователя, который изменил
    ]]);
    
    // Форматирование заголовков
    const headerRange = sheet.getRange(1, 1, 1, 8);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#4285f4');
    headerRange.setFontColor('#ffffff');
    
    // Установка ширины колонок
    sheet.setColumnWidth(1, 100);  // deviceId
    sheet.setColumnWidth(2, 200);   // name
    sheet.setColumnWidth(3, 200);   // address
    sheet.setColumnWidth(4, 150);   // serialNumber
    sheet.setColumnWidth(5, 150);   // group
    sheet.setColumnWidth(6, 150);   // lastSync
    sheet.setColumnWidth(7, 150);   // lastModified
    sheet.setColumnWidth(8, 200);   // modifiedBy
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
        const lastSync = row[5] ? new Date(row[5]).getTime() : null;
        const lastModified = row[6] ? new Date(row[6]).getTime() : null;
        const modifiedBy = row[7] ? String(row[7]).trim() : '';
        
        overrides[deviceId] = {
          name: name || undefined,
          address: address || undefined,
          serialNumber: serialNumber || undefined,
          group: group || undefined,
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
        const lastSync = row[5] ? new Date(row[5]).getTime() : null;
        const lastModified = row[6] ? new Date(row[6]).getTime() : null;
        const modifiedBy = row[7] ? String(row[7]).trim() : '';
        
        return {
          name: name || undefined,
          address: address || undefined,
          serialNumber: serialNumber || undefined,
          group: group || undefined,
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
    const sheet = getBeliotDevicesSheet();
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    
    const deviceIdStr = String(deviceId).trim();
    if (!deviceIdStr) {
      throw new Error('deviceId не может быть пустым');
    }
    
    // Ищем существующую строку
    let rowIndex = -1;
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0] || '').trim() === deviceIdStr) {
        rowIndex = i + 1; // Индекс строки в Sheets (начинается с 1)
        break;
      }
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
      sheet.getRange(rowIndex, 6).setValue(now); // Колонка F: lastSync
      sheet.getRange(rowIndex, 7).setValue(now); // Колонка G: lastModified
      if (modifiedBy) {
        sheet.getRange(rowIndex, 8).setValue(modifiedBy); // Колонка H: modifiedBy
      }
    } else {
      // Создаем новую строку
      sheet.appendRow([
        deviceIdStr,                    // A: deviceId
        data.name || '',                // B: name
        data.address || '',             // C: address
        data.serialNumber || '',        // D: serialNumber
        data.group || '',               // E: group
        now,                            // F: lastSync
        now,                            // G: lastModified
        modifiedBy,                     // H: modifiedBy
      ]);
    }
    
    // Возвращаем сохраненные данные
    return {
      deviceId: deviceIdStr,
      name: data.name || undefined,
      address: data.address || undefined,
      serialNumber: data.serialNumber || undefined,
      group: data.group || undefined,
      lastSync: now.getTime(),
      lastModified: now.getTime(),
      modifiedBy: modifiedBy || undefined,
    };
  } catch (error) {
    Logger.log('Ошибка при сохранении изменений для устройства ' + deviceId + ': ' + error);
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

