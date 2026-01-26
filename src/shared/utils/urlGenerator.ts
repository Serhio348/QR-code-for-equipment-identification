/**
 * Утилиты для генерации уникальных URL для оборудования
 */

/**
 * Генерирует URL для QR-кода оборудования
 * 
 * @param equipmentId - ID оборудования
 * @param googleDriveUrl - URL папки Google Drive (опционально)
 * @param baseUrl - Базовый URL приложения (опционально, по умолчанию берется из window.location)
 * @returns URL для QR-кода
 */
export function generateQRCodeUrl(
  equipmentId: string,
  googleDriveUrl?: string,
  baseUrl?: string
): string {
  // Если указан Google Drive URL, используем его
  if (googleDriveUrl && googleDriveUrl.trim()) {
    return googleDriveUrl.trim();
  }
  
  // Иначе генерируем ссылку на страницу оборудования в приложении
  const appBaseUrl = baseUrl || (typeof window !== 'undefined' 
    ? `${window.location.protocol}//${window.location.host}` 
    : '');
  
  return `${appBaseUrl}/equipment/${equipmentId}`;
}

/**
 * Генерирует короткий URL для QR-кода (опционально)
 * Можно использовать для создания более коротких ссылок через сервисы типа bit.ly
 * 
 * @param equipmentId - ID оборудования
 * @param baseUrl - Базовый URL приложения
 * @returns Короткий URL
 */
export function generateShortUrl(equipmentId: string, baseUrl?: string): string {
  const appBaseUrl = baseUrl || (typeof window !== 'undefined' 
    ? `${window.location.protocol}//${window.location.host}` 
    : '');
  
  // Можно использовать более короткий путь, например /e/:id
  return `${appBaseUrl}/e/${equipmentId}`;
}
