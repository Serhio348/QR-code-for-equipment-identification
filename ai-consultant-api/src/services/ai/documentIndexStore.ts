/**
 * documentIndexStore.ts
 *
 * Хранение и гибридное чтение индекса документов в Supabase.
 *
 * Структура / что умеет:
 * 1. upsertDiscoveredFile — регистрирует файл без повторного OCR
 * 2. replaceFileChunks — заменяет chunks одной актуальной версии
 * 3. searchIndexedChunks — объединяет точный, числовой и векторный поиск
 */

import { createHash } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '../../config/env.js';
import { embedSearchQuery } from './embeddingClient.js';
import { reciprocalRankFusion } from './documentSearchFusion.js';

export interface DiscoveredDocument {
  equipmentId: string;
  equipmentName: string;
  driveFileId: string;
  driveFileUrl: string;
  fileName: string;
  mimeType: string;
  folderPath: string;
  modifiedTime: string;
}

export interface IndexedChunkInput {
  pageStart: number | null;
  pageEnd: number | null;
  sectionTitle: string | null;
  content: string;
  embedding: number[];
}

export interface IndexedChunkMatch {
  fileName: string;
  fileUrl: string;
  pageStart: number | null;
  pageEnd: number | null;
  sectionTitle: string | null;
  content: string;
  sources: string[];
}

interface FileRow {
  id: string;
  equipment_id: string;
  drive_file_id: string;
  modified_time: string | null;
  content_hash: string | null;
  status: string;
  updated_at: string;
}

interface ChunkRow {
  id: string;
  page_start: number | null;
  page_end: number | null;
  section_title: string | null;
  content: string;
  document_index_files: {
    file_name: string;
    drive_file_url: string | null;
  } | Array<{
    file_name: string;
    drive_file_url: string | null;
  }>;
}

const CANDIDATE_LIMIT = 30;

let client: SupabaseClient | null = null;

function supabase(): SupabaseClient {
  if (!client) client = createClient(config.supabaseUrl, config.supabaseServiceKey);
  return client;
}

