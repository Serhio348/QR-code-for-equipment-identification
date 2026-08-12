/**
 * driveTools.ts
 *
 * Определения tools (инструментов) для работы с Google Drive
 * и функция их выполнения.
 *
 * Этот файл позволяет Claude AI искать файлы в папках оборудования
 * и читать их содержимое (паспорта, инструкции, акты и т.д.).
 *
 * Цепочка взаимодействия:
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  Пользователь: "Найди паспорт обратного осмоса"                 │
 * │       ↓                                                          │
 * │  Claude:                                                         │
 * │    1) get_all_equipment({search: "обратный осмос"})              │
 * │       → получает оборудование с googleDriveUrl                   │
 * │    2) search_files_in_folder({folder_url: googleDriveUrl})       │
 * │       → получает список PDF в папке                              │
 * │    3) read_file_content({file_url: "файл_паспорта.pdf"})        │
 * │       → получает текст из PDF (через OCR в GAS)                  │
 * │    4) Формирует ответ на основе прочитанного содержимого        │
 * └──────────────────────────────────────────────────────────────────┘
 *
 * Важные особенности:
 * - Файлы читаются через GAS API, который использует Google Drive API v2
 * - Для PDF применяется OCR (распознавание текста) через Google Drive
 * - Текст кэшируется в сессии пользователя; повторные чтения идут из кэша
 * - Можно читать по section_query / offset без повторного OCR
 *
 * Файл экспортирует:
 * - driveTools — массив определений tools для Anthropic API
 * - executeDriveTool — функция выполнения tool по имени
 */

import Anthropic from '@anthropic-ai/sdk';
import { gasClient } from '../services/equipment/index.js';
import { getToolContext } from '../services/ai/toolContext.js';
import {
  DOCUMENT_CACHE_MAX_CHARS,
  DOCUMENT_CHUNK_SIZE,
  clearPendingRead,
  getDocument,
  getPendingRead,
  putDocument,
  setPendingRead,
  sliceDocument,
  type CachedDocument,
} from '../services/ai/documentSessionService.js';

export const driveTools: Anthropic.Tool[] = [
  {
    name: 'search_files_in_folder',
    description:
      'Поиск файлов и вложенных папок в папке оборудования на Google Drive. По умолчанию возвращает файлы. Для надёжного поиска сначала вызывай без query, чтобы увидеть общий список, затем уточняй query. Для поиска вложенных папок передай mime_type: "application/vnd.google-apps.folder". Если файл не найден по точному имени, повтори поиск без query и проверь подпапки. НЕ используй, если file_url уже есть в СЕССИИ ДОКУМЕНТА.',
    input_schema: {
      type: 'object' as const,
      properties: {
        folder_url: {
          type: 'string',
          description: 'URL папки Google Drive или ID папки',
        },
        query: {
          type: 'string',
          description: 'Поисковый запрос по названию файла или папки',
        },
        mime_type: {
          type: 'string',
          description:
            'Фильтр по типу: application/pdf, image/jpeg, application/vnd.google-apps.folder (для вложенных папок) и т.д.',
        },
        max_results: {
          type: 'number',
          description: 'Максимум результатов. Используй 50-100 для обзорного поиска по папке.',
        },
      },
      required: ['folder_url'],
    },
  },
  {
    name: 'read_file_content',
    description:
      'Прочитать текстовое содержимое файла из Google Drive (PDF с OCR, Docs, Sheets/Excel с таблицами, Word, текст). Для follow-up («ок/давай/углубись») используй file_url из СЕССИИ ДОКУМЕНТА и section_query/offset — НЕ ищи файл заново. Большие документы читай чанками: смотри nextOffset/truncated/hint в ответе.',
    input_schema: {
      type: 'object' as const,
      properties: {
        file_url: {
          type: 'string',
          description: 'URL файла на Google Drive или его ID',
        },
        max_length: {
          type: 'number',
          description: `Размер окна текста в символах (по умолчанию ${DOCUMENT_CHUNK_SIZE}). Не ставь меньше 10000 для раздела.`,
        },
        offset: {
          type: 'number',
          description: 'Смещение в символах от начала документа. Для продолжения бери nextOffset из прошлого ответа.',
        },
        section_query: {
          type: 'string',
          description:
            'Название раздела/заголовка/таблицы для поиска внутри документа (например: «Технические характеристики»).',
        },
        refresh: {
          type: 'boolean',
          description: 'true — игнорировать сессионный кэш и заново скачать/OCR файл',
        },
      },
      required: ['file_url'],
    },
  },
];

export async function executeDriveTool(
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  console.log(`[DriveTool] ${name} called:`, {
    inputKeys: Object.keys(input),
    timestamp: new Date().toISOString(),
  });

  switch (name) {
    case 'search_files_in_folder':
      return await gasClient.get('getFolderFiles', {
        folderId: extractDriveId(input.folder_url as string),
        query: input.query as string | undefined,
        mimeType: input.mime_type as string | undefined,
        maxResults: input.max_results ? String(input.max_results) : undefined,
      });

    case 'read_file_content':
      return await readFileContentWithSession(input);

    default:
      throw new Error(`Unknown drive tool: ${name}`);
  }
}

// ============================================
// Чтение с сессионным кэшем
// ============================================

