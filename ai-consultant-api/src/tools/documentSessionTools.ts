/**
 * documentSessionTools.ts
 *
 * Tools для pending-intent по чтению разделов документации.
 *
 * Структура / что умеет:
 * 1. set_pending_document_read — запомнить раздел до подтверждения «ок/давай»
 * 2. clear_pending_document_read — сбросить ожидание
 * 3. get_document_session — показать кэш/pending текущей сессии
 */

import Anthropic from '@anthropic-ai/sdk';
import { getToolContext } from '../services/ai/toolContext.js';
import {
  clearPendingRead,
  getLastDocument,
  getPendingRead,
  setPendingRead,
} from '../services/ai/documentSessionService.js';

function extractDriveId(urlOrId: string): string {
  if (!urlOrId) return '';
  const foldersMatch = urlOrId.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (foldersMatch) return foldersMatch[1];
  const fileMatch = urlOrId.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return fileMatch[1];
  const idMatch = urlOrId.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch) return idMatch[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(urlOrId)) return urlOrId;
  return urlOrId;
}

export const documentSessionTools: Anthropic.Tool[] = [
  {
    name: 'set_pending_document_read',
    description:
      'Запомнить предложение углубиться в раздел документа до подтверждения пользователя. Используй ПЕРЕД фразой «могу углубиться в раздел …» / «прочитать весь раздел?». НЕ используй для самого чтения — чтение делает read_file_content после «ок/давай».',
    input_schema: {
      type: 'object' as const,
      properties: {
        file_url: {
          type: 'string',
          description: 'URL или ID файла Google Drive, который уже найден',
        },
        section_hint: {
          type: 'string',
          description: 'Название раздела/главы/таблицы, которое предложено прочитать целиком',
        },
        offset: {
          type: 'number',
          description: 'Опциональный offset, если продолжаем с известного места',
        },
        note: {
          type: 'string',
          description: 'Краткий комментарий для себя (зачем предложен раздел)',
        },
      },
      required: ['file_url'],
    },
  },
  {
    name: 'clear_pending_document_read',
    description:
      'Сбросить ожидание подтверждения чтения раздела. Используй если пользователь отказался или тема сменилась. Не используй при обычном «ок/давай».',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_document_session',
    description:
      'Показать текущий кэш документа и pending-intent. Используй если нужно вспомнить file_url/раздел без повторного поиска. НЕ используй вместо read_file_content.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
];

export async function executeDocumentSessionTool(
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const ctx = getToolContext();
  const userId = ctx?.userId || 'anonymous';

  switch (name) {
    case 'set_pending_document_read': {
      const fileUrl = String(input.file_url || '');
      const fileId = extractDriveId(fileUrl);
      if (!fileId) {
        return { success: false, error: 'Не указан file_url' };
      }
      const last = getLastDocument(userId);
      setPendingRead(userId, {
        fileId,
        fileUrl: fileUrl || last?.fileUrl || fileId,
        fileName: last?.fileId === fileId ? last.fileName : undefined,
        sectionHint: typeof input.section_hint === 'string' ? input.section_hint : undefined,
        offset: typeof input.offset === 'number' ? input.offset : undefined,
        note: typeof input.note === 'string' ? input.note : undefined,
      });
      return {
        success: true,
        message: 'Ожидание подтверждения сохранено. После «ок/давай» читай этот файл сразу.',
        pending: getPendingRead(userId),
      };
    }

    case 'clear_pending_document_read': {
      clearPendingRead(userId);
      return { success: true, message: 'Pending сброшен' };
    }

    case 'get_document_session': {
      const document = getLastDocument(userId);
      const pending = getPendingRead(userId);
      return {
        success: true,
        document: document
          ? {
              fileId: document.fileId,
              fileUrl: document.fileUrl,
              fileName: document.fileName,
              mimeType: document.mimeType,
              cachedChars: document.fullText.length,
              totalChars: document.totalChars,
              truncatedOnFetch: document.truncatedOnFetch,
            }
          : null,
        pending: pending || null,
      };
    }

    default:
      throw new Error(`Unknown document session tool: ${name}`);
  }
}
