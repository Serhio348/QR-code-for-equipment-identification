/**
 * documentSessionService.ts
 *
 * Сессионный кэш прочитанных документов и pending-intent для follow-up
 * («ок», «давай», «углубись») без повторного поиска оборудования/папки.
 *
 * Структура / что умеет:
 * 1. putDocument / getDocument — кэш полного текста файла на пользователя
 * 2. setPendingRead / consumePendingRead — ожидание подтверждения углубления
 * 3. sliceDocument — окно текста по offset / section_query
 * 4. buildDocumentSessionPrompt — блок для system prompt
 */

// ============================================
// Константы
// ============================================

/** Размер окна, которое отдаём модели за один вызов (~30–40 стр.). */
export const DOCUMENT_CHUNK_SIZE = 60_000;

/** Максимум символов в сессионном кэше (~500+ стр. технического текста). */
export const DOCUMENT_CACHE_MAX_CHARS = 1_500_000;

const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 часа

// ============================================
// Типы
// ============================================

export interface CachedDocument {
  fileId: string;
  fileUrl: string;
  fileName: string;
  mimeType?: string;
  fullText: string;
  totalChars: number;
  truncatedOnFetch: boolean;
  equipmentId?: string;
  updatedAt: number;
}

export interface PendingDocumentRead {
  fileId: string;
  fileUrl: string;
  fileName?: string;
  sectionHint?: string;
  offset?: number;
  note?: string;
  createdAt: number;
}

interface UserDocumentSession {
  document?: CachedDocument;
  pending?: PendingDocumentRead;
  updatedAt: number;
}

export interface DocumentSliceResult {
  content: string;
  fileName: string;
  fileId: string;
  fileUrl: string;
  mimeType?: string;
  offset: number;
  nextOffset: number;
  totalChars: number;
  truncated: boolean;
  sectionFound: boolean;
  sectionQuery?: string;
  fromCache: boolean;
  hint?: string;
}

// ============================================
// In-memory store
// ============================================

const sessions = new Map<string, UserDocumentSession>();

function sessionKey(userId: string): string {
  return userId || 'anonymous';
}

function touch(session: UserDocumentSession): UserDocumentSession {
  session.updatedAt = Date.now();
  return session;
}

function getOrCreateSession(userId: string): UserDocumentSession {
  const key = sessionKey(userId);
  const existing = sessions.get(key);
  if (existing && Date.now() - existing.updatedAt < SESSION_TTL_MS) {
    return existing;
  }
  const created: UserDocumentSession = { updatedAt: Date.now() };
  sessions.set(key, created);
  return created;
}

function pruneExpired(): void {
  const now = Date.now();
  for (const [key, session] of sessions.entries()) {
    if (now - session.updatedAt >= SESSION_TTL_MS) {
      sessions.delete(key);
    }
  }
}

// ============================================
// Публичное API — документ
// ============================================

export function putDocument(
  userId: string,
  doc: Omit<CachedDocument, 'updatedAt'>,
): CachedDocument {
  pruneExpired();
  const session = getOrCreateSession(userId);
  const fullText = doc.fullText.slice(0, DOCUMENT_CACHE_MAX_CHARS);
  const cached: CachedDocument = {
    ...doc,
    fullText,
    totalChars: doc.totalChars || fullText.length,
    truncatedOnFetch: doc.truncatedOnFetch || doc.fullText.length > DOCUMENT_CACHE_MAX_CHARS,
    updatedAt: Date.now(),
  };
  session.document = cached;
  touch(session);
  return cached;
}

export function getDocument(userId: string, fileId?: string): CachedDocument | undefined {
  pruneExpired();
  const session = sessions.get(sessionKey(userId));
  if (!session?.document) return undefined;
  if (Date.now() - session.updatedAt >= SESSION_TTL_MS) return undefined;
  if (fileId && session.document.fileId !== fileId) return undefined;
  return session.document;
}

export function getLastDocument(userId: string): CachedDocument | undefined {
  return getDocument(userId);
}

// ============================================
// Публичное API — pending intent
// ============================================

export function setPendingRead(userId: string, pending: Omit<PendingDocumentRead, 'createdAt'>): void {
  pruneExpired();
  const session = getOrCreateSession(userId);
  session.pending = { ...pending, createdAt: Date.now() };
  touch(session);
}

export function getPendingRead(userId: string): PendingDocumentRead | undefined {
  pruneExpired();
  const session = sessions.get(sessionKey(userId));
  if (!session?.pending) return undefined;
  if (Date.now() - session.updatedAt >= SESSION_TTL_MS) return undefined;
  return session.pending;
}

export function clearPendingRead(userId: string): void {
  const session = sessions.get(sessionKey(userId));
  if (!session) return;
  session.pending = undefined;
  touch(session);
}

export function consumePendingRead(userId: string): PendingDocumentRead | undefined {
  const pending = getPendingRead(userId);
  if (!pending) return undefined;
  clearPendingRead(userId);
  return pending;
}

// ============================================
// Нарезка текста
// ============================================

