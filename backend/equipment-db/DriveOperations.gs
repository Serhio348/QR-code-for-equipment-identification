/**
 * DriveOperations.gs
 * 
 * Функции для работы с Google Drive
 * 
 * Этот модуль содержит функции для операций с Google Drive:
 * - Создание папок для оборудования
 * - Получение списка файлов из папок
 * - Удаление папок
 * - Извлечение ID из URL папок
 * 
 * Все функции работают с Google Drive аккаунта, указанного в настройках
 * развертывания веб-приложения ("Выполнять от имени").
 */

// ============================================================================
// ФУНКЦИИ РАБОТЫ С ПАПКАМИ GOOGLE DRIVE
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

    // Открываем папку по ссылке: любой пользователь, имеющий ссылку, может просматривать.
    // Это надёжнее, чем addViewer(email), который требует наличия Google-аккаунта с точным
    // совпадением email и может тихо падать при корпоративных ограничениях Workspace.
    // Безопасность обеспечивается приложением — ссылка видна только авторизованным пользователям.
    try {
      folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      Logger.log('✅ Папка открыта для просмотра по ссылке (ANYONE_WITH_LINK)');
    } catch (sharingError) {
      Logger.log('⚠️ Не удалось настроить доступ по ссылке: ' + sharingError);
      // Продолжаем выполнение, папка создана
    }

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
 * Удалить папку в Google Drive
 * 
 * Удаляет (перемещает в корзину) папку по её URL или ID
 * 
 * @param {string} folderUrl - URL папки или ID папки
 * @returns {void}
 * 
 * @throws {Error} Если не удалось удалить папку
 * 
 * Пример использования:
 * deleteDriveFolder("https://drive.google.com/drive/folders/1a2b3c4d5e6f7g8h9i0j");
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
    
    const folderId = extractDriveIdFromUrl(trimmedUrl);
    
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

/**
 * Создать документ (Google Doc или Google Sheet) и поместить в указанную папку
 *
 * Универсальная функция для создания документов любого типа.
 * ИИ-консультант формирует содержимое, а GAS создаёт файл в Google Drive.
 *
 * @param {string} name - Название документа
 * @param {string} docType - Тип: 'doc' (Google Doc) или 'sheet' (Google Sheet)
 * @param {string|Array} content - Содержимое:
 *   Для 'doc': текст документа (строка, абзацы разделены \n)
 *   Для 'sheet': JSON-строка или массив массивов [["Заголовок1","Заголовок2"],["значение1","значение2"]]
 * @param {string} folderId - (Опционально) ID папки, куда поместить документ
 * @returns {Object} {fileId, fileUrl, fileName, type}
 */
