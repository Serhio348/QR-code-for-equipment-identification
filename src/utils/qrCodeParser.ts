/**
 * Утилита для парсинга QR-кодов
 * Извлекает ID оборудования из различных форматов QR-кодов
 */

/**
 * Извлекает ID оборудования из текста QR-кода
 * 
 * @param qrCodeText - Текст из отсканированного QR-кода
 * @returns ID оборудования или null, если не удалось извлечь
 * 
 * @example
 * parseEquipmentId("550e8400-e29b-41d4-a716-446655440000") // "550e8400-e29b-41d4-a716-446655440000"
 * parseEquipmentId("/equipment/550e8400-e29b-41d4-a716-446655440000") // "550e8400-e29b-41d4-a716-446655440000"
 * parseEquipmentId("https://drive.google.com/drive/folders/1t90itk12veviwYM1LH7DZ15G4slpPnon") // "DRIVE:1t90itk12veviwYM1LH7DZ15G4slpPnon"
 */
export function parseEquipmentId(qrCodeText: string): string | null {
  if (!qrCodeText || typeof qrCodeText !== 'string') {
    return null;
  }

  const cleaned = qrCodeText.trim();

  // Вариант 1: Прямой UUID (стандартный формат ID)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(cleaned)) {
    return cleaned;
  }

  // Вариант 2: URL приложения с ID оборудования
  const equipmentMatch = cleaned.match(/\/equipment\/([^/?\s]+)/i);
  if (equipmentMatch && equipmentMatch[1]) {
    return equipmentMatch[1];
  }

  // Вариант 3: Google Drive URL - извлекаем ID папки
  const driveMatch = cleaned.match(/drive\.google\.com\/drive\/folders\/([^/?&\s]+)/i);
  if (driveMatch && driveMatch[1]) {
    return `DRIVE:${driveMatch[1]}`;
  }

  // Вариант 3.1: Google Drive URL с параметром id
  const driveIdMatch = cleaned.match(/[?&]id=([^&\s]+)/i);
  if (driveIdMatch && driveIdMatch[1]) {
    return `DRIVE:${driveIdMatch[1]}`;
  }

  return null;
}

/**
 * Извлекает Google Drive ID из текста QR-кода
 * 
 * @param qrCodeText - Текст из отсканированного QR-кода
 * @returns Google Drive ID или null
 */
export function extractDriveId(qrCodeText: string): string | null {
  const equipmentId = parseEquipmentId(qrCodeText);
  if (equipmentId && equipmentId.startsWith('DRIVE:')) {
    return equipmentId.replace('DRIVE:', '');
  }
  return null;
}

/**
 * Проверяет, является ли ID маркером Google Drive
 * 
 * @param id - ID оборудования или Drive ID
 * @returns true если это маркер Google Drive
 */
export function isDriveId(id: string): boolean {
  return id.startsWith('DRIVE:');
}

