/**
 * AdminSetup.gs
 * 
 * Вспомогательные функции для настройки первого администратора
 * 
 * Эти функции можно использовать для первоначальной настройки системы
 * или для добавления администраторов через Google Apps Script редактор
 */

/**
 * Добавить первого администратора
 * 
 * Используйте эту функцию для добавления первого администратора в систему.
 * Выполните: Выполнить → addFirstAdmin
 * 
 * @param {string} email - Email администратора
 * @param {string} note - Примечание (опционально)
 */
function addFirstAdmin(email, note) {
  if (!email) {
    Logger.log('❌ Email не указан');
    Logger.log('Использование: addFirstAdmin("user@example.com", "Первый администратор")');
    return;
  }
  
  Logger.log('👤 Добавление первого администратора: ' + email);
  
  const result = addAdminManually(email, note || 'Первый администратор');
  
  if (result.success) {
    Logger.log('✅ Администратор успешно добавлен!');
    Logger.log('   Email: ' + email);
    Logger.log('   При следующем входе пользователь получит роль администратора');
  } else {
    Logger.log('❌ Ошибка: ' + result.message);
  }
  
  return result;
}

/**
 * Проверить, является ли пользователь администратором
 * 
 * @param {string} email - Email пользователя
 */
function checkAdminStatus(email) {
  if (!email) {
    Logger.log('❌ Email не указан');
    Logger.log('Использование: checkAdminStatus("user@example.com")');
    return;
  }
  
  Logger.log('👑 Проверка статуса администратора для: ' + email);
  
  const role = verifyAdminAccess(email);
  
  Logger.log('   Роль: ' + role);
  Logger.log('   Является администратором: ' + (role === 'admin' ? 'ДА' : 'НЕТ'));
  
  return role;
}

/**
 * Получить список всех администраторов
 */
function listAllAdmins() {
  Logger.log('📋 Список всех администраторов:');
  
  const admins = getAllAdmins();
  
  if (admins.length === 0) {
    Logger.log('   Администраторы не найдены');
    return;
  }
  
  admins.forEach((admin, index) => {
    Logger.log('   ' + (index + 1) + '. ' + admin.email);
    Logger.log('      - Добавлен: ' + admin.addedAt);
    Logger.log('      - Вручную: ' + admin.addedManually);
    Logger.log('      - Приоритет: ' + admin.priority);
    if (admin.note) {
      Logger.log('      - Примечание: ' + admin.note);
    }
  });
  
  return admins;
}

// ============================================================================
// ТЕСТОВЫЕ ФУНКЦИИ ДЛЯ ПРОВЕРКИ ИНТЕГРАЦИИ С GOOGLE DRIVE
// ============================================================================

/**
 * Тест: Получить владельцев корневой папки Google Drive
 * 
 * Запустите: Выполнить → testGetDriveFolderOwners
 * 
 * Эта функция проверяет, что система может получить список владельцев папки
 */
function testGetDriveFolderOwners() {
  try {
    Logger.log('🧪 Тест: Получение владельцев корневой папки Google Drive');
    Logger.log('');
    
    // Получаем ID корневой папки
    const folderId = getAdminCheckFolderId();
    Logger.log('📁 ID папки для проверки: ' + (folderId || 'не получен'));
    
    if (!folderId) {
      Logger.log('❌ Не удалось получить ID папки');
      return;
    }
    
    // Получаем владельцев
    Logger.log('🔍 Получение владельцев папки...');
    const owners = getDriveFolderOwners(folderId);
    
    Logger.log('');
    Logger.log('✅ Результат:');
    Logger.log('   Найдено владельцев: ' + owners.length);
    
    if (owners.length === 0) {
      Logger.log('   ⚠️ Владельцы не найдены. Проверьте:');
      Logger.log('      1. Доступ к Google Drive предоставлен');
      Logger.log('      2. Drive API включен в расширенных сервисах');
      Logger.log('      3. Папка существует и доступна');
    } else {
      Logger.log('   📧 Email адреса владельцев:');
      owners.forEach((email, index) => {
        Logger.log('      ' + (index + 1) + '. ' + email);
      });
    }
    
    return owners;
  } catch (error) {
    Logger.log('❌ Ошибка при тестировании: ' + error.toString());
    Logger.log('   Stack: ' + (error.stack || 'нет стека'));
    throw error;
  }
}