function createDocument(name, docType, content, folderId) {
  try {
    Logger.log('📄 createDocument вызвана');
    Logger.log('  - name: ' + name);
    Logger.log('  - docType: ' + docType);
    Logger.log('  - folderId: ' + (folderId || 'не указан'));
    Logger.log('  - content length: ' + (content ? String(content).length : 0));

    if (!name) {
      throw new Error('Название документа не указано');
    }
    if (!docType || (docType !== 'doc' && docType !== 'sheet')) {
      throw new Error('Тип документа должен быть "doc" или "sheet"');
    }
    if (!content) {
      throw new Error('Содержимое документа не указано');
    }

    var file;
    var fileUrl;
    var fileId;

    if (docType === 'doc') {
      // === Создание Google Doc ===
      var doc = DocumentApp.create(name);
      var body = doc.getBody();

      // Очищаем документ (удаляем пустой абзац по умолчанию)
      body.clear();

      // Разбиваем содержимое на строки и добавляем абзацы
      var lines = String(content).split('\n');
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];

        // Заголовки: строки начинающиеся с # (markdown-стиль)
        if (line.match(/^### /)) {
          body.appendParagraph(line.replace(/^### /, '')).setHeading(DocumentApp.ParagraphHeading.HEADING3);
        } else if (line.match(/^## /)) {
          body.appendParagraph(line.replace(/^## /, '')).setHeading(DocumentApp.ParagraphHeading.HEADING2);
        } else if (line.match(/^# /)) {
          body.appendParagraph(line.replace(/^# /, '')).setHeading(DocumentApp.ParagraphHeading.HEADING1);
        } else if (line.trim() === '') {
          body.appendParagraph('');
        } else {
          body.appendParagraph(line);
        }
      }

      doc.saveAndClose();

      fileId = doc.getId();
      fileUrl = doc.getUrl();
      file = DriveApp.getFileById(fileId);

      Logger.log('  - Google Doc создан: ' + fileId);

    } else if (docType === 'sheet') {
      // === Создание Google Sheet ===
      var spreadsheet = SpreadsheetApp.create(name);
      var sheet = spreadsheet.getActiveSheet();

      // Парсим содержимое: ожидаем JSON массив массивов
      var data;
      if (typeof content === 'string') {
        try {
          data = JSON.parse(content);
        } catch (e) {
          throw new Error('Для типа "sheet" содержимое должно быть JSON массивом: ' + e.toString());
        }
      } else {
        data = content;
      }

      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('Содержимое должно быть непустым массивом массивов');
      }

      // Записываем данные
      var numRows = data.length;
      var numCols = data[0].length;
      sheet.getRange(1, 1, numRows, numCols).setValues(data);

      // Форматируем заголовок (первая строка)
      var headerRange = sheet.getRange(1, 1, 1, numCols);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#4285f4');
      headerRange.setFontColor('#ffffff');

      // Авторесайз колонок
      for (var c = 1; c <= numCols; c++) {
        sheet.autoResizeColumn(c);
      }

      fileId = spreadsheet.getId();
      fileUrl = spreadsheet.getUrl();
      file = DriveApp.getFileById(fileId);

      Logger.log('  - Google Sheet создан: ' + fileId);
    }

    // Перемещаем в целевую папку (если указана)
    if (folderId && file) {
      try {
        var targetFolder = DriveApp.getFolderById(folderId);
        targetFolder.addFile(file);
        // Удаляем из корня
        DriveApp.getRootFolder().removeFile(file);
        Logger.log('  - Перемещён в папку: ' + targetFolder.getName());
      } catch (moveError) {
        Logger.log('  ⚠️ Не удалось переместить в папку: ' + moveError);
        // Файл остаётся в корне, но создан успешно
      }
    }

    Logger.log('✅ Документ создан: ' + name + ' | URL: ' + fileUrl);

    return {
      fileId: fileId,
      fileUrl: fileUrl,
      fileName: name,
      type: docType
    };

  } catch (error) {
    Logger.log('❌ Ошибка createDocument: ' + error.toString());
    Logger.log('  - Stack: ' + (error.stack || 'нет стека'));
    throw error;
  }
}

/**
 * Получить список файлов и/или подпапок из папки Google Drive
 *
 * @param {string} folderUrlOrId - URL папки или ID папки
 * @param {string} mimeType - Опциональный фильтр по MIME-типу.
 *   "application/vnd.google-apps.folder" — вернуть только подпапки.
 *   Любой другой тип — вернуть только файлы с этим MIME.
 *   Не указан — вернуть все файлы (без подпапок).
 * @param {string} query - Опциональный поиск по названию (регистронезависимый).
 * @returns {Array} Массив объектов {id, name, url, size, mimeType, modifiedTime, isFolder}
 */
function getFolderFiles(folderUrlOrId, mimeType, query) {
  try {
    Logger.log('📁 Получение содержимого папки');
    Logger.log('  - folderUrlOrId: ' + folderUrlOrId);
    Logger.log('  - mimeType: ' + (mimeType || 'не указан'));
    Logger.log('  - query: ' + (query || 'не указан'));

    if (!folderUrlOrId || !folderUrlOrId.trim()) {
      throw new Error('URL или ID папки не указан');
    }

    var folderId = extractDriveIdFromUrl(folderUrlOrId);
    if (!folderId) {
      throw new Error('Неверный формат URL папки: ' + folderUrlOrId);
    }

    var folder = DriveApp.getFolderById(folderId);
    Logger.log('  - Папка: "' + folder.getName() + '"');

    var resultList = [];
    var queryLower = query ? query.toLowerCase() : null;

    // Определяем, что нужно загружать
    var needFolders = !mimeType || mimeType === 'application/vnd.google-apps.folder';
    var needFiles = !mimeType || mimeType !== 'application/vnd.google-apps.folder';

    // Подпапки
    if (needFolders) {
      var subFolders = folder.getFolders();
      while (subFolders.hasNext()) {
        var sub = subFolders.next();
        if (queryLower && sub.getName().toLowerCase().indexOf(queryLower) === -1) continue;
        resultList.push({
          id: sub.getId(),
          name: sub.getName(),
          url: sub.getUrl(),
          size: 0,
          mimeType: 'application/vnd.google-apps.folder',
          modifiedTime: sub.getLastUpdated().toISOString(),
          isFolder: true
        });
      }
    }

    // Файлы
    if (needFiles) {
      var files = folder.getFiles();
      while (files.hasNext()) {
        var file = files.next();
        if (mimeType && file.getMimeType() !== mimeType) continue;
        if (queryLower && file.getName().toLowerCase().indexOf(queryLower) === -1) continue;
        resultList.push({
          id: file.getId(),
          name: file.getName(),
          url: file.getUrl(),
          size: file.getSize(),
          mimeType: file.getMimeType(),
          modifiedTime: file.getLastUpdated().toISOString(),
          isFolder: false
        });
      }
    }

    Logger.log('  - Найдено элементов: ' + resultList.length);

    // Сортируем по дате изменения (новые сначала)
    resultList.sort(function(a, b) {
      return new Date(b.modifiedTime) - new Date(a.modifiedTime);
    });

    return resultList;
  } catch (error) {
    Logger.log('❌ Ошибка getFolderFiles: ' + error.toString());
    Logger.log('  - Stack: ' + (error.stack || 'нет стека'));
    throw error;
  }
}

// ============================================================================
// УТИЛИТЫ ДЛЯ РАБОТЫ С URL
// ============================================================================

/**
 * Извлечь ID папки или файла из URL Google Drive
 * 
 * Поддерживает различные форматы URL Google Drive:
 * - https://drive.google.com/drive/folders/FOLDER_ID
 * - https://drive.google.com/open?id=FOLDER_ID
 * - FOLDER_ID (прямой ID)
 * 
 * @param {string} urlOrId - URL папки/файла или прямой ID
 * @returns {string|null} ID папки/файла или null, если не удалось извлечь
 * 
 * Примеры:
 * extractDriveIdFromUrl("https://drive.google.com/drive/folders/1a2b3c4d5e6f7g8h9i0j")
 *   -> "1a2b3c4d5e6f7g8h9i0j"
 * extractDriveIdFromUrl("1a2b3c4d5e6f7g8h9i0j")
 *   -> "1a2b3c4d5e6f7g8h9i0j"
 */
function extractDriveIdFromUrl(urlOrId) {
  if (!urlOrId) {
    return null;
  }

  const trimmed = String(urlOrId).trim();
  if (!trimmed) {
    return null;
  }

  // Формат: https://drive.google.com/drive/folders/FOLDER_ID
  const foldersMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (foldersMatch && foldersMatch[1]) {
    return foldersMatch[1];
  }

  // Формат: https://drive.google.com/open?id=FOLDER_ID
  const idMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch && idMatch[1]) {
    return idMatch[1];
  }

  // Прямой ID (если это просто ID без URL)
  const idPattern = /^[a-zA-Z0-9_-]{20,}$/;
  if (idPattern.test(trimmed) && !trimmed.includes('/') && !trimmed.includes('?')) {
    return trimmed;
  }

  return null;
}

// ============================================================================
// ФУНКЦИИ УПРАВЛЕНИЯ ДОСТУПОМ К ПАПКАМ
// ============================================================================

/**
 * Получить список email пользователей с доступом к разделу "Оборудование"
 *
 * Читает данные из листа "Доступ к приложениям" и возвращает email
 * пользователей, у которых equipment = true
 *
 * @returns {Array<string>} Массив email адресов пользователей с доступом
 */
function getUsersWithEquipmentAccess() {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const accessSheet = spreadsheet.getSheetByName('Доступ к приложениям');

    if (!accessSheet) {
      Logger.log('⚠️ Лист "Доступ к приложениям" не найден');
      return [];
    }

    const data = accessSheet.getDataRange().getValues();

    if (data.length < 2) {
      Logger.log('ℹ️ Нет данных о доступе пользователей');
      return [];
    }

    const headers = data[0];
    const emailIndex = headers.indexOf('Email');
    const equipmentIndex = headers.indexOf('Оборудование');

    if (emailIndex === -1 || equipmentIndex === -1) {
      Logger.log('❌ Не найдены колонки Email или Оборудование');
      return [];
    }

    const usersWithAccess = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const email = row[emailIndex];
      const hasAccess = row[equipmentIndex] === true ||
                        row[equipmentIndex] === 'true' ||
                        row[equipmentIndex] === 'TRUE';

      if (email && hasAccess) {
        usersWithAccess.push(email.toString().trim());
      }
    }

    Logger.log('📋 Найдено пользователей с доступом к оборудованию: ' + usersWithAccess.length);
    return usersWithAccess;

  } catch (error) {
    Logger.log('❌ Ошибка getUsersWithEquipmentAccess: ' + error.toString());
    return [];
  }
}

/**
 * Синхронизировать доступ к папке с текущими настройками пользователей
 *
 * Удаляет всех viewers (кроме владельца) и добавляет пользователей
 * с текущим доступом к оборудованию
 *
 * @param {string} folderUrlOrId - URL или ID папки
 * @returns {Object} {success: boolean, message: string, addedCount: number}
 */
function syncFolderAccess(folderUrlOrId) {
  try {
    Logger.log('🔄 Синхронизация доступа к папке: ' + folderUrlOrId);

    if (!folderUrlOrId || !folderUrlOrId.trim()) {
      return {
        success: false,
        message: 'URL или ID папки не указан',
        addedCount: 0
      };
    }

    const folderId = extractDriveIdFromUrl(folderUrlOrId);

    if (!folderId) {
      return {
        success: false,
        message: 'Неверный формат URL папки',
        addedCount: 0
      };
    }

    const folder = DriveApp.getFolderById(folderId);
    const folderName = folder.getName();
    Logger.log('📁 Папка: "' + folderName + '"');

    // Получаем текущих viewers (getViewers возвращает массив User[], а не итератор)
    const currentViewers = folder.getViewers();
    const currentViewerEmails = [];

    for (var j = 0; j < currentViewers.length; j++) {
      currentViewerEmails.push(currentViewers[j].getEmail().toLowerCase());
    }

    Logger.log('👥 Текущих viewers: ' + currentViewerEmails.length);

    // Получаем пользователей с доступом к оборудованию
    const usersWithAccess = getUsersWithEquipmentAccess();
    const usersWithAccessLower = usersWithAccess.map(function(email) {
      return email.toLowerCase();
    });

    // Удаляем viewers, которые больше не имеют доступа
    let removedCount = 0;
    for (let i = 0; i < currentViewerEmails.length; i++) {
      const viewerEmail = currentViewerEmails[i];
      if (usersWithAccessLower.indexOf(viewerEmail) === -1) {
        try {
          folder.removeViewer(viewerEmail);
          Logger.log('  ➖ Удален viewer: ' + viewerEmail);
          removedCount++;
        } catch (removeError) {
          Logger.log('  ⚠️ Не удалось удалить viewer ' + viewerEmail + ': ' + removeError);
        }
      }
    }

    // Добавляем новых viewers
    let addedCount = 0;
    for (let i = 0; i < usersWithAccess.length; i++) {
      const userEmail = usersWithAccess[i];
      if (currentViewerEmails.indexOf(userEmail.toLowerCase()) === -1) {
        try {
          folder.addViewer(userEmail);
          Logger.log('  ➕ Добавлен viewer: ' + userEmail);
          addedCount++;
        } catch (addError) {
          Logger.log('  ⚠️ Не удалось добавить viewer ' + userEmail + ': ' + addError);
        }
      }
    }

    Logger.log('✅ Синхронизация завершена. Удалено: ' + removedCount + ', добавлено: ' + addedCount);

    return {
      success: true,
      message: 'Синхронизация завершена. Удалено: ' + removedCount + ', добавлено: ' + addedCount,
      addedCount: addedCount,
      removedCount: removedCount
    };

  } catch (error) {
    Logger.log('❌ Ошибка syncFolderAccess: ' + error.toString());
    return {
      success: false,
      message: 'Ошибка: ' + error.toString(),
      addedCount: 0
    };
  }
}

/**
 * Синхронизировать доступ ко всем папкам оборудования
 *
 * Получает список всего оборудования из листа "Оборудование" и
 * синхронизирует доступ к каждой папке
 *
 * @returns {Object} {success: boolean, message: string, processedCount: number, errorCount: number}
 */
function syncAllEquipmentFoldersAccess() {
  try {
    Logger.log('🔄 Массовая синхронизация доступа ко всем папкам оборудования');

    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const equipmentSheet = spreadsheet.getSheetByName('Оборудование');

    if (!equipmentSheet) {
      return {
        success: false,
        message: 'Лист "Оборудование" не найден',
        processedCount: 0,
        errorCount: 0
      };
    }

    const data = equipmentSheet.getDataRange().getValues();

    if (data.length < 2) {
      return {
        success: true,
        message: 'Нет оборудования для обработки',
        processedCount: 0,
        errorCount: 0
      };
    }

    const headers = data[0];
    const driveUrlIndex = headers.indexOf('Google Drive URL');

    if (driveUrlIndex === -1) {
      return {
        success: false,
        message: 'Колонка "Google Drive URL" не найдена',
        processedCount: 0,
        errorCount: 0
      };
    }

    let processedCount = 0;
    let errorCount = 0;

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const driveUrl = row[driveUrlIndex];

      if (driveUrl && driveUrl.toString().trim()) {
        const result = syncFolderAccess(driveUrl);

        if (result.success) {
          processedCount++;
        } else {
          errorCount++;
          Logger.log('❌ Ошибка для строки ' + (i + 1) + ': ' + result.message);
        }

        // Небольшая пауза, чтобы не превысить лимиты API
        Utilities.sleep(100);
      }
    }

    Logger.log('✅ Массовая синхронизация завершена. Обработано: ' + processedCount + ', ошибок: ' + errorCount);

    return {
      success: true,
      message: 'Обработано папок: ' + processedCount + ', ошибок: ' + errorCount,
      processedCount: processedCount,
      errorCount: errorCount
    };

  } catch (error) {
    Logger.log('❌ Ошибка syncAllEquipmentFoldersAccess: ' + error.toString());
    return {
      success: false,
      message: 'Ошибка: ' + error.toString(),
      processedCount: 0,
      errorCount: 0
    };
  }
}

/**
 * Установить доступ "по ссылке" (ANYONE_WITH_LINK) для всех папок оборудования.
 *
 * Запускается один раз вручную из редактора GAS для исправления существующих папок,
 * созданных до изменения политики доступа.
 *
 * @returns {Object} {success, processedCount, errorCount, message}
 */
function setAllFoldersPublicLink() {
  try {
    Logger.log('🔓 Установка доступа по ссылке для всех папок оборудования...');

    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const equipmentSheet = spreadsheet.getSheetByName('Оборудование');

    if (!equipmentSheet) {
      return { success: false, message: 'Лист "Оборудование" не найден', processedCount: 0, errorCount: 0 };
    }

    const data = equipmentSheet.getDataRange().getValues();
    if (data.length < 2) {
      return { success: true, message: 'Нет записей оборудования', processedCount: 0, errorCount: 0 };
    }

    const headers = data[0];
    const driveUrlIndex = headers.indexOf('Google Drive URL');
    if (driveUrlIndex === -1) {
      return { success: false, message: 'Колонка "Google Drive URL" не найдена', processedCount: 0, errorCount: 0 };
    }

    let processedCount = 0;
    let errorCount = 0;

    for (let i = 1; i < data.length; i++) {
      const driveUrl = data[i][driveUrlIndex];
      if (!driveUrl || !driveUrl.toString().trim()) continue;

      try {
        const folderId = extractDriveIdFromUrl(driveUrl.toString().trim());
        if (!folderId) { errorCount++; continue; }

        const folder = DriveApp.getFolderById(folderId);
        folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        Logger.log('  ✅ [' + (i) + '] ' + folder.getName());
        processedCount++;
      } catch (err) {
        Logger.log('  ⚠️ [' + (i) + '] Ошибка: ' + err.toString());
        errorCount++;
      }
    }

    const message = 'Готово: обработано ' + processedCount + ' папок, ошибок: ' + errorCount;
    Logger.log('✅ ' + message);
    return { success: true, message: message, processedCount: processedCount, errorCount: errorCount };

  } catch (error) {
    Logger.log('❌ setAllFoldersPublicLink: ' + error.toString());
    return { success: false, message: 'Ошибка: ' + error.toString(), processedCount: 0, errorCount: 0 };
  }
}

/**
 * Обработчик для синхронизации доступа (вызывается из Code.gs)
 *
 * @param {Object} params - Параметры {folderUrl: string} или пустой для всех
 * @returns {Object} JSON ответ с результатом
 */
function handleSyncFolderAccess(params) {
  try {
    if (params && params.folderUrl) {
      // Синхронизация конкретной папки
      const result = syncFolderAccess(params.folderUrl);
      return createJsonResponse(result);
    } else {
      // Синхронизация всех папок
      const result = syncAllEquipmentFoldersAccess();
      return createJsonResponse(result);
    }
  } catch (error) {
    Logger.log('❌ Ошибка handleSyncFolderAccess: ' + error.toString());
    return createErrorResponse('Ошибка синхронизации: ' + error.toString());
  }
}

// ============================================================================
// ФУНКЦИИ ЧТЕНИЯ СОДЕРЖИМОГО ФАЙЛОВ
// ============================================================================

/**
 * Получить текстовое содержимое файла из Google Drive
 *
 * Поддерживаемые форматы:
 * - PDF: конвертируется в Google Docs, затем извлекается текст (с OCR)
 * - Google Docs: извлекается текст напрямую
 * - Google Sheets: извлекаются данные как текст
 * - Word (.doc, .docx): конвертируется в Google Docs
 * - Excel (.xls, .xlsx): конвертируется в Google Sheets
 * - Текстовые файлы (.txt, .md, .csv): читаются как есть
 *
 * @param {string} fileUrlOrId - URL файла или его ID
 * @param {Object} options - Опции (опционально)
 * @param {boolean} options.keepTempFile - Не удалять временный Google Doc (для отладки)
 * @param {number} options.maxLength - Максимальная длина текста (по умолчанию 50000)
 * @returns {Object} {success, content, fileName, mimeType, charCount, error}
 */
function getFileContent(fileUrlOrId, options) {
  options = options || {};
  const maxLength = options.maxLength || 50000;
  const keepTempFile = options.keepTempFile || false;

  try {
    Logger.log('📄 getFileContent: начало');
    Logger.log('  - fileUrlOrId: ' + fileUrlOrId);

    if (!fileUrlOrId || !fileUrlOrId.trim()) {
      return {
        success: false,
        error: 'URL или ID файла не указан'
      };
    }

    // Извлекаем ID файла
    const fileId = extractFileIdFromUrl(fileUrlOrId);

    if (!fileId) {
      return {
        success: false,
        error: 'Не удалось извлечь ID файла из URL: ' + fileUrlOrId
      };
    }

    Logger.log('  - fileId: ' + fileId);

    // Получаем файл
    const file = DriveApp.getFileById(fileId);
    const fileName = file.getName();
    const mimeType = file.getMimeType();

    Logger.log('  - fileName: ' + fileName);
    Logger.log('  - mimeType: ' + mimeType);

    let content = '';

    // Обрабатываем в зависимости от типа файла
    if (mimeType === 'application/pdf') {
      // PDF: конвертируем в Google Docs для извлечения текста
      content = extractTextFromPdf(file, keepTempFile);

    } else if (mimeType === 'application/vnd.google-apps.document') {
      // Google Docs: извлекаем текст напрямую
      content = extractTextFromGoogleDoc(fileId);

    } else if (mimeType === 'application/msword' ||
               mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      // Word (.doc, .docx): конвертируем в Google Docs
      content = extractTextFromWordFile(file, keepTempFile);

    } else if (mimeType.startsWith('text/') ||
               mimeType === 'application/json' ||
               mimeType === 'application/xml') {
      // Текстовые файлы: читаем как есть
      content = file.getBlob().getDataAsString('UTF-8');

    } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      // Google Sheets: извлекаем данные как текст
      content = extractTextFromGoogleSheet(fileId);

    } else if (mimeType === 'application/vnd.ms-excel' ||
               mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      // Excel (.xls, .xlsx): конвертируем в Google Sheets
      content = extractTextFromExcelFile(file, keepTempFile);

    } else {
      return {
        success: false,
        error: 'Неподдерживаемый тип файла: ' + mimeType + '. Поддерживаются: PDF, Word (.doc, .docx), Excel (.xls, .xlsx), Google Docs, Google Sheets, текстовые файлы.'
      };
    }

    // Ограничиваем длину текста
    const originalLength = content.length;
    if (content.length > maxLength) {
      content = content.substring(0, maxLength) + '\n\n... [текст обрезан, показано ' + maxLength + ' из ' + originalLength + ' символов]';
    }

    Logger.log('✅ getFileContent: успешно извлечено ' + content.length + ' символов');

    return {
      success: true,
      content: content,
      fileName: fileName,
      mimeType: mimeType,
      charCount: originalLength,
      truncated: originalLength > maxLength
    };

  } catch (error) {
    Logger.log('❌ getFileContent ошибка: ' + error.toString());
    Logger.log('  - Stack: ' + (error.stack || 'нет стека'));

    return {
      success: false,
      error: 'Ошибка чтения файла: ' + error.toString()
    };
  }
}

/**
 * Извлечь текст из PDF файла
 *
 * Использует конвертацию в Google Docs с OCR
 *
 * @param {File} file - Объект файла DriveApp
 * @param {boolean} keepTempFile - Не удалять временный файл
 * @returns {string} Извлеченный текст
 */
function extractTextFromPdf(file, keepTempFile) {
  Logger.log('📄 extractTextFromPdf: конвертация PDF в Google Docs');

  var tempDoc = null;

  try {
    // Получаем blob файла
    var blob = file.getBlob();

    // Для PDF с OCR НЕ указываем целевой mimeType в resource
    var resource = {
      title: '[TEMP] ' + file.getName() + ' - извлечение текста'
    };

    // Используем Drive API для конвертации с OCR
    // convert: true + ocr: true для PDF файлов
    tempDoc = Drive.Files.insert(resource, blob, {
      convert: true,
      ocr: true,
      ocrLanguage: 'ru'
    });

    Logger.log('  - Создан временный документ: ' + tempDoc.id);

    // Извлекаем текст из созданного документа
    var doc = DocumentApp.openById(tempDoc.id);
    var text = doc.getBody().getText();

    Logger.log('  - Извлечено символов: ' + text.length);

    return text;

  } finally {
    // Удаляем временный документ (если не указано keepTempFile)
    if (tempDoc && !keepTempFile) {
      try {
        Drive.Files.remove(tempDoc.id);
        Logger.log('  - Временный документ удален');
      } catch (deleteError) {
        Logger.log('  ⚠️ Не удалось удалить временный документ: ' + deleteError);
      }
    }
  }
}

/**
 * Извлечь текст из Google Docs
 *
 * @param {string} docId - ID документа
 * @returns {string} Текст документа
 */
function extractTextFromGoogleDoc(docId) {
  Logger.log('📄 extractTextFromGoogleDoc: ' + docId);

  const doc = DocumentApp.openById(docId);
  const text = doc.getBody().getText();

  Logger.log('  - Извлечено символов: ' + text.length);

  return text;
}

/**
 * Извлечь данные из Google Sheets как текст
 *
 * @param {string} sheetId - ID таблицы
 * @returns {string} Данные в текстовом формате
 */
function extractTextFromGoogleSheet(sheetId) {
  Logger.log('📄 extractTextFromGoogleSheet: ' + sheetId);

  const spreadsheet = SpreadsheetApp.openById(sheetId);
  const sheets = spreadsheet.getSheets();

  var result = [];

  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    var sheetName = sheet.getName();
    var data = sheet.getDataRange().getValues();

    result.push('=== Лист: ' + sheetName + ' ===\n');

    for (var row = 0; row < data.length; row++) {
      var rowText = data[row].map(function(cell) {
        return cell !== null && cell !== undefined ? String(cell) : '';
      }).join(' | ');
      result.push(rowText);
    }

    result.push('\n');
  }

  var text = result.join('\n');
  Logger.log('  - Извлечено символов: ' + text.length);

  return text;
}

