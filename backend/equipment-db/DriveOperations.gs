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
 * 
 * Зависимости:
 * - extractDriveIdFromUrl() - для извлечения ID из URL
 */
function getFolderFiles(folderUrlOrId) {
  try {
    Logger.log('📁 Получение списка файлов из папки');
    Logger.log('  - folderUrlOrId: ' + folderUrlOrId);
    
    if (!folderUrlOrId || !folderUrlOrId.trim()) {
      throw new Error('URL или ID папки не указан');
    }
    
    const folderId = extractDriveIdFromUrl(folderUrlOrId);
    
    if (!folderId) {
      throw new Error('Неверный формат URL папки: ' + folderUrlOrId);
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