/**
 * Тест: Проверка прав администратора для текущего пользователя
 * 
 * Запустите: Выполнить → testVerifyAdminForCurrentUser
 * 
 * Эта функция проверяет права администратора для email текущего пользователя
 */
function testVerifyAdminForCurrentUser() {
  try {
    Logger.log('🧪 Тест: Проверка прав администратора для текущего пользователя');
    Logger.log('');
    
    // Получаем email текущего пользователя
    const currentUser = Session.getActiveUser();
    const userEmail = currentUser.getEmail();
    
    Logger.log('👤 Текущий пользователь: ' + userEmail);
    Logger.log('');
    
    if (!userEmail) {
      Logger.log('❌ Не удалось получить email текущего пользователя');
      Logger.log('   Попробуйте запустить функцию через веб-приложение');
      return;
    }
    
    // Проверяем права
    Logger.log('🔍 Проверка прав администратора...');
    const role = verifyAdminAccess(userEmail);
    
    Logger.log('');
    Logger.log('✅ Результат:');
    Logger.log('   Email: ' + userEmail);
    Logger.log('   Роль: ' + role);
    Logger.log('   Является администратором: ' + (role === 'admin' ? '✅ ДА' : '❌ НЕТ'));
    
    // Получаем список всех администраторов для сравнения
    Logger.log('');
    Logger.log('📋 Список всех администраторов в системе:');
    const admins = getAllAdmins();
    if (admins.length === 0) {
      Logger.log('   Администраторы не найдены');
    } else {
      admins.forEach((admin, index) => {
        const isCurrentUser = admin.email.toLowerCase() === userEmail.toLowerCase();
        Logger.log('   ' + (index + 1) + '. ' + admin.email + (isCurrentUser ? ' ← ВЫ' : ''));
        Logger.log('      - Источник: ' + (admin.addedManually ? 'Резервный список' : 'Google Drive'));
        Logger.log('      - Приоритет: ' + admin.priority);
      });
    }
    
    return {
      email: userEmail,
      role: role,
      isAdmin: role === 'admin'
    };
  } catch (error) {
    Logger.log('❌ Ошибка при тестировании: ' + error.toString());
    Logger.log('   Stack: ' + (error.stack || 'нет стека'));
    throw error;
  }
}

/**
 * Тест: Проверка прав администратора для конкретного email
 * 
 * Запустите: Выполнить → testVerifyAdminForEmail
 * 
 * Укажите email в переменной testEmail перед запуском
 */
function testVerifyAdminForEmail() {
  try {
    // УКАЖИТЕ EMAIL ДЛЯ ТЕСТИРОВАНИЯ
    const testEmail = 'user@example.com';
    
    Logger.log('🧪 Тест: Проверка прав администратора для email');
    Logger.log('');
    
    if (testEmail === 'user@example.com') {
      Logger.log('❌ Укажите реальный email в переменной testEmail');
      Logger.log('   Пример: const testEmail = "admin@company.com";');
      return;
    }
    
    Logger.log('👤 Email для проверки: ' + testEmail);
    Logger.log('');
    
    // Проверяем права
    Logger.log('🔍 Проверка прав администратора...');
    const role = verifyAdminAccess(testEmail);
    
    Logger.log('');
    Logger.log('✅ Результат:');
    Logger.log('   Email: ' + testEmail);
    Logger.log('   Роль: ' + role);
    Logger.log('   Является администратором: ' + (role === 'admin' ? '✅ ДА' : '❌ НЕТ'));
    
    // Проверяем, найден ли в списке администраторов
    Logger.log('');
    Logger.log('📋 Проверка в списке администраторов:');
    const admins = getAllAdmins();
    const foundAdmin = admins.find(function(admin) {
      return admin.email.toLowerCase() === testEmail.toLowerCase();
    });
    
    if (foundAdmin) {
      Logger.log('   ✅ Найден в списке администраторов:');
      Logger.log('      - Источник: ' + (foundAdmin.addedManually ? 'Резервный список' : 'Google Drive'));
      Logger.log('      - Приоритет: ' + foundAdmin.priority);
      if (foundAdmin.note) {
        Logger.log('      - Примечание: ' + foundAdmin.note);
      }
    } else {
      Logger.log('   ❌ Не найден в списке администраторов');
    }
    
    return {
      email: testEmail,
      role: role,
      isAdmin: role === 'admin',
      foundInAdminsList: !!foundAdmin
    };
  } catch (error) {
    Logger.log('❌ Ошибка при тестировании: ' + error.toString());
    Logger.log('   Stack: ' + (error.stack || 'нет стека'));
    throw error;
  }
}