/**
 * Извлечь текст из Word файла (.doc, .docx)
 *
 * Конвертирует файл в Google Docs, затем извлекает текст
 *
 * @param {File} file - Объект файла DriveApp
 * @param {boolean} keepTempFile - Не удалять временный файл
 * @returns {string} Извлеченный текст
 */
function extractTextFromWordFile(file, keepTempFile) {
  Logger.log('📄 extractTextFromWordFile: конвертация Word в Google Docs');
  Logger.log('  - fileName: ' + file.getName());
  Logger.log('  - mimeType: ' + file.getMimeType());

  var tempDoc = null;

  try {
    // Получаем blob файла
    var blob = file.getBlob();

    // Создаем временный Google Doc
    var resource = {
      title: '[TEMP] ' + file.getName() + ' - извлечение текста',
      mimeType: 'application/vnd.google-apps.document'
    };

    // Используем Drive API для конвертации
    // convert: true автоматически конвертирует в Google формат
    tempDoc = Drive.Files.insert(resource, blob, {
      convert: true
    });

    Logger.log('  - Создан временный документ: ' + tempDoc.id);

    // Извлекаем текст из созданного документа
    var doc = DocumentApp.openById(tempDoc.id);
    var text = doc.getBody().getText();

    Logger.log('  - Извлечено символов: ' + text.length);

    return text;

  } finally {
    // Удаляем временный документ
    if (tempDoc && !keepTempFile) {
      try {
        Drive.Files.remove(tempDoc.id);
        Logger.log('  - Временный документ удален');
      } catch (deleteError) {
        Logger.log('  ⚠️ Не удалось удалить временный документ: ' + deleteError);
      }
    }
  }
}

