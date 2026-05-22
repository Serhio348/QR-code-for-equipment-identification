/**
 * driveFileContextService.ts
 *
 * Предзагрузка компактного индекса Google Drive для AI-консультанта.
 *
 * Структура / что умеет:
 * 1. buildDriveFileContext — добавляет в промпт список файлов/папок оборудования
 * 2. loadDriveItems — читает содержимое папки через GAS API
 *
 * Пример использования:
 * messages + equipmentContext → текстовый контекст с файлами Drive
 */

import { gasClient } from '../equipment/index.js';
import type { ChatMessage, EquipmentContext } from './types.js';

// ============================================
// Константы
// ============================================

const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const ROOT_FILE_LIMIT = 60;
const ROOT_FOLDER_LIMIT = 30;
const NESTED_FOLDER_LIMIT = 5;
const NESTED_FILE_LIMIT = 20;
const LONG_REQUEST_THRESHOLD = 700;

const DOCUMENT_INTENT_PATTERN =
  /файл|папк|документ|документац|паспорт|инструкц|мануал|manual|pdf|схем|черт[её]ж|откр(ой|ыть)|покажи|прочитай|найди/i;

// ============================================
// Типы
// ============================================

type DriveItem = {
  id: string;
  name: string;
  url: string;
  mimeType?: string;
  size?: number;
  modifiedTime?: string;
};

// ============================================
// Публичное API
// ============================================

export async function buildDriveFileContext(
  messages: ChatMessage[],
  equipmentContext?: EquipmentContext,
): Promise<string> {
  const folderUrl = equipmentContext?.googleDriveUrl?.trim();
  if (!folderUrl) return '';

  const userText = getLastUserText(messages);
  if (!shouldPreloadDriveIndex(userText)) return '';

  try {
    const [rootFiles, rootFolders] = await Promise.all([
      loadDriveItems(folderUrl, undefined, ROOT_FILE_LIMIT),
      loadDriveItems(folderUrl, FOLDER_MIME_TYPE, ROOT_FOLDER_LIMIT),
    ]);

    const nestedGroups = await Promise.all(
      rootFolders.slice(0, NESTED_FOLDER_LIMIT).map(async (folder) => ({
        folder,
        files: await loadDriveItems(folder.url || folder.id, undefined, NESTED_FILE_LIMIT).catch(() => []),
      })),
    );

    return formatDriveContext(rootFiles, rootFolders, nestedGroups);
  } catch (error) {
    console.warn('[DriveFileContext] Не удалось предзагрузить индекс Drive:', error);
    return '';
  }
}

// ============================================
// Загрузка Drive
// ============================================

async function loadDriveItems(
  folderUrl: string,
  mimeType: string | undefined,
  maxResults: number,
): Promise<DriveItem[]> {
  const result = await gasClient.get<unknown>('getFolderFiles', {
    folderId: extractDriveId(folderUrl),
    mimeType,
    maxResults: String(maxResults),
  });

  return normalizeDriveItems(result).slice(0, maxResults);
}

function normalizeDriveItems(result: unknown): DriveItem[] {
  const rawItems = Array.isArray(result)
    ? result
    : isRecord(result) && Array.isArray(result.files)
      ? result.files
      : [];

  return rawItems
    .map(toDriveItem)
    .filter((item): item is DriveItem => item !== null);
}

function toDriveItem(value: unknown): DriveItem | null {
  if (!isRecord(value)) return null;

  const id = stringValue(value.id);
  const name = stringValue(value.name) || stringValue(value.title);
  const url = stringValue(value.url) || stringValue(value.webViewLink) || stringValue(value.folderUrl);
  if (!id || !name) return null;

  return {
    id,
    name,
    url: url || `https://drive.google.com/open?id=${id}`,
    mimeType: stringValue(value.mimeType),
    size: numberValue(value.size),
    modifiedTime: stringValue(value.modifiedTime),
  };
}

// ============================================
// Форматирование промпта
// ============================================

function formatDriveContext(
  rootFiles: DriveItem[],
  rootFolders: DriveItem[],
  nestedGroups: Array<{ folder: DriveItem; files: DriveItem[] }>,
): string {
  if (rootFiles.length === 0 && rootFolders.length === 0) return '';

  const parts = [
    '\n\nПРЕДВАРИТЕЛЬНЫЙ ИНДЕКС GOOGLE DRIVE ДЛЯ ТЕКУЩЕГО ОБОРУДОВАНИЯ:',
    'Используй этот список как карту файлов. Если нужного файла нет в списке, сначала сделай широкий search_files_in_folder без query, отдельно проверь папки, затем ищи внутри подходящей подпапки. Не говори "файл не найден", пока не проверил широкий список файлов и папок.',
  ];

  if (rootFiles.length > 0) {
    parts.push('\nФайлы в корневой папке:');
    parts.push(...rootFiles.map((file) => formatDriveItem(file)));
  }

  if (rootFolders.length > 0) {
    parts.push('\nВложенные папки:');
    parts.push(...rootFolders.map((folder) => formatDriveItem(folder)));
  }

  for (const group of nestedGroups) {
    if (group.files.length === 0) continue;
    parts.push(`\nФайлы в подпапке "${group.folder.name}":`);
    parts.push(...group.files.map((file) => formatDriveItem(file)));
  }

  return parts.join('\n');
}

function formatDriveItem(item: DriveItem): string {
  const details = [
    item.mimeType ? `type=${item.mimeType}` : '',
    item.modifiedTime ? `modified=${item.modifiedTime}` : '',
  ].filter(Boolean).join(', ');

  return `- ${item.name} | id=${item.id} | url=${item.url}${details ? ` | ${details}` : ''}`;
}

// ============================================
// Вспомогательные функции
// ============================================

function shouldPreloadDriveIndex(userText: string): boolean {
  if (!userText.trim()) return false;
  return userText.length >= LONG_REQUEST_THRESHOLD || DOCUMENT_INTENT_PATTERN.test(userText);
}

function getLastUserText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== 'user') continue;

    if (typeof message.content === 'string') return message.content;

    return message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
  }

  return '';
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}
