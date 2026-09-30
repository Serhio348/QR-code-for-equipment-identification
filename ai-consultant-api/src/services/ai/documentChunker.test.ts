import { describe, expect, it } from 'vitest';
import { chunkDocumentText } from './documentChunker.js';

describe('chunkDocumentText', () => {
  it('keeps real page boundaries and section titles', () => {
    const chunks = chunkDocumentText(
      '1. Характеристики\nДавление 10 бар\f2. Неисправности\nНасос перегревается',
    );

    expect(chunks.map((chunk) => chunk.pageStart)).toEqual([1, 2]);
    expect(chunks[0]?.sectionTitle).toBe('1. Характеристики');
    expect(chunks[1]?.content).toContain('перегревается');
  });

  it('does not invent page numbers when extraction has no page breaks', () => {
    const chunks = chunkDocumentText('Общий текст паспорта без разрывов страниц.');

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.pageStart).toBeNull();
  });

  it('splits a long page into overlapping chunks', () => {
    const page = Array.from({ length: 40 }, (_, index) => `Строка ${index + 1} ${'параметр '.repeat(12)}`).join('\n');
    const chunks = chunkDocumentText(page);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.pageStart === null)).toBe(true);
    expect(chunks[1]?.content).toContain(chunks[0]?.content.slice(-40));
  });
});