/**
 * Извлечь данные из Excel файла (.xls, .xlsx)
 *
 * Конвертирует файл в Google Sheets, затем извлекает данные
 *
 * @param {File} file - Объект файла DriveApp
 * @param {boolean} keepTempFile - Не удалять временный файл
 * @returns {string} Извлеченные данные в текстовом формате
 */
function extractTextFromExcelFile(file, keepTempFile) {
  Logger.log('📄 extractTextFromExcelFile: конвертация Excel в Google Sheets');
  Logger.log('  - fileName: ' + file.getName());
  Logger.log('  - mimeType: ' + file.getMimeType());

  var tempSheet = null;

  try {
    // Получаем blob файла
    var blob = file.getBlob();

    // Создаем временный Google Sheet
    var resource = {
      title: '[TEMP] ' + file.getName() + ' - извлечение данных',
      mimeType: 'application/vnd.google-apps.spreadsheet'
    };

    // Используем Drive API для конвертации
    tempSheet = Drive.Files.insert(resource, blob, {
      convert: true
    });

    Logger.log('  - Создана временная таблица: ' + tempSheet.id);

    // Извлекаем данные используя существующую функцию
    var text = extractTextFromGoogleSheet(tempSheet.id);

    return text;

  } finally {
    // Удаляем временную таблицу
    if (tempSheet && !keepTempFile) {
      try {
        Drive.Files.remove(tempSheet.id);
        Logger.log('  - Временная таблица удалена');
      } catch (deleteError) {
        Logger.log('  ⚠️ Не удалось удалить временную таблицу: ' + deleteError);
      }
    }
  }
}

