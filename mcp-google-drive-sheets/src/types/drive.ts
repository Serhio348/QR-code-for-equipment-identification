/**
 * drive.ts
 *
 * TypeScript типы для операций с Google Drive.
 */

// ============================================
// Файлы и папки
// ============================================

/**
 * Информация о файле в Google Drive.
 */
export interface DriveFile {
  /** Уникальный ID файла в Google Drive */
  id: string;

  /** Имя файла */
  name: string;

  /** Прямая ссылка на файл */
  url: string;

  /** Размер в байтах */
  size: number;

  /** MIME тип (например: 'application/pdf', 'image/jpeg') */
  mimeType: string;

  /** Дата последнего изменения (ISO 8601) */
  modifiedTime: string;

  /** URL миниатюры (для изображений) */
  thumbnailUrl?: string;
}

/**
 * Информация о папке в Google Drive.
 */
export interface DriveFolder {
  /** ID папки */
  id: string;

  /** Название папки */
  name: string;

  /** URL папки */
  url: string;

  /** ID родительской папки */
  parentId?: string;

  /** Дата создания */
  createdTime?: string;
}

// ============================================
// Результаты операций
// ============================================

/**
 * Результат создания папки.
 */
export interface CreateFolderResult {
  /** Успешность операции */
  success: boolean;

  /** ID созданной папки */
  folderId?: string;

  /** URL созданной папки */
  folderUrl?: string;

  /** Название папки */
  folderName?: string;

  /** Сообщение об ошибке */
  error?: string;
}

/**
 * Результат загрузки файла.
 */
export interface UploadFileResult {
  /** Успешность операции */
  success: boolean;

  /** ID загруженного файла */
  fileId?: string;

  /** URL файла */
  fileUrl?: string;

  /** Имя файла */
  fileName?: string;

  /** Размер файла */
  fileSize?: number;

  /** Сообщение об ошибке */
  error?: string;
}

/**
 * Результат поиска файлов.
 */
export interface SearchFilesResult {
  /** Успешность операции */
  success: boolean;

  /** Список найденных файлов */
  files?: DriveFile[];

  /** Общее количество файлов */
  totalCount?: number;

  /** Сообщение об ошибке */
  error?: string;
}

/**
 * Результат чтения содержимого файла.
 *
 * Поддерживаемые форматы:
 * - PDF: конвертируется в Google Docs с OCR
 * - Word (.doc, .docx): конвертируется в Google Docs
 * - Excel (.xls, .xlsx): конвертируется в Google Sheets
 * - Google Docs: читается напрямую
 * - Google Sheets: данные извлекаются как текст
 * - Текстовые файлы (.txt, .md, .csv, .json, .xml): читаются как есть
 */
export interface ReadFileResult {
  /** Успешность операции */
  success: boolean;

  /** Текстовое содержимое файла */
  content?: string;

  /** Имя файла */
  fileName?: string;

  /** MIME тип файла */
  mimeType?: string;

  /** Количество символов в исходном файле */
  charCount?: number;

  /** Был ли текст обрезан из-за превышения лимита */
  truncated?: boolean;

  /** Сообщение об ошибке */
  error?: string;
}

// ============================================
// Параметры запросов
// ============================================

/**
 * Параметры для загрузки файла.
 */
export interface UploadFileParams {
  /** Имя файла */
  fileName: string;

  /** Содержимое файла (Base64 или Buffer) */
  fileContent: string | Buffer;

  /** MIME тип файла */
  mimeType: string;

  /** ID папки назначения */
  folderId: string;

  /** Описание файла (опционально) */
  description?: string;
}

/**
 * Параметры для поиска файлов.
 */
export interface SearchFilesParams {
  /** ID или URL папки для поиска */
  folderUrl: string;

  /** Поисковый запрос (опционально) */
  query?: string;

  /** Фильтр по MIME типу (опционально) */
  mimeType?: string;

  /** Максимальное количество результатов */
  maxResults?: number;
}