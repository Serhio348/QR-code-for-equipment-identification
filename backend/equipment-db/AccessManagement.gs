/**
 * AccessManagement.gs
 * 
 * Функции для управления доступом пользователей к приложениям/вкладкам
 * 
 * Этот модуль содержит функции для:
 * - Работы с листом "Доступ к приложениям"
 * - Получения и обновления настроек доступа пользователей
 * - Проверки доступа пользователя к приложениям
 * 
 * Зависимости:
 * - Utils.gs (generateId, formatDate)
 * - ResponseHelpers.gs (createJsonResponse, createErrorResponse)
 * - UserManagement.gs (getUserByEmail, getUsersSheet)
 * 
 * Структура листа "Доступ к приложениям":
 * Колонка A: Email пользователя
 * Колонка B: ID пользователя
 * Колонка C: Доступ к "Оборудование" (true/false)
 * Колонка D: Доступ к "Вода" (true/false)
 * Колонка E: Дата последнего обновления
 * Колонка F: Обновлено пользователем (email администратора)
 */

// ============================================================================
// ФУНКЦИИ РАБОТЫ С ЛИСТОМ
// ============================================================================

/**
 * Получить лист "Доступ к приложениям" из текущей таблицы
 * Если лист не существует, создает его с заголовками
 * 
 * @returns {Sheet} Лист "Доступ к приложениям"
 */
function getAccessSheet() {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadsheet) {
      throw new Error('Не удалось получить активную таблицу Google Sheets');
    }
    
    let sheet = spreadsheet.getSheetByName('Доступ к приложениям');
    
    if (!sheet) {
      Logger.log('📋 Лист "Доступ к приложениям" не найден, создаем новый');
      // Создаем новый лист
      sheet = spreadsheet.insertSheet('Доступ к приложениям');
      
      // Устанавливаем заголовки
      const headers = [
        'Email',
        'ID пользователя',
        'Оборудование',
        'Вода',
        'Дата обновления',
        'Обновлено пользователем'
      ];
      
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      
      // Форматирование заголовков
      const headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#f0f0f0');
      headerRange.setBorder(true, true, true, true, false, false);
      
      // Замораживаем первую строку
      sheet.setFrozenRows(1);
      
      Logger.log('✅ Создан лист "Доступ к приложениям" с заголовками: ' + JSON.stringify(headers));
    } else {
      Logger.log('✅ Лист "Доступ к приложениям" найден');
    }
    
    return sheet;
  } catch (error) {
    Logger.log('❌ Ошибка getAccessSheet: ' + error.toString());
    throw error;
  }
}

// ============================================================================
// ФУНКЦИИ ПОЛУЧЕНИЯ ДАННЫХ
// ============================================================================

/**
 * Получить настройки доступа для всех пользователей
 * Возвращает всех зарегистрированных пользователей с их настройками доступа
 * 
 * @returns {Array} Массив объектов с настройками доступа для всех пользователей
 */