/**
 * Извлечь ID файла из URL Google Drive
 *
 * Поддерживает форматы:
 * - https://drive.google.com/file/d/FILE_ID/view
 * - https://drive.google.com/open?id=FILE_ID
 * - FILE_ID (прямой ID)
 *
 * @param {string} urlOrId - URL или ID файла
 * @returns {string|null} ID файла или null
 */
function extractFileIdFromUrl(urlOrId) {
  if (!urlOrId) {
    return null;
  }

  var trimmed = String(urlOrId).trim();
  if (!trimmed) {
    return null;
  }

  // Формат: https://drive.google.com/file/d/FILE_ID/view
  var fileMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch && fileMatch[1]) {
    return fileMatch[1];
  }

  // Формат: https://drive.google.com/open?id=FILE_ID
  var idMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch && idMatch[1]) {
    return idMatch[1];
  }

  // Прямой ID
  var idPattern = /^[a-zA-Z0-9_-]{20,}$/;
  if (idPattern.test(trimmed) && trimmed.indexOf('/') === -1 && trimmed.indexOf('?') === -1) {
    return trimmed;
  }

  return null;
}

/**
 * Обработчик запроса на чтение содержимого файла
 *
 * @param {Object} params - Параметры запроса
 * @param {string} params.fileId - ID или URL файла
 * @param {number} params.maxLength - Максимальная длина текста
 * @param {boolean} params.keepTempFile - Не удалять временный файл
 * @returns {TextOutput} JSON ответ с содержимым файла
 */
