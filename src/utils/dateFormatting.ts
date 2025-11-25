/**
 * Утилиты для форматирования дат
 * 
 * ВАЖНО: Не используем new Date() для парсинга, чтобы избежать проблем с часовыми поясами
 * Форматируем напрямую из компонентов строки
 */

const MONTH_NAMES = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
];

/**
 * Форматирует дату в читаемый формат (например: "15 января 2024 г.")
 * 
 * @param {string} dateString - Дата в формате YYYY-MM-DD или ISO строке
 * @returns {string} Отформатированная дата или "—" если дата невалидна
 * 
 * @example
 * formatDate('2024-01-15') // "15 января 2024 г."
 * formatDate('2024-01-15T00:00:00.000Z') // "15 января 2024 г."
 */
export function formatDate(dateString?: string): string {
  if (!dateString) return '—';
  
  // Убираем возможное время из строки даты (если есть)
  // Например: "2024-01-15T00:00:00.000Z" -> "2024-01-15"
  const dateOnly = dateString.split('T')[0].split(' ')[0].trim();
  
  // Проверяем, что это формат YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    const [year, month, day] = dateOnly.split('-').map(Number);
    
    // Проверяем валидность месяца и дня
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      console.warn('⚠️ Невалидная дата:', { year, month, day, dateOnly });
      return '—';
    }
    
    return `${day} ${MONTH_NAMES[month - 1]} ${year} г.`;
  }
  
  // Для других форматов пытаемся извлечь дату без использования new Date()
  const match = dateString.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, year, month, day] = match.map(Number);
    
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${day} ${MONTH_NAMES[month - 1]} ${year} г.`;
    }
  }
  
  console.warn('⚠️ Не удалось распарсить дату:', dateString);
  return '—';
}