const HEADING_BOUNDARY =
  /\n(?=(?:\d+(?:\.\d+)*\.?\s+|[А-ЯA-Z][А-ЯA-Z\s]{3,}\n|#{1,3}\s+|Раздел\s+|Глава\s+|Таблица\s+|Приложение\s+))/i;

export function sliceDocument(
  doc: CachedDocument,
  options: {
    offset?: number;
    maxLength?: number;
    sectionQuery?: string;
    fromCache?: boolean;
  } = {},
): DocumentSliceResult {
  const maxLength = Math.min(
    Math.max(options.maxLength ?? DOCUMENT_CHUNK_SIZE, 1_000),
    DOCUMENT_CACHE_MAX_CHARS,
  );

  let start = Math.max(0, options.offset ?? 0);
  let sectionFound = false;

  if (options.sectionQuery?.trim()) {
    const query = options.sectionQuery.trim().toLowerCase();
    const idx = doc.fullText.toLowerCase().indexOf(query, start > 0 ? start : 0);
    if (idx >= 0) {
      start = idx;
      sectionFound = true;
    } else {
      const idxFromStart = doc.fullText.toLowerCase().indexOf(query);
      if (idxFromStart >= 0) {
        start = idxFromStart;
        sectionFound = true;
      }
    }
  }

  let end = Math.min(doc.fullText.length, start + maxLength);

  // Если читаем раздел — стараемся не обрезать посередине следующего заголовка
  if (sectionFound && end < doc.fullText.length) {
    const window = doc.fullText.slice(start, Math.min(doc.fullText.length, start + maxLength + 8_000));
    const relative = window.slice(maxLength);
    const boundary = relative.search(HEADING_BOUNDARY);
    if (boundary > 200) {
      end = start + maxLength + boundary;
    }
  }

  const content = doc.fullText.slice(start, end);
  const truncated = end < doc.fullText.length || doc.truncatedOnFetch;

  let hint: string | undefined;
  if (options.sectionQuery && !sectionFound) {
    hint = `Раздел «${options.sectionQuery}» не найден по точному совпадению. Показан фрагмент с offset=${start}. Уточни название раздела или увеличь окно.`;
  } else if (truncated) {
    hint = `Текст обрезан. Чтобы продолжить, вызови read_file_content с тем же file_url и offset=${end}${options.sectionQuery ? ` (section_query можно опустить)` : ''}.`;
  }

  return {
    content,
    fileName: doc.fileName,
    fileId: doc.fileId,
    fileUrl: doc.fileUrl,
    mimeType: doc.mimeType,
    offset: start,
    nextOffset: end,
    totalChars: doc.totalChars,
    truncated,
    sectionFound,
    sectionQuery: options.sectionQuery,
    fromCache: options.fromCache ?? true,
    hint,
  };
}

// ============================================
// Промпт
// ============================================

export function buildDocumentSessionPrompt(userId: string): string {
  pruneExpired();
  const session = sessions.get(sessionKey(userId));
  if (!session || Date.now() - session.updatedAt >= SESSION_TTL_MS) return '';
  if (!session.document && !session.pending) return '';

  const parts = [
    '\n\nСЕССИЯ ДОКУМЕНТА (уже найдено ранее — НЕ ищи оборудование/папку заново):',
  ];

  if (session.document) {
    const doc = session.document;
    parts.push(
      `- Последний файл: ${doc.fileName}`,
      `- file_id: ${doc.fileId}`,
      `- file_url: ${doc.fileUrl}`,
      `- В кэше: ${doc.fullText.length} символов (всего заявлено ${doc.totalChars}${doc.truncatedOnFetch ? ', при загрузке был truncated' : ''})`,
    );
  }

  if (session.pending) {
    const p = session.pending;
    parts.push(
      `- ОЖИДАЕТ ПОДТВЕРЖДЕНИЯ пользователя: прочитать «${p.sectionHint || 'указанный раздел'}»`,
      `- pending file_url: ${p.fileUrl}`,
      p.offset != null ? `- pending offset: ${p.offset}` : '',
      p.note ? `- комментарий: ${p.note}` : '',
    );
  }

  parts.push(
    '',
    'Правила follow-up:',
    '- Если пользователь пишет коротко: «ок», «давай», «хорошо», «углубись», «продолжай», «да» — СРАЗУ читай документ из этой сессии через read_file_content.',
    '- Используй file_url из сессии/pending. НЕ вызывай get_all_equipment / get_equipment_details / search_files_in_folder, если файл уже известен.',
    '- Для углубления в раздел: section_query = название раздела из pending или из просьбы пользователя.',
    '- Для продолжения длинного текста: передай offset = nextOffset из прошлого ответа.',
    '- Перед предложением «углубиться в раздел X» вызови set_pending_document_read с file_url и section_hint.',
  );

  return parts.filter(Boolean).join('\n');
}

export function isDocumentFollowUp(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.length > 80) return false;
  return /^(ок|окей|okay|ok|да|давай|хорошо|согласен|углубись|продолжай|продолжи|дальше|читай|прочитай|ага|угу|yes|yep|go)\b/i.test(
    normalized,
  );
}