function getAllUserAccess() {
  try {
    Logger.log('📋 Начало getAllUserAccess');
    
    // Получаем всех пользователей из листа "Пользователи"
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    let usersSheet = spreadsheet.getSheetByName('Пользователи');
    
    if (!usersSheet) {
      Logger.log('❌ Лист "Пользователи" не найден в таблице');
      Logger.log('📋 Доступные листы: ' + spreadsheet.getSheets().map(s => s.getName()).join(', '));
      throw new Error('Лист "Пользователи" не найден в таблице. Убедитесь, что пользователи зарегистрированы.');
    }
    
    Logger.log('✅ Лист "Пользователи" найден');
    Logger.log('📊 Имя листа: ' + usersSheet.getName());
    
    // Получаем последнюю строку с данными
    const lastRow = usersSheet.getLastRow();
    Logger.log('📊 Последняя строка с данными: ' + lastRow);
    Logger.log('📊 Последняя колонка с данными: ' + usersSheet.getLastColumn());
    
    if (lastRow < 2) {
      Logger.log('ℹ️ Нет зарегистрированных пользователей (только заголовки или лист пуст)');
      Logger.log('📊 lastRow=' + lastRow);
      return [];
    }
    
    const usersData = usersSheet.getRange(1, 1, lastRow, usersSheet.getLastColumn()).getValues();
    Logger.log('📊 Всего строк в листе "Пользователи": ' + usersData.length);
    Logger.log('📊 Всего колонок: ' + usersSheet.getLastColumn());
    
    if (usersData.length < 2) {
      Logger.log('ℹ️ Нет зарегистрированных пользователей (только заголовки или лист пуст)');
      Logger.log('📋 Первая строка: ' + JSON.stringify(usersData[0]));
      return [];
    }
    
    const usersHeaders = usersData[0];
    Logger.log('📋 Заголовки листа "Пользователи": ' + JSON.stringify(usersHeaders));
    
    const usersEmailIndex = usersHeaders.indexOf('Email');
    const usersIdIndex = usersHeaders.indexOf('ID');
    const usersNameIndex = usersHeaders.indexOf('Имя');
    
    Logger.log('📊 Индексы колонок: Email=' + usersEmailIndex + ', ID=' + usersIdIndex + ', Имя=' + usersNameIndex);
    
    if (usersEmailIndex === -1) {
      Logger.log('❌ Колонка "Email" не найдена. Доступные колонки: ' + JSON.stringify(usersHeaders));
      throw new Error('Колонка "Email" не найдена в листе "Пользователи". Доступные колонки: ' + usersHeaders.join(', '));
    }
    
    // Логируем первые несколько строк данных для отладки
    Logger.log('📋 Пример данных (первые 3 строки после заголовков):');
    for (let i = 1; i < Math.min(4, usersData.length); i++) {
      Logger.log('  Строка ' + i + ': Email=' + (usersData[i][usersEmailIndex] || 'ПУСТО') + ', ID=' + (usersData[i][usersIdIndex] || 'ПУСТО'));
    }
    
    // Получаем настройки доступа из листа "Доступ к приложениям"
    const accessSheet = getAccessSheet();
    const accessData = accessSheet.getDataRange().getValues();
    
    // Создаем карту настроек доступа по email
    const accessMap = {};
    if (accessData.length >= 2) {
      const accessHeaders = accessData[0];
      const accessEmailIndex = accessHeaders.indexOf('Email');
      const accessUserIdIndex = accessHeaders.indexOf('ID пользователя');
      const accessEquipmentIndex = accessHeaders.indexOf('Оборудование');
      const accessWaterIndex = accessHeaders.indexOf('Вода');
      const accessUpdatedAtIndex = accessHeaders.indexOf('Дата обновления');
      const accessUpdatedByIndex = accessHeaders.indexOf('Обновлено пользователем');
      
      for (let i = 1; i < accessData.length; i++) {
        const row = accessData[i];
        const email = row[accessEmailIndex];
        
        if (email && email.toString().trim() !== '') {
          let updatedAtStr = '';
          if (row[accessUpdatedAtIndex]) {
            try {
              if (row[accessUpdatedAtIndex] instanceof Date) {
                updatedAtStr = row[accessUpdatedAtIndex].toISOString();
              } else if (typeof row[accessUpdatedAtIndex] === 'string') {
                updatedAtStr = row[accessUpdatedAtIndex];
              } else {
                updatedAtStr = new Date(row[accessUpdatedAtIndex]).toISOString();
              }
            } catch (e) {
              updatedAtStr = '';
            }
          }
          
          accessMap[email.toString().trim().toLowerCase()] = {
            userId: row[accessUserIdIndex] ? row[accessUserIdIndex].toString().trim() : '',
            equipment: row[accessEquipmentIndex] === true || row[accessEquipmentIndex] === 'true' || row[accessEquipmentIndex] === 'TRUE',
            water: row[accessWaterIndex] === true || row[accessWaterIndex] === 'true' || row[accessWaterIndex] === 'TRUE',
            updatedAt: updatedAtStr,
            updatedBy: row[accessUpdatedByIndex] ? row[accessUpdatedByIndex].toString().trim() : ''
          };
        }
      }
    }
    
    // Объединяем данные пользователей с настройками доступа
    const accessList = [];
    
    Logger.log('📊 Начало обработки пользователей. Всего строк данных: ' + (usersData.length - 1));
    
    for (let i = 1; i < usersData.length; i++) {
      const row = usersData[i];
      const email = row[usersEmailIndex];
      
      Logger.log('📋 Обработка строки ' + i + ': email=' + (email ? email.toString() : 'ПУСТО'));
      
      if (!email || email.toString().trim() === '') {
        Logger.log('⏭️ Пропуск строки ' + i + ' (пустой email)');
        continue; // Пропускаем пустые строки
      }
      
      const emailStr = email.toString().trim();
      const emailLower = emailStr.toLowerCase();
      const access = accessMap[emailLower] || {};
      
      // Создаем простой объект без методов для правильной сериализации
      const userAccess = {
        email: String(emailStr),
        userId: String(access.userId || (row[usersIdIndex] ? row[usersIdIndex].toString().trim() : '')),
        name: String(row[usersNameIndex] ? row[usersNameIndex].toString().trim() : ''),
        equipment: Boolean(access.equipment === true),
        water: Boolean(access.water === true),
        updatedAt: String(access.updatedAt || ''),
        updatedBy: String(access.updatedBy || '')
      };
      
      Logger.log('✅ Добавлен пользователь: ' + emailStr + ', equipment=' + userAccess.equipment + ', water=' + userAccess.water);
      accessList.push(userAccess);
    }
    
    Logger.log('✅ Всего пользователей обработано: ' + accessList.length);
    if (accessList.length > 0) {
      Logger.log('📋 Список email пользователей: ' + accessList.map(u => u.email).join(', '));
      Logger.log('📋 Первый пользователь (пример): ' + JSON.stringify(accessList[0]));
    } else {
      Logger.log('⚠️ ВНИМАНИЕ: accessList пустой, хотя обработано пользователей!');
      Logger.log('📊 usersData.length=' + usersData.length);
      Logger.log('📊 usersEmailIndex=' + usersEmailIndex);
    }
    return accessList;
  } catch (error) {
    Logger.log('❌ Ошибка getAllUserAccess: ' + error.toString());
    Logger.log('❌ Stack trace: ' + (error.stack || 'нет'));
    throw error;
  }
}