function handleGetFileContent(params) {
  try {
    Logger.log('📄 handleGetFileContent');
    Logger.log('  - params: ' + JSON.stringify(params));

    if (!params.fileId && !params.fileUrl) {
      return createErrorResponse('Не указан fileId или fileUrl');
    }

    var fileUrlOrId = params.fileId || params.fileUrl;

    var options = {
      maxLength: params.maxLength ? parseInt(params.maxLength, 10) : 50000,
      keepTempFile: params.keepTempFile === 'true' || params.keepTempFile === true
    };

    var result = getFileContent(fileUrlOrId, options);

    if (result.success) {
      // Возвращаем result напрямую, createJsonResponse сам обернёт в {success, data}
      return createJsonResponse(result);
    } else {
      return createErrorResponse(result.error);
    }

  } catch (error) {
    Logger.log('❌ handleGetFileContent ошибка: ' + error.toString());
    return createErrorResponse('Ошибка: ' + error.toString());
  }
}

// ============================================================================
// ФУНКЦИИ РАБОТЫ С ФОТО ОБСЛУЖИВАНИЯ
// ============================================================================

/**
 * Загрузить фото обслуживания в папку оборудования
 *
 * Создает подпапку "Фото обслуживания" если её нет, затем сохраняет фото с именем
 * формата: YYYY-MM-DD_ТипРабот_Описание.jpg
 *
 * @param {string} equipmentId - ID оборудования
 * @param {string} photoBase64 - Фото в формате Base64 (без префикса data:image/...)
 * @param {string} mimeType - MIME тип изображения (image/jpeg, image/png)
 * @param {string} description - Описание фото (используется в имени файла)
 * @param {string} date - Дата работ (YYYY-MM-DD)
 * @param {string} maintenanceType - Тип работ (ТО, Ремонт и т.д.)
 * @returns {Object} {success, fileId, fileUrl, thumbnailUrl, fileName}
 */
