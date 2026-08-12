/**
 * documentSessionService.test.ts
 *
 * Юнит-тесты сессии документа: кэш, pending, slice, follow-up.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DOCUMENT_CACHE_MAX_CHARS,
  DOCUMENT_CHUNK_SIZE,
  buildDocumentSessionPrompt,
  clearDocumentSessionsForTests,
  clearPendingRead,
  consumePendingRead,
  getDocument,
  getPendingRead,
  isDocumentFollowUp,
  putDocument,
  setPendingRead,
  sliceDocument,
  type CachedDocument,
} from './documentSessionService.js';

function makeDoc(overrides: Partial<CachedDocument> & { fullText: string }): CachedDocument {
  return {
    fileId: overrides.fileId ?? 'file-1',
    fileUrl: overrides.fileUrl ?? 'https://drive.google.com/open?id=file-1',
    fileName: overrides.fileName ?? 'passport.pdf',
    mimeType: overrides.mimeType ?? 'application/pdf',
    fullText: overrides.fullText,
    totalChars: overrides.totalChars ?? overrides.fullText.length,
    truncatedOnFetch: overrides.truncatedOnFetch ?? false,
    equipmentId: overrides.equipmentId,
    updatedAt: overrides.updatedAt ?? Date.now(),
  };
}

afterEach(() => {
  clearDocumentSessionsForTests();
  vi.useRealTimers();
});

// ============================================
// isDocumentFollowUp
// ============================================

describe('isDocumentFollowUp', () => {
  it.each([
    'ок',
    'Ок!',
    'давай',
    'хорошо',
    'углубись',
    'продолжай',
    'да',
    'ok',
    'ок, давай',
    'давай пожалуйста',
    'прочитай',
  ])('accepts confirmation: %s', (text) => {
    expect(isDocumentFollowUp(text)).toBe(true);
  });

  it.each([
    'прочитай паспорт',
    'прочитай инструкцию по насосу',
    'хорошо бы проверить насос',
    'да, какое давление в контуре?',
    'найди паспорт обратного осмоса',
    'покажи документацию',
    'углубись в раздел 4.2 Насос',
  ])('rejects document requests disguised as follow-up: %s', (text) => {
    expect(isDocumentFollowUp(text)).toBe(false);
  });

  it('rejects empty and very long messages', () => {
    expect(isDocumentFollowUp('')).toBe(false);
    expect(isDocumentFollowUp('   ')).toBe(false);
    expect(isDocumentFollowUp('ок '.repeat(40))).toBe(false);
  });
});

// ============================================
// Session cache
// ============================================

describe('document session cache', () => {
  it('stores and returns document for the same user', () => {
    putDocument('user-a', {
      fileId: 'f1',
      fileUrl: 'https://drive.google.com/open?id=f1',
      fileName: 'a.pdf',
      fullText: 'hello',
      totalChars: 5,
      truncatedOnFetch: false,
    });

    expect(getDocument('user-a')?.fileName).toBe('a.pdf');
    expect(getDocument('user-a', 'f1')?.fullText).toBe('hello');
  });

  it('isolates sessions between users', () => {
    putDocument('user-a', {
      fileId: 'f1',
      fileUrl: 'u1',
      fileName: 'a.pdf',
      fullText: 'aaa',
      totalChars: 3,
      truncatedOnFetch: false,
    });
    putDocument('user-b', {
      fileId: 'f2',
      fileUrl: 'u2',
      fileName: 'b.pdf',
      fullText: 'bbb',
      totalChars: 3,
      truncatedOnFetch: false,
    });

    expect(getDocument('user-a')?.fileId).toBe('f1');
    expect(getDocument('user-b')?.fileId).toBe('f2');
  });

  it('keeps multiple documents and can return earlier file by id', () => {
    putDocument('user-a', {
      fileId: 'f1',
      fileUrl: 'u1',
      fileName: 'first.pdf',
      fullText: 'one',
      totalChars: 3,
      truncatedOnFetch: false,
    });
    putDocument('user-a', {
      fileId: 'f2',
      fileUrl: 'u2',
      fileName: 'second.pdf',
      fullText: 'two',
      totalChars: 3,
      truncatedOnFetch: false,
    });

    expect(getDocument('user-a')?.fileId).toBe('f2');
    expect(getDocument('user-a', 'f1')?.fileName).toBe('first.pdf');
  });

  it('evicts oldest when more than 5 documents cached', () => {
    for (let i = 1; i <= 6; i++) {
      putDocument('user-a', {
        fileId: `f${i}`,
        fileUrl: `u${i}`,
        fileName: `${i}.pdf`,
        fullText: `t${i}`,
        totalChars: 2,
        truncatedOnFetch: false,
      });
    }

    expect(getDocument('user-a', 'f1')).toBeUndefined();
    expect(getDocument('user-a', 'f2')?.fileId).toBe('f2');
    expect(getDocument('user-a')?.fileId).toBe('f6');
  });

  it('clears pending when switching to another file', () => {
    putDocument('user-a', {
      fileId: 'f1',
      fileUrl: 'u1',
      fileName: 'a.pdf',
      fullText: 'a',
      totalChars: 1,
      truncatedOnFetch: false,
    });
    setPendingRead('user-a', {
      fileId: 'f1',
      fileUrl: 'u1',
      sectionHint: 'Глава 1',
    });
    putDocument('user-a', {
      fileId: 'f2',
      fileUrl: 'u2',
      fileName: 'b.pdf',
      fullText: 'b',
      totalChars: 1,
      truncatedOnFetch: false,
    });

    expect(getPendingRead('user-a')).toBeUndefined();
  });

  it('truncates oversized text to DOCUMENT_CACHE_MAX_CHARS', () => {
    const huge = 'x'.repeat(DOCUMENT_CACHE_MAX_CHARS + 5000);
    const cached = putDocument('user-a', {
      fileId: 'big',
      fileUrl: 'u',
      fileName: 'big.pdf',
      fullText: huge,
      totalChars: huge.length,
      truncatedOnFetch: false,
    });

    expect(cached.fullText.length).toBe(DOCUMENT_CACHE_MAX_CHARS);
    expect(cached.truncatedOnFetch).toBe(true);
  });

  it('expires session after TTL', () => {
    vi.useFakeTimers();
    putDocument('user-a', {
      fileId: 'f1',
      fileUrl: 'u1',
      fileName: 'a.pdf',
      fullText: 'text',
      totalChars: 4,
      truncatedOnFetch: false,
    });

    vi.advanceTimersByTime(2 * 60 * 60 * 1000 + 1);
    expect(getDocument('user-a')).toBeUndefined();
  });
});

// ============================================
// Pending intent
// ============================================

describe('pending document read', () => {
  it('stores, reads and consumes pending', () => {
    setPendingRead('user-a', {
      fileId: 'f1',
      fileUrl: 'https://drive.google.com/open?id=f1',
      sectionHint: 'Глава 3',
      offset: 1200,
    });

    expect(getPendingRead('user-a')?.sectionHint).toBe('Глава 3');
    const consumed = consumePendingRead('user-a');
    expect(consumed?.offset).toBe(1200);
    expect(getPendingRead('user-a')).toBeUndefined();
  });

  it('clearPendingRead removes only pending, keeps document', () => {
    putDocument('user-a', {
      fileId: 'f1',
      fileUrl: 'u1',
      fileName: 'a.pdf',
      fullText: 'body',
      totalChars: 4,
      truncatedOnFetch: false,
    });
    setPendingRead('user-a', {
      fileId: 'f1',
      fileUrl: 'u1',
      sectionHint: 'Таблица 1',
    });

    clearPendingRead('user-a');
    expect(getPendingRead('user-a')).toBeUndefined();
    expect(getDocument('user-a')?.fileName).toBe('a.pdf');
  });
});

// ============================================
// sliceDocument
// ============================================

describe('sliceDocument', () => {
  it('returns a default window from the start', () => {
    const doc = makeDoc({ fullText: 'a'.repeat(DOCUMENT_CHUNK_SIZE + 10_000) });
    const slice = sliceDocument(doc, { fromCache: false });

    expect(slice.content.length).toBe(DOCUMENT_CHUNK_SIZE);
    expect(slice.offset).toBe(0);
    expect(slice.nextOffset).toBe(DOCUMENT_CHUNK_SIZE);
    expect(slice.truncated).toBe(true);
    expect(slice.fromCache).toBe(false);
    expect(slice.hint).toContain('offset=');
  });

  it('continues from offset', () => {
    const doc = makeDoc({ fullText: '0123456789'.repeat(1000) });
    const slice = sliceDocument(doc, { offset: 50, maxLength: 1000 });
    expect(slice.content).toBe(doc.fullText.slice(50, 1050));
    expect(slice.nextOffset).toBe(1050);
  });

  it('floors maxLength to 1000 (cannot request a tiny window)', () => {
    const doc = makeDoc({ fullText: 'x'.repeat(5000) });
    const slice = sliceDocument(doc, { maxLength: 20 });
    expect(slice.content.length).toBe(1000);
  });

  it('finds section_query case-insensitively', () => {
    const doc = makeDoc({
      fullText: 'Введение\n\nГлава 3. Насосный блок\nДавление 6 бар\n\nГлава 4. Фильтр\n',
    });
    const slice = sliceDocument(doc, {
      sectionQuery: 'глава 3. насосный блок',
      maxLength: 80,
    });

    expect(slice.sectionFound).toBe(true);
    expect(slice.content.toLowerCase()).toContain('насосный блок');
    expect(slice.content).toContain('Давление 6 бар');
  });

  it('matches section_query as substring; typos miss', () => {
    const doc = makeDoc({
      fullText: 'Глава 3. Насосный блок\nТекст раздела\n',
    });
    const slice = sliceDocument(doc, {
      sectionQuery: 'насосный',
      maxLength: 40,
    });
    expect(slice.sectionFound).toBe(true);

    const miss = sliceDocument(doc, {
      sectionQuery: 'насосный бок', // typo
      maxLength: 40,
    });
    expect(miss.sectionFound).toBe(false);
    expect(miss.hint).toMatch(/не найден/);
    expect(miss.offset).toBe(0);
  });

  it('marks truncated when source fetch was truncated even if window fits', () => {
    const doc = makeDoc({
      fullText: 'short',
      truncatedOnFetch: true,
      totalChars: 999_999,
    });
    const slice = sliceDocument(doc, { maxLength: 1000 });
    expect(slice.truncated).toBe(true);
  });
});

// ============================================
// buildDocumentSessionPrompt
// ============================================

describe('buildDocumentSessionPrompt', () => {
  it('returns empty without session', () => {
    expect(buildDocumentSessionPrompt('nobody')).toBe('');
  });

  it('includes file_url, previous docs and switch rules', () => {
    putDocument('user-a', {
      fileId: 'f1',
      fileUrl: 'https://drive.google.com/open?id=f1',
      fileName: 'passport.pdf',
      fullText: 'content',
      totalChars: 7,
      truncatedOnFetch: false,
    });
    putDocument('user-a', {
      fileId: 'f2',
      fileUrl: 'https://drive.google.com/open?id=f2',
      fileName: 'manual.pdf',
      fullText: 'manual',
      totalChars: 6,
      truncatedOnFetch: false,
    });
    setPendingRead('user-a', {
      fileId: 'f2',
      fileUrl: 'https://drive.google.com/open?id=f2',
      sectionHint: 'Раздел 2',
    });

    const prompt = buildDocumentSessionPrompt('user-a');
    expect(prompt).toContain('СЕССИЯ ДОКУМЕНТОВ');
    expect(prompt).toContain('manual.pdf');
    expect(prompt).toContain('passport.pdf');
    expect(prompt).toContain('https://drive.google.com/open?id=f2');
    expect(prompt).toContain('Раздел 2');
    expect(prompt).toContain('ДРУГОЙ документ');
    expect(prompt).toContain('других файлов нет');
  });
});