/**
 * Получить настройки доступа для конкретного пользователя
 * 
 * @param {string} email - Email пользователя
 * @returns {Object|null} Объект с настройками доступа или null, если не найден
 */
function getUserAccess(email) {
  if (!email) {
    return null;
  }
  
  try {
    const sheet = getAccessSheet();
    const data = sheet.getDataRange().getValues();
    
    if (data.length < 2) {
      return null; // Нет данных
    }
    
    const headers = data[0];
    const emailIndex = headers.indexOf('Email');
    const userIdIndex = headers.indexOf('ID пользователя');
    const equipmentIndex = headers.indexOf('Оборудование');
    const waterIndex = headers.indexOf('Вода');
    const updatedAtIndex = headers.indexOf('Дата обновления');
    const updatedByIndex = headers.indexOf('Обновлено пользователем');
    
    const normalizedEmail = email.trim().toLowerCase();
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const rowEmail = row[emailIndex];
      
      if (rowEmail && rowEmail.toString().trim().toLowerCase() === normalizedEmail) {
        return {
          email: rowEmail.toString().trim(),
          userId: row[userIdIndex] ? row[userIdIndex].toString().trim() : '',
          equipment: row[equipmentIndex] === true || row[equipmentIndex] === 'true' || row[equipmentIndex] === 'TRUE',
          water: row[waterIndex] === true || row[waterIndex] === 'true' || row[waterIndex] === 'TRUE',
          updatedAt: row[updatedAtIndex] ? (row[updatedAtIndex] instanceof Date ? row[updatedAtIndex].toISOString() : (typeof row[updatedAtIndex] === 'string' ? row[updatedAtIndex] : new Date(row[updatedAtIndex]).toISOString())) : '',
          updatedBy: row[updatedByIndex] ? row[updatedByIndex].toString().trim() : ''
        };
      }
    }
    
    return null; // Пользователь не найден
  } catch (error) {
    Logger.log('❌ Ошибка getUserAccess: ' + error.toString());
    throw error;
  }
}

