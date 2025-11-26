/**
 * Типы для API
 */

/**
 * Интерфейс ответа API
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Интерфейс результата создания папки в Google Drive
 */
export interface DriveFolderResult {
  folderId: string;
  folderUrl: string;
  folderName: string;
}

/**
 * Интерфейс файла в Google Drive
 */
export interface DriveFile {
  id: string;
  name: string;
  url: string;
  size: number;
  mimeType: string;
  modifiedTime: string;
}

