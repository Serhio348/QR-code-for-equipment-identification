/**
 * EquipmentMutations.gs
 * 
 * Функции для изменения данных об оборудовании в Google Sheets
 * 
 * Этот модуль содержит функции для создания, обновления и удаления оборудования:
 * - Создание нового оборудования
 * - Обновление существующего оборудования
 * - Удаление оборудования (с удалением папки в Google Drive)
 * 
 * Все функции работают с таблицей, к которой привязан проект Google Apps Script
 * через SpreadsheetApp.getActiveSpreadsheet()
 * 
 * Зависимости:
 * - generateId() из Utils.gs - генерация UUID
 * - getEquipmentSheet() из SheetHelpers.gs - получение листа "Оборудование"
 * - parseRowToEquipment() из SheetHelpers.gs - парсинг строки в объект Equipment
 * - createDriveFolder() из DriveOperations.gs - создание папки в Google Drive
 * - deleteDriveFolder() из DriveOperations.gs - удаление папки в Google Drive
 * - getEquipmentById() из EquipmentQueries.gs - получение оборудования по ID
 */

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
 * @param {string} data.googleDriveUrl - URL папки в Google Drive (опционально, создастся автоматически)
 * @param {string} data.qrCodeUrl - URL QR-кода (опционально)
 * @param {string} data.commissioningDate - Дата ввода в эксплуатацию (формат: YYYY-MM-DD)
 * @param {string} data.lastMaintenanceDate - Дата последнего обслуживания (формат: YYYY-MM-DD)
 * @param {string} data.status - Статус оборудования (по умолчанию: 'active')
 * @param {string} data.parentFolderId - ID родительской папки для создания папки оборудования (опционально)
 * @param {string} data.maintenanceSheetId - ID листа журнала обслуживания (опционально)
 * @param {string} data.maintenanceSheetUrl - URL листа журнала обслуживания (опционально)
 * 
 * @returns {Object} Созданный объект Equipment
 * 
 * @throws {Error} Если название или тип не указаны
 * 
 * Пример использования:
 * const newEquipment = addEquipment({
 *   name: "Фильтр обезжелезивания ФО-0,8-1,5 №1",
 *   type: "filter",
 *   specs: { height: "1,5 м", diameter: "0,8 м" }
 * });
 * 
 * Зависимости:
 * - generateId() из Utils.gs
 * - getEquipmentSheet() из SheetHelpers.gs
 * - createDriveFolder() из DriveOperations.gs
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
      now,                                   // K: Обновлено (дата и время)
      data.maintenanceSheetId || '',         // L: Maintenance Sheet ID
      data.maintenanceSheetUrl || ''         // M: Maintenance Sheet URL
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
      updatedAt: now.toISOString(),
      maintenanceSheetId: data.maintenanceSheetId || '',
      maintenanceSheetUrl: data.maintenanceSheetUrl || ''
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
 * @param {string} data.maintenanceSheetId - Новый ID листа журнала обслуживания
 * @param {string} data.maintenanceSheetUrl - Новый URL листа журнала обслуживания
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
 * 
 * Зависимости:
 * - getEquipmentSheet() из SheetHelpers.gs
 * - getEquipmentById() из EquipmentQueries.gs
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
        if (data.maintenanceSheetId !== undefined) {
          sheet.getRange(rowIndex, 12).setValue(data.maintenanceSheetId); // Колонка L
        }
        if (data.maintenanceSheetUrl !== undefined) {
          sheet.getRange(rowIndex, 13).setValue(data.maintenanceSheetUrl); // Колонка M
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
 * Удалить оборудование (физическое удаление)
 * 
 * Удаляет оборудование из таблицы и папку в Google Drive (если она была создана)
 * 
 * @param {string} id - UUID оборудования для удаления
 * @returns {void}
 * 
 * @throws {Error} Если оборудование не найдено или произошла ошибка
 * 
 * Пример использования:
 * deleteEquipment('uuid');
 * 
 * Зависимости:
 * - getEquipmentSheet() из SheetHelpers.gs
 * - parseRowToEquipment() из SheetHelpers.gs
 * - deleteDriveFolder() из DriveOperations.gs
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

