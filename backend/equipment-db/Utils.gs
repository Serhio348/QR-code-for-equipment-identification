/**
 * Utils.gs
 * 
 * Утилитарные функции для работы с данными
 * 
 * Этот модуль содержит вспомогательные функции, которые используются
 * в различных частях приложения для форматирования, генерации ID и т.д.
 * 
 * Все функции работают независимо от Google Sheets и могут быть использованы
 * в любом контексте приложения.
 */

// ============================================================================
// ФУНКЦИИ ФОРМАТИРОВАНИЯ
// ============================================================================

/**
 * Форматирование даты в формат YYYY-MM-DD
 * 
 * Преобразует дату из различных форматов (Date объект, строка, число)
 * в единый формат YYYY-MM-DD для использования в API
 * 
 * @param {*} dateValue - Дата в любом формате (Date, строка, число)
 * @returns {string} Дата в формате YYYY-MM-DD или пустая строка, если дата невалидна
 * 
 * Примеры:
 * formatDate(new Date(2024, 0, 15)) -> "2024-01-15"
 * formatDate("2024-01-15") -> "2024-01-15"
 * formatDate(null) -> ""
 */
function formatDate(dateValue) {
  // Обрабатываем все случаи пустых значений
  // null, undefined, пустая строка, 0, false - все вернет пустую строку
  if (!dateValue || dateValue === '' || dateValue === null || dateValue === undefined) {
    return '';
  }
  
  try {
    // Если значение уже в формате YYYY-MM-DD, возвращаем как есть
    if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      return dateValue;
    }
    
    // Если это объект Date (из Google Sheets), используем его напрямую
    let date;
    if (dateValue instanceof Date) {
      date = dateValue;
      Logger.log('  - Это объект Date из Google Sheets');
      Logger.log('  - date.toString(): ' + date.toString());
      Logger.log('  - date.toISOString(): ' + date.toISOString());
      Logger.log('  - date.getFullYear(): ' + date.getFullYear());
      Logger.log('  - date.getMonth(): ' + date.getMonth());
      Logger.log('  - date.getDate(): ' + date.getDate());
    } else {
      // Создаем объект Date из переданного значения
      date = new Date(dateValue);
      Logger.log('  - Создан объект Date из: ' + dateValue);
      Logger.log('  - date.toString(): ' + date.toString());
    }
    
    // Проверяем, что дата валидна (не Invalid Date)
    if (isNaN(date.getTime())) {
      Logger.log('  - ❌ Невалидная дата');
      return '';
    }
    
    // ВАЖНО: Используем локальные компоненты даты (getFullYear, getMonth, getDate)
    // вместо UTC компонентов, чтобы избежать проблем с часовыми поясами
    // Google Sheets хранит даты в локальном времени, поэтому мы должны использовать
    // локальные компоненты для форматирования
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // месяцы начинаются с 0
    const day = String(date.getDate()).padStart(2, '0');
    
    const result = year + '-' + month + '-' + day;
    Logger.log('  - ✅ Результат форматирования: ' + result);
    return result;
  } catch (e) {
    // При любой ошибке возвращаем пустую строку
    // Это безопасно - пустая дата не вызовет проблем в приложении
    Logger.log('Ошибка форматирования даты: ' + e + ', значение: ' + dateValue);
    return '';
  }
}

// ============================================================================
// ФУНКЦИИ ГЕНЕРАЦИИ ID
// ============================================================================

/**
 * Генерация уникального ID (UUID)
 * 
 * Использует встроенную функцию Google Apps Script для генерации UUID
 * UUID гарантирует уникальность идентификатора
 * 
 * @returns {string} UUID в формате "550e8400-e29b-41d4-a716-446655440000"
 * 
 * Пример:
 * generateId() -> "550e8400-e29b-41d4-a716-446655440000"
 */
function generateId() {
  // Utilities.getUuid() генерирует UUID версии 4
  return Utilities.getUuid();
}