// ============================================================================
// ФУНКЦИИ ОБНОВЛЕНИЯ ДАННЫХ
// ============================================================================

/**
 * Обновить настройки доступа для пользователя
 * 
 * @param {string} email - Email пользователя
 * @param {Object} accessData - Объект с настройками доступа {equipment: boolean, water: boolean}
 * @param {string} updatedBy - Email администратора, который обновил настройки
 * @returns {Object} Обновленный объект с настройками доступа
 */
function updateUserAccess(email, accessData, updatedBy) {
  if (!email) {
    throw new Error('Email пользователя обязателен');
  }
  
  try {
    // Получаем данные пользователя для получения ID
    const user = getUserByEmail(email);
    if (!user) {
      throw new Error('Пользователь не найден');
    }
    
    const sheet = getAccessSheet();
    const data = sheet.getDataRange().getValues();
    
    if (data.length < 2) {
      // Нет данных, создаем новую запись
      const headers = ['Email', 'ID пользователя', 'Оборудование', 'Вода', 'Дата обновления', 'Обновлено пользователем'];
      const newRow = [
        email.trim(),
        user.id || '',
        accessData.equipment !== undefined ? accessData.equipment : false,
        accessData.water !== undefined ? accessData.water : false,
        new Date().toISOString(),
        updatedBy || ''
      ];
      sheet.appendRow(newRow);
      
      Logger.log('✅ Создана новая запись доступа для: ' + email);
    } else {
      // Ищем существующую запись
      const headers = data[0];
      const emailIndex = headers.indexOf('Email');
      const userIdIndex = headers.indexOf('ID пользователя');
      const equipmentIndex = headers.indexOf('Оборудование');
      const waterIndex = headers.indexOf('Вода');
      const updatedAtIndex = headers.indexOf('Дата обновления');
      const updatedByIndex = headers.indexOf('Обновлено пользователем');
      
      const normalizedEmail = email.trim().toLowerCase();
      let found = false;
      
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const rowEmail = row[emailIndex];
        
        if (rowEmail && rowEmail.toString().trim().toLowerCase() === normalizedEmail) {
          // Обновляем существующую запись
          const rowNumber = i + 1;
          
          if (accessData.equipment !== undefined) {
            sheet.getRange(rowNumber, equipmentIndex + 1).setValue(accessData.equipment);
          }
          if (accessData.water !== undefined) {
            sheet.getRange(rowNumber, waterIndex + 1).setValue(accessData.water);
          }
          
          // Обновляем ID пользователя, если его нет
          if (!row[userIdIndex] && user.id) {
            sheet.getRange(rowNumber, userIdIndex + 1).setValue(user.id);
          }
          
          // Обновляем дату и пользователя
          sheet.getRange(rowNumber, updatedAtIndex + 1).setValue(new Date().toISOString());
          if (updatedBy) {
            sheet.getRange(rowNumber, updatedByIndex + 1).setValue(updatedBy);
          }
          
          found = true;
          Logger.log('✅ Обновлена запись доступа для: ' + email);
          break;
        }
      }
      
      if (!found) {
        // Создаем новую запись
        const newRow = [
          email.trim(),
          user.id || '',
          accessData.equipment !== undefined ? accessData.equipment : false,
          accessData.water !== undefined ? accessData.water : false,
          new Date().toISOString(),
          updatedBy || ''
        ];
        sheet.appendRow(newRow);
        
        Logger.log('✅ Создана новая запись доступа для: ' + email);
      }
    }
    
    // Возвращаем обновленные данные
    return getUserAccess(email);
  } catch (error) {
    Logger.log('❌ Ошибка updateUserAccess: ' + error.toString());
    throw error;
  }
}

// ============================================================================
// HTTP ОБРАБОТЧИКИ (вызываются из Code.gs)
// ============================================================================

/**
 * Обработчик для получения всех настроек доступа
 * Вызывается из Code.gs при action='getAllUserAccess'
 * 
 * @returns {Object} JSON ответ с массивом настроек доступа
 */
