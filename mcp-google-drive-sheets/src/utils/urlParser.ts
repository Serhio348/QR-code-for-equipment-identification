/**
 * urlParser.ts
 *
 * Утилиты для работы с URL Google Drive.
 * Извлекает ID папок и файлов из различных форматов ссылок.
 */

// ============================================
// Регулярные выражения для парсинга URL
// ============================================

/**
 * Паттерны для извлечения ID из URL Google Drive.
 *
 * Примеры URL:
 * - https://drive.google.com/drive/folders/1ABC123xyz
 * - https://drive.google.com/open?id=1ABC123xyz
 * - https://drive.google.com/file/d/1ABC123xyz/view
 * - 1ABC123xyz (просто ID)
 */
const DRIVE_URL_PATTERNS = [
  // /folders/ID
  /\/folders\/([a-zA-Z0-9_-]+)/,

  // /file/d/ID
  /\/file\/d\/([a-zA-Z0-9_-]+)/,

  // ?id=ID или &id=ID
  /[?&]id=([a-zA-Z0-9_-]+)/,

  // open?id=ID
  /open\?id=([a-zA-Z0-9_-]+)/,
];

/**
 * Паттерн для проверки, является ли строка валидным ID.
 * ID Google Drive состоит из букв, цифр, дефисов и подчеркиваний.
 */
const ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

// ============================================
// Основные функции
// ============================================

/**
 * Извлекает ID из URL Google Drive.
 *
 * @param urlOrId - URL Google Drive или сам ID
 * @returns ID папки/файла или null если не удалось извлечь
 *
 * @example
 * extractDriveId('https://drive.google.com/drive/folders/1ABC123')
 * // Возвращает: '1ABC123'
 *
 * extractDriveId('1ABC123')
 * // Возвращает: '1ABC123'
 *
 * extractDriveId('invalid-url')
 * // Возвращает: null
 */
export function extractDriveId(urlOrId: string): string | null {
  // Убираем пробелы по краям
  const trimmed = urlOrId.trim();

  // Если пустая строка
  if (!trimmed) {
    return null;
  }

  // Проверяем, не является ли строка уже ID
  // ID обычно не содержит точек и слешей (в отличие от URL)
  if (ID_PATTERN.test(trimmed) && !trimmed.includes('.') && !trimmed.includes('/')) {
    return trimmed;
  }

  // Пробуем каждый паттерн
  for (const pattern of DRIVE_URL_PATTERNS) {
    // .exec() возвращает массив совпадений или null
    const match = pattern.exec(trimmed);

    if (match && match[1]) {
      // match[0] - полное совпадение
      // match[1] - первая группа захвата (ID)
      return match[1];
    }
  }

  // Ничего не нашли
  return null;
}

/**
 * Проверяет, является ли строка валидным URL Google Drive.
 *
 * @param url - Строка для проверки
 * @returns true если это URL Google Drive
 */
export function isDriveUrl(url: string): boolean {
  return url.includes('drive.google.com') || url.includes('docs.google.com');
}

/**
 * Создает URL папки по ID.
 *
 * @param folderId - ID папки
 * @returns URL папки
 */
export function buildFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}

/**
 * Создает URL файла по ID.
 *
 * @param fileId - ID файла
 * @returns URL файла
 */
export function buildFileUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}