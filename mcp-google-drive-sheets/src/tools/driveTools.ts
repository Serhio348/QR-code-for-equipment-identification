/**
 * driveTools.ts
 *
 * MCP инструменты для работы с Google Drive.
 * Это ОБЁРТКА над существующим GAS API (Google Apps Script).
 *
 * ВАЖНО: Операции с папками (создание, удаление) обычно происходят
 * автоматически при создании/удалении оборудования через GAS.
 * Эти инструменты нужны для прямого доступа к Drive функциям.
 *
 * Инструменты:
 * - drive_search_files - поиск файлов в папке
 * - drive_get_folder_info - информация о папке
 * - drive_create_folder - создать папку (редко нужно напрямую)
 * - drive_delete_folder - удалить папку (редко нужно напрямую)
 */

// ============================================
// Импорты
// ============================================

// Тип MCP сервера для типизации
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Zod для валидации входных данных
import { z } from 'zod';

// HTTP клиент для GAS API
import { gasClient } from '../clients/gasClient.js';

// Типы для Drive операций
import type { DriveFile, DriveFolder, CreateFolderResult } from '../types/drive.js';

// Утилита для парсинга Google Drive URL
import { extractDriveId } from '../utils/urlParser.js';

// Обработка ошибок
import { getErrorMessage } from '../utils/errorHandler.js';

// ============================================
// Zod Схемы
// ============================================

/**
 * Схема для поиска файлов в папке.
 *
 * folderUrl может быть:
 * - Полным URL: https://drive.google.com/drive/folders/abc123
 * - Просто ID: abc123
 */
const searchFilesSchema = z.object({
  // URL или ID папки (обязательно)
  folderUrl: z.string().min(1, 'URL или ID папки обязателен'),

  // Поисковый запрос (опционально)
  // Ищет в названиях файлов
  query: z.string().optional(),

  // Фильтр по MIME типу (опционально)
  // Например: 'application/pdf', 'image/jpeg'
  mimeType: z.string().optional(),

  // Максимум результатов (по умолчанию 100)
  maxResults: z.number().min(1).max(1000).optional(),
});

/**
 * Схема для получения информации о папке.
 */
const getFolderInfoSchema = z.object({
  // URL или ID папки
  folderUrl: z.string().min(1, 'URL или ID папки обязателен'),
});

/**
 * Схема для создания папки.
 *
 * ЗАМЕТКА: Обычно папки создаются автоматически при добавлении
 * оборудования. Этот инструмент для особых случаев.
 */
const createFolderSchema = z.object({
  // Название новой папки (обязательно)
  name: z.string().min(1, 'Название папки обязательно'),

  // ID родительской папки (опционально)
  // Если не указан - создаётся в корневой папке проекта
  parentFolderId: z.string().optional(),

  // Описание папки (опционально)
  description: z.string().optional(),
});

/**
 * Схема для удаления папки.
 *
 * ВНИМАНИЕ: Удаляет папку со ВСЕМ содержимым!
 * Обычно папки удаляются автоматически при удалении оборудования.
 */
const deleteFolderSchema = z.object({
  // URL или ID папки для удаления
  folderUrl: z.string().min(1, 'URL или ID папки обязателен'),
});

// ============================================
// Регистрация инструментов
// ============================================

/**
 * Регистрирует все инструменты для работы с Google Drive.
 *
 * @param server - экземпляр MCP сервера
 */