function handleGetAllUserAccess() {
  try {
    Logger.log('🔐 [handleGetAllUserAccess] Начало обработки');
    const accessList = getAllUserAccess();
    Logger.log('🔐 [handleGetAllUserAccess] Получено записей доступа: ' + accessList.length);
    Logger.log('🔐 [handleGetAllUserAccess] Тип данных: ' + typeof accessList);
    Logger.log('🔐 [handleGetAllUserAccess] Это массив: ' + Array.isArray(accessList));
    
    if (!Array.isArray(accessList)) {
      Logger.log('❌ [handleGetAllUserAccess] ОШИБКА: accessList не является массивом!');
      throw new Error('getAllUserAccess вернул не массив: ' + typeof accessList);
    }
    
    if (accessList.length > 0) {
      Logger.log('🔐 [handleGetAllUserAccess] Первая запись: ' + JSON.stringify(accessList[0]));
      Logger.log('🔐 [handleGetAllUserAccess] Всего записей для отправки: ' + accessList.length);
    } else {
      Logger.log('⚠️ [handleGetAllUserAccess] ВНИМАНИЕ: accessList пустой!');
    }
    
    const response = createJsonResponse(accessList);
    Logger.log('🔐 [handleGetAllUserAccess] Ответ создан успешно');
    
    // Проверяем содержимое ответа
    const responseText = response.getContent();
    Logger.log('🔐 [handleGetAllUserAccess] Размер ответа: ' + responseText.length + ' символов');
    Logger.log('🔐 [handleGetAllUserAccess] Первые 500 символов ответа: ' + responseText.substring(0, 500));
    
    return response;
  } catch (error) {
    Logger.log('❌ [handleGetAllUserAccess] Ошибка: ' + error.toString());
    Logger.log('❌ [handleGetAllUserAccess] Stack trace: ' + (error.stack || 'нет'));
    return createErrorResponse('Ошибка при получении настроек доступа: ' + error.toString());
  }
}

/**
 * Обработчик для получения настроек доступа пользователя
 * Вызывается из Code.gs при action='getUserAccess'
 * 
 * @param {Object} params - Параметры запроса {email: string}
 * @returns {Object} JSON ответ с настройками доступа
 */
function handleGetUserAccess(params) {
  try {
    const email = params.email;
    
    if (!email) {
      return createErrorResponse('Email пользователя обязателен');
    }
    
    const access = getUserAccess(email);
    
    if (!access) {
      return createJsonResponse(null);
    }
    
    return createJsonResponse(access);
  } catch (error) {
    Logger.log('❌ Ошибка handleGetUserAccess: ' + error.toString());
    return createErrorResponse('Ошибка при получении настроек доступа: ' + error.toString());
  }
}

/**
 * Обработчик для обновления настроек доступа
 * Вызывается из Code.gs при action='updateUserAccess'
 * 
 * @param {Object} params - Параметры запроса {email: string, equipment: boolean, water: boolean}
 * @param {string} adminEmail - Email администратора, который обновляет настройки
 * @returns {Object} JSON ответ с обновленными настройками доступа
 */
function handleUpdateUserAccess(params, adminEmail) {
  try {
    const email = params.email;
    
    if (!email) {
      return createErrorResponse('Email пользователя обязателен');
    }
    
    const accessData = {};
    
    if (params.equipment !== undefined) {
      accessData.equipment = params.equipment === 'true' || params.equipment === true;
    }
    if (params.water !== undefined) {
      accessData.water = params.water === 'true' || params.water === true;
    }
    
    if (Object.keys(accessData).length === 0) {
      return createErrorResponse('Не указаны настройки доступа для обновления');
    }
    
    const updatedAccess = updateUserAccess(email, accessData, adminEmail);
    
    return createJsonResponse(updatedAccess);
  } catch (error) {
    Logger.log('❌ Ошибка handleUpdateUserAccess: ' + error.toString());
    return createErrorResponse('Ошибка при обновлении настроек доступа: ' + error.toString());
  }
}