export function documentContentHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export async function upsertDiscoveredFile(file: DiscoveredDocument): Promise<void> {
  const db = supabase();
  const { data, error } = await db
    .from('document_index_files')
    .select('id, modified_time, status')
    .eq('equipment_id', file.equipmentId)
    .eq('drive_file_id', file.driveFileId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const existing = data as Pick<FileRow, 'id' | 'modified_time' | 'status'> | null;
  if (existing && existing.modified_time === file.modifiedTime && existing.status !== 'error') return;

  const row = {
    equipment_id: file.equipmentId,
    equipment_name: file.equipmentName,
    drive_file_id: file.driveFileId,
    drive_file_url: file.driveFileUrl,
    file_name: file.fileName,
    mime_type: file.mimeType,
    folder_path: file.folderPath,
    modified_time: file.modifiedTime,
    status: 'pending',
    error: null,
    updated_at: new Date().toISOString(),
  };
  const { error: saveError } = existing
    ? await db.from('document_index_files').update(row).eq('id', existing.id)
    : await db.from('document_index_files').insert(row);
  if (saveError) throw new Error(saveError.message);
}

export async function claimNextDocument(): Promise<FileRow | null> {
  const db = supabase();
  const staleBefore = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  await db
    .from('document_index_files')
    .update({ status: 'pending', updated_at: new Date().toISOString() })
    .eq('status', 'indexing')
    .lt('updated_at', staleBefore);

  const { data, error } = await db
    .from('document_index_files')
    .select('id, equipment_id, drive_file_id, modified_time, content_hash, status, updated_at')
    .in('status', ['pending', 'error'])
    .order('updated_at', { ascending: true })
    .limit(10);
  if (error) throw new Error(error.message);

  const retryAfter = Date.now() - 15 * 60 * 1000;
  const candidate = ((data ?? []) as FileRow[]).find((row) => (
    row.status === 'pending' || new Date(row.updated_at).getTime() < retryAfter
  ));
  if (!candidate) return null;

  const { data: claimed, error: claimError } = await db
    .from('document_index_files')
    .update({ status: 'indexing', error: null, updated_at: new Date().toISOString() })
    .eq('id', candidate.id)
    .eq('status', candidate.status)
    .select('id, equipment_id, drive_file_id, modified_time, content_hash, status, updated_at')
    .maybeSingle();
  if (claimError) throw new Error(claimError.message);
  return claimed as FileRow | null;
}

export async function markDocumentReady(fileId: string): Promise<void> {
  const { error } = await supabase()
    .from('document_index_files')
    .update({
      status: 'ready',
      error: null,
      indexed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', fileId);
  if (error) throw new Error(error.message);
}

export async function completeDocumentIndex(params: {
  fileId: string;
  contentHash: string;
  pageCount: number | null;
  truncated: boolean;
  chunks: IndexedChunkInput[];
}): Promise<void> {
  const db = supabase();
  const equipmentId = await equipmentIdForFile(params.fileId);
  const { error: deleteError } = await db.from('document_index_chunks').delete().eq('file_id', params.fileId);
  if (deleteError) throw new Error(deleteError.message);

  for (let index = 0; index < params.chunks.length; index += 40) {
    const rows = params.chunks.slice(index, index + 40).map((chunk, offset) => ({
      file_id: params.fileId,
      equipment_id: equipmentId,
      chunk_index: index + offset,
      page_start: chunk.pageStart,
      page_end: chunk.pageEnd,
      section_title: chunk.sectionTitle,
      content: chunk.content,
      embedding: `[${chunk.embedding.join(',')}]`,
      embedding_model: config.embeddingModel,
    }));
    const { error } = await db.from('document_index_chunks').insert(rows);
    if (error) throw new Error(error.message);
  }

  const { error } = await db.from('document_index_files').update({
    status: 'ready',
    error: null,
    content_hash: params.contentHash,
    page_count: params.pageCount,
    chunk_count: params.chunks.length,
    truncated: params.truncated,
    embedding_model: config.embeddingModel,
    indexed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', params.fileId);
  if (error) throw new Error(error.message);
}

export async function markDocumentIndexResult(
  fileId: string,
  status: 'error' | 'skipped',
  error: string,
): Promise<void> {
  const { error: saveError } = await supabase()
    .from('document_index_files')
    .update({ status, error: error.slice(0, 1000), updated_at: new Date().toISOString() })
    .eq('id', fileId);
  if (saveError) throw new Error(saveError.message);
}

export async function searchIndexedChunks(
  equipmentId: string,
  query: string,
): Promise<IndexedChunkMatch[]> {
  const lexical = await searchLexical(equipmentId, query);
  const exact = await searchExactTokens(equipmentId, query);
  let vectorIds: string[] = [];
  try {
    vectorIds = await searchVector(equipmentId, query);
  } catch (error) {
    console.warn('[DocumentIndex] Векторный поиск недоступен:', error);
  }

  const fused = reciprocalRankFusion([
    { source: 'exact', ids: exact.map((row) => row.id) },
    { source: 'lexical', ids: lexical.map((row) => row.id) },
    { source: 'vector', ids: vectorIds },
  ]).slice(0, 6);
  const rows = new Map([...lexical, ...exact, ...await rowsById(vectorIds)].map((row) => [row.id, row]));

  return fused.flatMap((hit) => {
    const row = rows.get(hit.id);
    if (!row) return [];
    const file = Array.isArray(row.document_index_files)
      ? row.document_index_files[0]
      : row.document_index_files;
    return [{
      fileName: file?.file_name ?? 'Документ',
      fileUrl: file?.drive_file_url ?? '',
      pageStart: row.page_start,
      pageEnd: row.page_end,
      sectionTitle: row.section_title,
      content: row.content,
      sources: hit.sources,
    }];
  });
}

async function searchLexical(equipmentId: string, query: string): Promise<ChunkRow[]> {
  const { data, error } = await supabase()
    .from('document_index_chunks')
    .select('id, page_start, page_end, section_title, content, document_index_files(file_name, drive_file_url)')
    .eq('equipment_id', equipmentId)
    .textSearch('content_tsv', query, { type: 'websearch', config: 'russian' })
    .limit(CANDIDATE_LIMIT);
  if (error) throw new Error(error.message);
  return (data ?? []) as ChunkRow[];
}

async function searchExactTokens(equipmentId: string, query: string): Promise<ChunkRow[]> {
  const tokens = [...new Set((query.match(/[A-Za-zА-Яа-яЁё0-9][A-Za-zА-Яа-яЁё0-9./_-]{2,}/g) ?? [])
    .filter((token) => /\d/.test(token) || /[A-Za-z]/.test(token) && /[А-Яа-яЁё]/.test(token)))]
    .slice(0, 4);
  const rows: ChunkRow[] = [];
  for (const token of tokens) {
    const { data, error } = await supabase()
      .from('document_index_chunks')
      .select('id, page_start, page_end, section_title, content, document_index_files(file_name, drive_file_url)')
      .eq('equipment_id', equipmentId)
      .ilike('content', `%${token.replace(/[%_]/g, '')}%`)
      .limit(8);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []) as ChunkRow[]);
  }
  return rows;
}

async function searchVector(equipmentId: string, query: string): Promise<string[]> {
  const embedding = await embedSearchQuery(query);
  const { data, error } = await supabase().rpc('match_equipment_document_chunks', {
    p_equipment_id: equipmentId,
    p_embedding: `[${embedding.join(',')}]`,
    p_match_count: CANDIDATE_LIMIT,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
}

async function rowsById(ids: string[]): Promise<ChunkRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase()
    .from('document_index_chunks')
    .select('id, page_start, page_end, section_title, content, document_index_files(file_name, drive_file_url)')
    .in('id', ids);
  if (error) throw new Error(error.message);
  return (data ?? []) as ChunkRow[];
}

async function equipmentIdForFile(fileId: string): Promise<string> {
  const { data, error } = await supabase()
    .from('document_index_files')
    .select('equipment_id')
    .eq('id', fileId)
    .single();
  if (error || !data?.equipment_id) throw new Error(error?.message || 'Файл индекса не найден');
  return data.equipment_id as string;
}