function uploadMaintenancePhoto(equipmentId, photoBase64, mimeType, description, date, maintenanceType) {
  try {
    Logger.log('📷 uploadMaintenancePhoto');
    Logger.log('  - equipmentId: ' + equipmentId);
    Logger.log('  - mimeType: ' + mimeType);
    Logger.log('  - description: ' + description);
    Logger.log('  - date: ' + date);
    Logger.log('  - maintenanceType: ' + maintenanceType);
    Logger.log('  - photoBase64 length: ' + (photoBase64 ? photoBase64.length : 0));

    // Валидация параметров
    if (!equipmentId) {
      throw new Error('ID оборудования не указан');
    }
    if (!photoBase64) {
      throw new Error('Фото не предоставлено');
    }
    if (!mimeType) {
      mimeType = 'image/jpeg'; // По умолчанию JPEG
    }

    // Получаем оборудование для доступа к папке
    var equipment = getEquipmentById(equipmentId);
    if (!equipment) {
      throw new Error('Оборудование с ID ' + equipmentId + ' не найдено');
    }

    if (!equipment.googleDriveUrl) {
      throw new Error('У оборудования нет папки Google Drive');
    }

    // Получаем папку оборудования
    var equipmentFolderId = extractDriveIdFromUrl(equipment.googleDriveUrl);
    var equipmentFolder = DriveApp.getFolderById(equipmentFolderId);
    Logger.log('  - Папка оборудования: "' + equipmentFolder.getName() + '"');

    // Ищем или создаем подпапку "Фото обслуживания"
    var photosFolderName = 'Фото обслуживания';
    var photosFolder = null;

    var subFolders = equipmentFolder.getFoldersByName(photosFolderName);
    if (subFolders.hasNext()) {
      photosFolder = subFolders.next();
      Logger.log('  - Найдена существующая подпапка: "' + photosFolderName + '"');
    } else {
      photosFolder = equipmentFolder.createFolder(photosFolderName);
      Logger.log('  - Создана новая подпапка: "' + photosFolderName + '"');
    }

    // Формируем имя файла: YYYY-MM-DD_ТипРабот_Описание
    var safeDate = date ? date.replace(/[/\\:*?"<>|]/g, '-') : new Date().toISOString().split('T')[0];
    var safeType = maintenanceType ? maintenanceType.replace(/[/\\:*?"<>|]/g, '_') : 'Обслуживание';
    var safeDesc = description ? description.replace(/[/\\:*?"<>|]/g, '_').substring(0, 50) : 'фото';

    // Определяем расширение файла по MIME типу
    var extension = '.jpg';
    if (mimeType === 'image/png') {
      extension = '.png';
    } else if (mimeType === 'image/gif') {
      extension = '.gif';
    } else if (mimeType === 'image/webp') {
      extension = '.webp';
    }

    var fileName = safeDate + '_' + safeType + '_' + safeDesc + extension;
    Logger.log('  - Имя файла: "' + fileName + '"');

    // Декодируем Base64 в Blob
    var photoBlob = Utilities.newBlob(
      Utilities.base64Decode(photoBase64),
      mimeType,
      fileName
    );

    // Создаем файл в папке
    var file = photosFolder.createFile(photoBlob);
    Logger.log('  - Файл создан: ' + file.getId());

    // Получаем URL и thumbnail
    var fileUrl = file.getUrl();
    var thumbnailUrl = 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w400';

    Logger.log('✅ Фото успешно загружено');
    Logger.log('  - File ID: ' + file.getId());
    Logger.log('  - File URL: ' + fileUrl);

    return {
      success: true,
      fileId: file.getId(),
      fileUrl: fileUrl,
      thumbnailUrl: thumbnailUrl,
      fileName: fileName,
      folderUrl: photosFolder.getUrl()
    };

  } catch (error) {
    Logger.log('❌ Ошибка uploadMaintenancePhoto: ' + error.toString());
    Logger.log('  - Stack: ' + (error.stack || 'нет стека'));
    throw error;
  }
}

/**
 * Загрузить документ обслуживания в Google Drive
 *
 * Загружает файл (PDF, Word, Excel, изображение и т.д.) в подпапку
 * "Документы обслуживания" внутри папки оборудования.
 * Файлы привязываются к конкретной записи журнала через entryId в имени файла.
 *
 * @param {string} equipmentId - ID оборудования
 * @param {string} fileBase64 - Base64-кодированное содержимое файла
 * @param {string} mimeType - MIME-тип файла
 * @param {string} originalFileName - Оригинальное имя файла
 * @param {string} date - Дата обслуживания (YYYY-MM-DD)
 * @param {string} entryId - ID записи журнала обслуживания
 * @returns {Object} {success, fileId, fileUrl, fileName, mimeType, size}
 */
function uploadMaintenanceDocument(equipmentId, fileBase64, mimeType, originalFileName, date, entryId) {
  try {
    Logger.log('📎 uploadMaintenanceDocument');
    Logger.log('  - equipmentId: ' + equipmentId);
    Logger.log('  - mimeType: ' + mimeType);
    Logger.log('  - originalFileName: ' + originalFileName);
    Logger.log('  - date: ' + date);
    Logger.log('  - entryId: ' + entryId);
    Logger.log('  - fileBase64 length: ' + (fileBase64 ? fileBase64.length : 0));

    if (!equipmentId) {
      throw new Error('ID оборудования не указан');
    }
    if (!fileBase64) {
      throw new Error('Файл не предоставлен');
    }
    if (!entryId) {
      throw new Error('ID записи журнала не указан');
    }

    mimeType = mimeType || 'application/octet-stream';

    // Получаем оборудование для доступа к папке
    var equipment = getEquipmentById(equipmentId);
    if (!equipment) {
      throw new Error('Оборудование с ID ' + equipmentId + ' не найдено');
    }

    if (!equipment.googleDriveUrl) {
      throw new Error('У оборудования нет папки Google Drive');
    }

    // Получаем папку оборудования
    var equipmentFolderId = extractDriveIdFromUrl(equipment.googleDriveUrl);
    var equipmentFolder = DriveApp.getFolderById(equipmentFolderId);

    // Ищем или создаем подпапку "Документы обслуживания"
    var docsFolderName = 'Документы обслуживания';
    var docsFolder = null;

    var subFolders = equipmentFolder.getFoldersByName(docsFolderName);
    if (subFolders.hasNext()) {
      docsFolder = subFolders.next();
    } else {
      docsFolder = equipmentFolder.createFolder(docsFolderName);
      Logger.log('  - Создана подпапка: "' + docsFolderName + '"');
    }

    // Формируем имя файла: YYYY-MM-DD_entryId_originalName
    var safeDate = date ? date.replace(/[/\\:*?"<>|]/g, '-') : new Date().toISOString().split('T')[0];
    var safeName = originalFileName ? originalFileName.replace(/[/\\:*?"<>|]/g, '_') : 'document';
    // Укорачиваем entryId до первых 8 символов для читабельности
    var shortEntryId = entryId ? entryId.substring(0, 8) : '';
    var fileName = safeDate + '_' + shortEntryId + '_' + safeName;

    // Ограничиваем длину имени файла
    if (fileName.length > 150) {
      fileName = fileName.substring(0, 150);
    }

    Logger.log('  - Имя файла: "' + fileName + '"');

    // Декодируем Base64 в Blob
    var fileBlob = Utilities.newBlob(
      Utilities.base64Decode(fileBase64),
      mimeType,
      fileName
    );

    // Создаем файл в папке
    var file = docsFolder.createFile(fileBlob);
    var fileUrl = file.getUrl();
    var fileSize = file.getSize();

    Logger.log('✅ Документ загружен');
    Logger.log('  - File ID: ' + file.getId());
    Logger.log('  - File URL: ' + fileUrl);
    Logger.log('  - Size: ' + fileSize);

    return {
      success: true,
      fileId: file.getId(),
      fileUrl: fileUrl,
      fileName: fileName,
      mimeType: mimeType,
      size: fileSize
    };

  } catch (error) {
    Logger.log('❌ Ошибка uploadMaintenanceDocument: ' + error.toString());
    throw error;
  }
}

/**
 * Получить список всех фото обслуживания для оборудования
 *
 * Ищет подпапку "Фото обслуживания" в папке оборудования и возвращает
 * список всех изображений с метаданными
 *
 * @param {string} equipmentId - ID оборудования
 * @returns {Object} {success, photos: [{id, name, url, thumbnailUrl, createdTime}], folderUrl}
 */
function getMaintenancePhotos(equipmentId) {
  try {
    Logger.log('📷 getMaintenancePhotos');
    Logger.log('  - equipmentId: ' + equipmentId);

    if (!equipmentId) {
      throw new Error('ID оборудования не указан');
    }

    // Получаем оборудование
    var equipment = getEquipmentById(equipmentId);
    if (!equipment) {
      throw new Error('Оборудование с ID ' + equipmentId + ' не найдено');
    }

    if (!equipment.googleDriveUrl) {
      return {
        success: true,
        photos: [],
        folderUrl: null,
        message: 'У оборудования нет папки Google Drive'
      };
    }

    // Получаем папку оборудования
    var equipmentFolderId = extractDriveIdFromUrl(equipment.googleDriveUrl);
    var equipmentFolder = DriveApp.getFolderById(equipmentFolderId);

    // Ищем подпапку "Фото обслуживания"
    var photosFolderName = 'Фото обслуживания';
    var photosFolder = null;

    var subFolders = equipmentFolder.getFoldersByName(photosFolderName);
    if (subFolders.hasNext()) {
      photosFolder = subFolders.next();
    } else {
      // Папка с фото еще не создана
      return {
        success: true,
        photos: [],
        folderUrl: null,
        message: 'Папка "Фото обслуживания" еще не создана'
      };
    }

    Logger.log('  - Папка с фото: "' + photosFolder.getName() + '"');

    // Получаем все файлы-изображения из папки
    var files = photosFolder.getFiles();
    var photos = [];

    var imageTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/bmp'
    ];

    while (files.hasNext()) {
      var file = files.next();
      var mimeType = file.getMimeType();

      // Проверяем, что это изображение
      if (imageTypes.indexOf(mimeType) !== -1) {
        var photoData = {
          id: file.getId(),
          name: file.getName(),
          url: file.getUrl(),
          thumbnailUrl: 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w400',
          createdTime: file.getDateCreated().toISOString(),
          size: file.getSize(),
          mimeType: mimeType
        };
        photos.push(photoData);
      }
    }

    // Сортируем по дате создания (новые сначала)
    photos.sort(function(a, b) {
      return new Date(b.createdTime) - new Date(a.createdTime);
    });

    Logger.log('  - Найдено фото: ' + photos.length);

    return {
      success: true,
      photos: photos,
      folderUrl: photosFolder.getUrl()
    };

  } catch (error) {
    Logger.log('❌ Ошибка getMaintenancePhotos: ' + error.toString());
    Logger.log('  - Stack: ' + (error.stack || 'нет стека'));
    throw error;
  }
}

