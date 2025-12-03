/**
 * Утилиты для парсинга QR-кодов оборудования
 */

/**
 * Парсит QR-код и извлекает ID оборудования
 * 
 * @param qrCodeText - Текст из отсканированного QR-кода
 * @returns ID оборудования или null, если не удалось распарсить
 * 
 * @example
 * const equipmentId = parseEquipmentId('https://example.com/equipment/123');
 * // '123'
 */
export function parseEquipmentId(qrCodeText: string): string | null {
  if (!qrCodeText || typeof qrCodeText !== 'string') {
    return null;
  }

  // Убираем пробелы и переносы строк
  const cleaned = qrCodeText.trim();

  // Вариант 1: Прямой ID (UUID или другой формат)
  // Проверяем, является ли весь текст валидным ID
  if (isValidEquipmentId(cleaned)) {
    return cleaned;
  }

  // Вариант 2: URL с ID оборудования
  // Ищем паттерн /equipment/{id} в URL
  const urlMatch = cleaned.match(/\/equipment\/([^/?\s]+)/i);
  if (urlMatch && urlMatch[1]) {
    const id = urlMatch[1];
    if (isValidEquipmentId(id)) {
      return id;
    }
  }

  // Вариант 3: Google Drive URL с ID в параметрах или пути
  // Ищем ID в параметрах или в пути
  const driveMatch = cleaned.match(/drive\.google\.com\/.*[\/?]id=([^&\s]+)/i);
  if (driveMatch && driveMatch[1]) {
    // Если это Google Drive ID, нужно найти связанное оборудование
    // Но для простоты, если в URL есть /equipment/, используем его
    const equipmentMatch = cleaned.match(/\/equipment\/([^/?\s]+)/i);
    if (equipmentMatch && equipmentMatch[1]) {
      return equipmentMatch[1];
    }
  }

  // Вариант 4: Прямой URL приложения с ID
  const appUrlMatch = cleaned.match(/equipment[\/=]([^/?&\s]+)/i);
  if (appUrlMatch && appUrlMatch[1]) {
    const id = appUrlMatch[1];
    if (isValidEquipmentId(id)) {
      return id;
    }
  }

  return null;
}

/**
 * Проверяет, является ли строка валидным ID оборудования
 * 
 * @param id - Строка для проверки
 * @returns true если строка похожа на валидный ID
 */
function isValidEquipmentId(id: string): boolean {
  if (!id || id.length < 10) {
    return false;
  }

  // UUID формат (например: 550e8400-e29b-41d4-a716-446655440000)
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(id)) {
    return true;
  }

  // Другие форматы ID (например, числовые или буквенно-цифровые)
  // Минимум 10 символов, максимум 100
  if (id.length >= 10 && id.length <= 100 && /^[a-zA-Z0-9_-]+$/.test(id)) {
    return true;
  }

  return false;
}

/**
 * Извлекает URL из QR-кода (если это URL)
 * 
 * @param qrCodeText - Текст из отсканированного QR-кода
 * @returns URL или null
 */
export function extractUrl(qrCodeText: string): string | null {
  if (!qrCodeText || typeof qrCodeText !== 'string') {
    return null;
  }

  const cleaned = qrCodeText.trim();

  // Проверяем, является ли текст валидным URL
  try {
    const url = new URL(cleaned);
    return url.href;
  } catch {
    // Не валидный URL
    return null;
  }
}

/**
 * Проверяет, содержит ли QR-код информацию об оборудовании
 * 
 * @param qrCodeText - Текст из отсканированного QR-кода
 * @returns true если QR-код содержит информацию об оборудовании
 */
export function isEquipmentQRCode(qrCodeText: string): boolean {
  const equipmentId = parseEquipmentId(qrCodeText);
  return equipmentId !== null;
}