/**
 * Полный тест интеграции с Google Drive
 * 
 * Запустите: Выполнить → testFullDriveIntegration
 * 
 * Эта функция выполняет все тесты интеграции с Google Drive
 */
function testFullDriveIntegration() {
  try {
    Logger.log('🧪 ПОЛНЫЙ ТЕСТ ИНТЕГРАЦИИ С GOOGLE DRIVE');
    Logger.log('='.repeat(60));
    Logger.log('');
    
    // Тест 1: Получение ID папки
    Logger.log('📋 Тест 1: Получение ID папки для проверки');
    Logger.log('-'.repeat(60));
    const folderId = getAdminCheckFolderId();
    if (folderId) {
      Logger.log('✅ ID папки получен: ' + folderId);
    } else {
      Logger.log('❌ Не удалось получить ID папки');
      return;
    }
    Logger.log('');
    
    // Тест 2: Получение владельцев папки
    Logger.log('📋 Тест 2: Получение владельцев папки');
    Logger.log('-'.repeat(60));
    const owners = getDriveFolderOwners(folderId);
    Logger.log('✅ Найдено владельцев: ' + owners.length);
    if (owners.length > 0) {
      Logger.log('   Email адреса:');
      owners.forEach((email, index) => {
        Logger.log('      ' + (index + 1) + '. ' + email);
      });
    } else {
      Logger.log('   ⚠️ Владельцы не найдены');
    }
    Logger.log('');
    
    // Тест 3: Получение всех администраторов
    Logger.log('📋 Тест 3: Получение всех администраторов');
    Logger.log('-'.repeat(60));
    const admins = getAllAdmins();
    Logger.log('✅ Найдено администраторов: ' + admins.length);
    if (admins.length > 0) {
      admins.forEach((admin, index) => {
        Logger.log('   ' + (index + 1) + '. ' + admin.email);
        Logger.log('      - Источник: ' + (admin.addedManually ? 'Резервный список' : 'Google Drive'));
        Logger.log('      - Приоритет: ' + admin.priority);
      });
    }
    Logger.log('');
    
    // Тест 4: Проверка для текущего пользователя
    Logger.log('📋 Тест 4: Проверка прав для текущего пользователя');
    Logger.log('-'.repeat(60));
    const currentUser = Session.getActiveUser();
    const userEmail = currentUser.getEmail();
    if (userEmail) {
      Logger.log('👤 Текущий пользователь: ' + userEmail);
      const role = verifyAdminAccess(userEmail);
      Logger.log('✅ Роль: ' + role + (role === 'admin' ? ' (администратор)' : ' (пользователь)'));
    } else {
      Logger.log('⚠️ Не удалось получить email текущего пользователя');
    }
    Logger.log('');
    
    // Итоги
    Logger.log('='.repeat(60));
    Logger.log('📊 ИТОГИ ТЕСТИРОВАНИЯ:');
    Logger.log('   - ID папки: ' + (folderId ? '✅' : '❌'));
    Logger.log('   - Владельцы папки: ' + owners.length);
    Logger.log('   - Всего администраторов: ' + admins.length);
    Logger.log('   - Интеграция с Google Drive: ' + (owners.length > 0 ? '✅ Работает' : '⚠️ Требует проверки'));
    Logger.log('='.repeat(60));
    
    return {
      folderId: folderId,
      owners: owners,
      admins: admins,
      currentUserRole: userEmail ? verifyAdminAccess(userEmail) : null
    };
  } catch (error) {
    Logger.log('❌ Ошибка при полном тестировании: ' + error.toString());
    Logger.log('   Stack: ' + (error.stack || 'нет стека'));
    throw error;
  }
}