async function readFileContentWithSession(
  input: Record<string, unknown>,
): Promise<unknown> {
  const ctx = getToolContext();
  const userId = ctx?.userId || 'anonymous';
  const fileUrl = String(input.file_url || '');
  const fileId = extractDriveId(fileUrl);
  const maxLength =
    typeof input.max_length === 'number' && input.max_length > 0
      ? Math.floor(input.max_length)
      : DOCUMENT_CHUNK_SIZE;
  const offset =
    typeof input.offset === 'number' && input.offset >= 0
      ? Math.floor(input.offset)
      : undefined;
  const sectionQuery =
    typeof input.section_query === 'string' && input.section_query.trim()
      ? input.section_query.trim()
      : undefined;
  const refresh = input.refresh === true;

  if (!fileId) {
    return { success: false, error: 'Не указан file_url' };
  }

  // Если agent не передал section/offset, но есть pending на этот файл — подставим
  const pending = getPendingRead(userId);
  const effectiveSection =
    sectionQuery ||
    (pending && pending.fileId === fileId ? pending.sectionHint : undefined);
  const effectiveOffset =
    offset ?? (pending && pending.fileId === fileId ? pending.offset : undefined);

  let cached = !refresh ? getDocument(userId, fileId) : undefined;
  const fromCache = Boolean(cached);

  if (!cached) {
    cached = (await fetchAndCacheDocument({
      userId,
      fileId,
      fileUrl,
      equipmentId: ctx?.equipmentId,
    })) || undefined;
  }

  if (!cached) {
    return { success: false, error: 'Не удалось прочитать файл' };
  }

  const slice = sliceDocument(cached, {
    offset: effectiveOffset,
    maxLength,
    sectionQuery: effectiveSection,
    fromCache,
  });

  // После успешного чтения pending на этот файл больше не нужен
  if (pending && pending.fileId === fileId) {
    clearPendingRead(userId);
  }

  // Если текст ещё не кончился — мягко готовим продолжение
  if (slice.truncated) {
    setPendingRead(userId, {
      fileId: cached.fileId,
      fileUrl: cached.fileUrl,
      fileName: cached.fileName,
      sectionHint: effectiveSection,
      offset: slice.nextOffset,
      note: 'auto: продолжение обрезанного фрагмента',
    });
  }

  return {
    success: true,
    content: slice.content,
    fileName: slice.fileName,
    fileId: slice.fileId,
    fileUrl: slice.fileUrl,
    mimeType: slice.mimeType,
    offset: slice.offset,
    nextOffset: slice.nextOffset,
    totalChars: slice.totalChars,
    charCount: slice.content.length,
    truncated: slice.truncated,
    sectionFound: slice.sectionFound,
    sectionQuery: slice.sectionQuery,
    fromCache,
    hint: slice.hint,
  };
}

async function fetchAndCacheDocument(params: {
  userId: string;
  fileId: string;
  fileUrl: string;
  equipmentId?: string;
}): Promise<CachedDocument | null> {
  const result = await gasClient.get<unknown>('getFileContent', {
    fileId: params.fileId,
    maxLength: String(DOCUMENT_CACHE_MAX_CHARS),
  });

  const normalized = normalizeGasFileContent(result, params.fileId);
  if (!normalized.success || !normalized.content) {
    throw new Error(normalized.error || 'GAS getFileContent вернул пустой результат');
  }

  return putDocument(params.userId, {
    fileId: params.fileId,
    fileUrl: params.fileUrl || `https://drive.google.com/open?id=${params.fileId}`,
    fileName: normalized.fileName || params.fileId,
    mimeType: normalized.mimeType,
    fullText: normalized.content,
    totalChars: normalized.charCount || normalized.content.length,
    truncatedOnFetch: Boolean(normalized.truncated),
    equipmentId: params.equipmentId,
  });
}

function normalizeGasFileContent(
  result: unknown,
  fileId: string,
): {
  success: boolean;
  content?: string;
  fileName?: string;
  mimeType?: string;
  charCount?: number;
  truncated?: boolean;
  error?: string;
} {
  if (!result || typeof result !== 'object') {
    return { success: false, error: 'Пустой ответ GAS' };
  }

  const root = result as Record<string, unknown>;
  const data =
    root.data && typeof root.data === 'object'
      ? (root.data as Record<string, unknown>)
      : root;

  const success = data.success !== false && (typeof data.content === 'string' || typeof root.content === 'string');
  const content =
    typeof data.content === 'string'
      ? data.content
      : typeof root.content === 'string'
        ? root.content
        : undefined;

  if (!success || !content) {
    return {
      success: false,
      error: String(data.error || root.error || 'Не удалось извлечь текст'),
    };
  }

  return {
    success: true,
    content,
    fileName: String(data.fileName || root.fileName || fileId),
    mimeType: typeof data.mimeType === 'string' ? data.mimeType : undefined,
    charCount:
      typeof data.charCount === 'number'
        ? data.charCount
        : typeof root.charCount === 'number'
          ? root.charCount
          : content.length,
    truncated: Boolean(data.truncated ?? root.truncated),
  };
}

function extractDriveId(urlOrId: string): string {
  if (!urlOrId) return '';

  const foldersMatch = urlOrId.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (foldersMatch) return foldersMatch[1];

  const fileMatch = urlOrId.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return fileMatch[1];

  const idMatch = urlOrId.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch) return idMatch[1];

  if (/^[a-zA-Z0-9_-]{20,}$/.test(urlOrId)) {
    return urlOrId;
  }

  return urlOrId;
}
