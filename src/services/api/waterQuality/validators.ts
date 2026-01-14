/**
 * Модуль валидации для API качества воды
 */

/**
 * Валидация ISO строки даты
 */
export function validateISODate(dateString: string, fieldName: string): void {
  if (!dateString || typeof dateString !== 'string') {
    throw new Error(`${fieldName} должна быть строкой`);
  }

  const isoDatePattern = '^\\d{4}-\\d{2}-\\d{2}(T\\d{2}:\\d{2}:\\d{2}(\\.\\d{3})?(Z|[+-]\\d{2}:\\d{2}))?)?$';
  const isoDateRegex = new RegExp(isoDatePattern);
  
  if (!isoDateRegex.test(dateString.trim())) {
    throw new Error(`${fieldName} должна быть в формате ISO 8601: YYYY-MM-DD или YYYY-MM-DDTHH:mm:ss.sssZ`);
  }

  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    throw new Error(`${fieldName} содержит невалидную дату`);
  }

  // Проверка на несуществующие даты (например, 2024-02-30 автоматически становится 2024-03-01)
  // Извлекаем только дату (без времени) для сравнения
  const inputDatePart = dateString.trim().split('T')[0];
  const isoFormatted = date.toISOString().split('T')[0];
  
  if (isoFormatted !== inputDatePart) {
    throw new Error(`${fieldName} содержит несуществующую дату: ${inputDatePart}`);
  }
}

/**
 * Валидация ID
 */
export function validateId(id: string, fieldName: string = 'ID'): void {
  if (!id || !id.trim()) {
    throw new Error(`${fieldName} обязателен`);
  }
}

/**
 * Валидация лимита
 */
export function validateLimit(limit: number, maxLimit: number = 10000): number {
  return Math.min(Math.max(1, limit), maxLimit);
}