export function registerDriveTools(server: McpServer): void {

  // ==========================================
  // Инструмент 1: Поиск файлов в папке
  // ==========================================

  server.tool(
    'drive_search_files',

    'Поиск файлов в папке Google Drive. ' +
    'Принимает URL папки или её ID. ' +
    'Можно фильтровать по названию (query) или типу файла (mimeType). ' +
    'Возвращает список файлов с их ID, именами, URL и размерами.',

    searchFilesSchema.shape,

    async (params) => {
      try {
        // Валидация входных данных
        const parsed = searchFilesSchema.safeParse(params);

        if (!parsed.success) {
          return {
            content: [{
              type: 'text' as const,
              text: `Ошибка валидации: ${parsed.error.message}`,
            }],
            isError: true,
          };
        }

        // Извлекаем ID папки из URL (если передан полный URL)
        // extractDriveId умеет работать и с URL, и с чистым ID
        const folderId = extractDriveId(parsed.data.folderUrl);

        if (!folderId) {
          return {
            content: [{
              type: 'text' as const,
              text: 'Не удалось извлечь ID папки из указанного URL',
            }],
            isError: true,
          };
        }

        // Формируем параметры запроса
        const queryParams: Record<string, string> = {
          folderId: folderId,
        };

        // Добавляем опциональные параметры
        if (parsed.data.query) {
          queryParams.query = parsed.data.query;
        }
        if (parsed.data.mimeType) {
          queryParams.mimeType = parsed.data.mimeType;
        }
        if (parsed.data.maxResults) {
          queryParams.maxResults = String(parsed.data.maxResults);
        }

        // Вызываем GAS API
        // Действие 'getFolderFiles' соответствует функции в DriveOperations.gs
        const files = await gasClient.get<DriveFile[]>('getFolderFiles', queryParams);

        // Форматируем результат
        if (!files || files.length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: 'Файлы не найдены в указанной папке.',
            }],
          };
        }

        // Возвращаем список файлов
        return {
          content: [{
            type: 'text' as const,
            text: `Найдено файлов: ${files.length}\n\n${JSON.stringify(files, null, 2)}`,
          }],
        };

      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: `Ошибка поиска файлов: ${getErrorMessage(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  // ==========================================
  // Инструмент 2: Информация о папке
  // ==========================================

  server.tool(
    'drive_get_folder_info',

    'Получить информацию о папке в Google Drive по её URL или ID. ' +
    'Возвращает: ID, название, URL, ID родительской папки, дату создания.',

    getFolderInfoSchema.shape,

    async (params) => {
      try {
        const parsed = getFolderInfoSchema.safeParse(params);

        if (!parsed.success) {
          return {
            content: [{
              type: 'text' as const,
              text: `Ошибка валидации: ${parsed.error.message}`,
            }],
            isError: true,
          };
        }

        // Извлекаем ID папки
        const folderId = extractDriveId(parsed.data.folderUrl);

        if (!folderId) {
          return {
            content: [{
              type: 'text' as const,
              text: 'Не удалось извлечь ID папки из указанного URL',
            }],
            isError: true,
          };
        }

        // Запрос к GAS API
        const folderInfo = await gasClient.get<DriveFolder>('getFolderInfo', {
          folderId: folderId,
        });

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(folderInfo, null, 2),
          }],
        };

      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: `Ошибка получения информации о папке: ${getErrorMessage(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  // ==========================================
  // Инструмент 3: Создание папки
  // ==========================================

  server.tool(
    'drive_create_folder',

    'Создать новую папку в Google Drive. ' +
    'ПРИМЕЧАНИЕ: Обычно папки создаются автоматически при добавлении оборудования. ' +
    'Используйте этот инструмент только для создания дополнительных папок вручную.',

    createFolderSchema.shape,

    async (params) => {
      try {
        const parsed = createFolderSchema.safeParse(params);

        if (!parsed.success) {
          return {
            content: [{
              type: 'text' as const,
              text: `Ошибка валидации: ${parsed.error.message}`,
            }],
            isError: true,
          };
        }

        // Формируем данные для POST запроса
        const requestData: Record<string, unknown> = {
          name: parsed.data.name,
        };

        // Добавляем опциональные поля
        if (parsed.data.parentFolderId) {
          requestData.parentFolderId = parsed.data.parentFolderId;
        }
        if (parsed.data.description) {
          requestData.description = parsed.data.description;
        }

        // Вызываем GAS API
        // Действие 'createFolder' соответствует функции в DriveOperations.gs
        const result = await gasClient.post<CreateFolderResult>('createFolder', requestData);

        // Проверяем результат
        if (!result.success) {
          return {
            content: [{
              type: 'text' as const,
              text: `Не удалось создать папку: ${result.error || 'Неизвестная ошибка'}`,
            }],
            isError: true,
          };
        }

        return {
          content: [{
            type: 'text' as const,
            text: `Папка создана успешно!\n\n` +
                  `Название: ${result.folderName}\n` +
                  `ID: ${result.folderId}\n` +
                  `URL: ${result.folderUrl}`,
          }],
        };

      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: `Ошибка создания папки: ${getErrorMessage(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  // ==========================================
  // Инструмент 4: Удаление папки
  // ==========================================

  server.tool(
    'drive_delete_folder',

    'Удалить папку из Google Drive. ' +
    'ВНИМАНИЕ: Удаляет папку вместе со ВСЕМ содержимым! ' +
    'ПРИМЕЧАНИЕ: Обычно папки удаляются автоматически при удалении оборудования.',

    deleteFolderSchema.shape,

    async (params) => {
      try {
        const parsed = deleteFolderSchema.safeParse(params);

        if (!parsed.success) {
          return {
            content: [{
              type: 'text' as const,
              text: `Ошибка валидации: ${parsed.error.message}`,
            }],
            isError: true,
          };
        }

        // Извлекаем ID папки
        const folderId = extractDriveId(parsed.data.folderUrl);

        if (!folderId) {
          return {
            content: [{
              type: 'text' as const,
              text: 'Не удалось извлечь ID папки из указанного URL',
            }],
            isError: true,
          };
        }

        // Вызываем GAS API
        // Действие 'deleteFolder' соответствует функции в DriveOperations.gs
        await gasClient.post<{ success: boolean }>('deleteFolder', {
          folderId: folderId,
        });

        return {
          content: [{
            type: 'text' as const,
            text: `Папка с ID "${folderId}" успешно удалена.`,
          }],
        };

      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: `Ошибка удаления папки: ${getErrorMessage(error)}`,
          }],
          isError: true,
        };
      }
    }
  );
}
