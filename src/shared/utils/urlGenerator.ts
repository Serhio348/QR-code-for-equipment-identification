/**
 * Утилиты для генерации уникальных URL для оборудования
 */

/**
 * Генерирует URL для QR-кода оборудования
 * 
 * @param equipmentId - ID оборудования
 * @param baseUrl - Базовый URL приложения (опционально, по умолчанию берется из window.location)
 * @returns URL для QR-кода
 */
export function generateQRCodeUrl(
  equipmentId: string,
  baseUrl?: string
): string {
  const appBaseUrl = baseUrl || (typeof window !== 'undefined' 
    ? `${window.location.protocol}//${window.location.host}` 
    : '');
  
  return `${appBaseUrl}/equipment/${equipmentId}`;
}

export function isGoogleDriveUrl(url: string | null | undefined): boolean {
  const value = url?.trim().toLowerCase() ?? '';
  return value.includes('drive.google.com') || value.includes('docs.google.com');
}

export function getEquipmentQrUrl(
  equipmentId: string,
  storedQrCodeUrl?: string | null,
  baseUrl?: string,
): string {
  const stored = storedQrCodeUrl?.trim() ?? '';
  if (stored && !isGoogleDriveUrl(stored)) return stored;
  return generateQRCodeUrl(equipmentId, baseUrl);
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
