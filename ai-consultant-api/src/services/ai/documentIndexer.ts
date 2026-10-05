/**
 * documentIndexer.ts
 *
 * Обходит папки оборудования и индексирует новые или изменённые документы.
 *
 * Структура / что умеет:
 * 1. discoverEquipmentDocuments — ставит существующие файлы Drive в очередь
 * 2. indexNextDocument — извлекает текст, строит chunks и embeddings одного файла
 */

import { gasClient } from '../equipment/index.js';
import { chunkDocumentText } from './documentChunker.js';
import { EmbeddingQuotaPause, embedDocumentChunks } from './embeddingClient.js';
import {
  claimNextDocument,
  completeDocumentIndex,
  documentContentHash,
  markDocumentIndexResult,
  markDocumentReady,
  releaseDocumentToPending,
  upsertDiscoveredFile,
  type DiscoveredDocument,
} from './documentIndexStore.js';

const SUPPORTED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.google-apps.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.google-apps.spreadsheet',
  'text/plain',
  'text/csv',
]);
const MAX_FOLDER_DEPTH = 4;
const MAX_CHUNKS_PER_FILE = 400;

interface EquipmentRecord {
  id: string;
  name: string;
  googleDriveUrl: string;
}

interface DriveItem {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  modifiedTime: string;
  isFolder: boolean;
}

let equipmentCursor = 0;

export async function discoverEquipmentDocuments(): Promise<number> {
  const equipment = await listEquipment();
  if (equipment.length === 0) return 0;
  const current = equipment[equipmentCursor % equipment.length];
  equipmentCursor += 1;
  if (!current) return 0;

  const files = await collectDocuments(current, current.googleDriveUrl, '', 0);
  for (const file of files) await upsertDiscoveredFile(file);
  return files.length;
}

export async function indexNextDocument(): Promise<boolean> {
  const file = await claimNextDocument();
  if (!file) return false;

  try {
    const extracted = await readDriveFile(file.drive_file_id);
    const text = stripTruncationNote(extracted.content);
    if (!text.trim()) {
      await markDocumentIndexResult(file.id, 'skipped', 'В документе не найден текст');
      return true;
    }
    const contentHash = documentContentHash(text);
    if (file.content_hash && file.content_hash === contentHash) {
      await markDocumentReady(file.id);
      return true;
    }

    const chunks = chunkDocumentText(text).slice(0, MAX_CHUNKS_PER_FILE);
    const contents = chunks.map((chunk) => formatChunkContent(extracted.fileName, chunk));
    const embeddings = await embedDocumentChunks(contents);
    await completeDocumentIndex({
      fileId: file.id,
      contentHash,
      pageCount: chunks.reduce((max, chunk) => Math.max(max, chunk.pageEnd ?? 0), 0) || null,
      truncated: extracted.truncated || chunks.length === MAX_CHUNKS_PER_FILE,
      chunks: chunks.map((chunk, index) => ({
        pageStart: chunk.pageStart,
        pageEnd: chunk.pageEnd,
        sectionTitle: chunk.sectionTitle,
        content: contents[index] ?? chunk.content,
        embedding: embeddings[index] ?? [],
      })),
    });
    return true;
  } catch (error) {
    if (error instanceof EmbeddingQuotaPause) {
      await releaseDocumentToPending(file.id, error.message);
      throw error;
    }
    await markDocumentIndexResult(
      file.id,
      'error',
      error instanceof Error ? error.message : 'Ошибка индексации',
    );
    return true;
  }
}

function formatChunkContent(
  fileName: string,
  chunk: { pageStart: number | null; pageEnd: number | null; sectionTitle: string | null; content: string },
): string {
  const pages = chunk.pageStart
    ? `Страницы: ${chunk.pageStart}${chunk.pageEnd && chunk.pageEnd !== chunk.pageStart ? `–${chunk.pageEnd}` : ''}`
    : '';
  return [
    `Документ: ${fileName}`,
    chunk.sectionTitle ? `Раздел: ${chunk.sectionTitle}` : '',
    pages,
    '',
    chunk.content,
  ].filter((line) => line !== '').join('\n');
}

async function listEquipment(): Promise<EquipmentRecord[]> {
  const result = await gasClient.get<unknown>('getAll', { status: 'active' });
  return normalizeEquipment(result).filter((item) => item.googleDriveUrl);
}

async function collectDocuments(
  equipment: EquipmentRecord,
  folderUrl: string,
  folderPath: string,
  depth: number,
): Promise<DiscoveredDocument[]> {
  const items = await listFolder(folderUrl);
  const documents: DiscoveredDocument[] = [];
  for (const item of items) {
    if (item.isFolder || item.mimeType === 'application/vnd.google-apps.folder') {
      if (depth < MAX_FOLDER_DEPTH) {
        documents.push(...await collectDocuments(
          equipment,
          item.url || item.id,
          folderPath ? `${folderPath}/${item.name}` : item.name,
          depth + 1,
        ));
      }
      continue;
    }
    if (!SUPPORTED_MIME_TYPES.has(item.mimeType)) continue;
    documents.push({
      equipmentId: equipment.id,
      equipmentName: equipment.name,
      driveFileId: item.id,
      driveFileUrl: item.url || `https://drive.google.com/open?id=${item.id}`,
      fileName: item.name,
      mimeType: item.mimeType,
      folderPath,
      modifiedTime: item.modifiedTime || '',
    });
  }
  return documents;
}

async function listFolder(folderUrl: string): Promise<DriveItem[]> {
  const result = await gasClient.get<unknown>('getFolderFiles', { folderId: folderUrl });
  const raw = Array.isArray(result)
    ? result
    : result && typeof result === 'object' && Array.isArray((result as { files?: unknown[] }).files)
      ? (result as { files: unknown[] }).files
      : [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const id = stringValue(record.id);
    const name = stringValue(record.name);
    if (!id || !name) return [];
    return [{
      id,
      name,
      url: stringValue(record.url),
      mimeType: stringValue(record.mimeType),
      modifiedTime: stringValue(record.modifiedTime),
      isFolder: record.isFolder === true,
    }];
  });
}

async function readDriveFile(fileId: string): Promise<{ content: string; fileName: string; truncated: boolean }> {
  const result = await gasClient.get<unknown>('getFileContent', {
    fileId,
    maxLength: '1500000',
  });
  const record = unwrap(result);
  const content = stringValue(record.content);
  if (!content) throw new Error(stringValue(record.error) || 'GAS не вернул текст документа');
  return {
    content,
    fileName: stringValue(record.fileName) || fileId,
    truncated: record.truncated === true,
  };
}

function normalizeEquipment(result: unknown): EquipmentRecord[] {
  const record = result && typeof result === 'object' ? result as Record<string, unknown> : {};
  const raw = Array.isArray(result)
    ? result
    : Array.isArray(record.data)
      ? record.data
      : Array.isArray(record.equipment)
        ? record.equipment
        : [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const id = stringValue(row.id);
    const name = stringValue(row.name);
    const googleDriveUrl = stringValue(row.googleDriveUrl || row.google_drive_url);
    if (!id || !name || !googleDriveUrl) return [];
    return [{ id, name, googleDriveUrl }];
  });
}

function unwrap(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== 'object') return {};
  const record = result as Record<string, unknown>;
  return record.data && typeof record.data === 'object'
    ? record.data as Record<string, unknown>
    : record;
}

function stripTruncationNote(text: string): string {
  return text.replace(/\n\n\.\.\. \[текст обрезан[\s\S]*$/, '').trim();
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
