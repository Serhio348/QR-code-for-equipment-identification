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
  // Всегда генерируем ссылку на страницу оборудования в приложении.
  // Google Drive URL относится к документации и не должен быть QR-назначением,
  // иначе одинаковые модели с общей папкой будут иметь одинаковые QR и будут открывать "первую" карточку.
  void googleDriveUrl;

  const publicBaseUrl = (typeof import.meta !== 'undefined'
    ? (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_PUBLIC_APP_URL
    : undefined) ?? '';

  const appBaseUrl = (baseUrl || publicBaseUrl || (typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.host}`
    : '')).trim().replace(/\/+$/, '');

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
