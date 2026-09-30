/**
 * documentChunker.ts
 *
 * Разбивает извлечённый документ на страницы и структурированные chunks.
 *
 * Структура / что умеет:
 * 1. splitDocumentPages — страницы по разрывам, которые ставит извлечение
 * 2. chunkDocumentText — разделы, размер окна и небольшое перекрытие
 *
 * Пример:
 * "стр.1\fстр.2" → chunks с pageStart 1 и 2
 */

export interface DocumentChunk {
  pageStart: number | null;
  pageEnd: number | null;
  sectionTitle: string | null;
  content: string;
}

const TARGET_CHARS = 1_800;
const MAX_CHARS = 3_200;
const OVERLAP_CHARS = 250;
const MIN_MERGE_CHARS = 350;

const HEADING_PATTERN =
  /^(?:#{1,3}\s+\S.{2,120}|(?:раздел|глава|приложение|таблица)\s+\S.{0,120}|\d+(?:\.\d+){0,4}\.?\s+[A-ZА-ЯЁ].{2,120})$/iu;

export function chunkDocumentText(text: string): DocumentChunk[] {
  const pages = splitDocumentPages(text);
  const chunks: DocumentChunk[] = [];

  for (const page of pages) {
    for (const section of splitSections(page.text)) {
      for (const piece of splitBySize(section.text)) {
        chunks.push({
          pageStart: page.number,
          pageEnd: page.number,
          sectionTitle: section.title,
          content: piece,
        });
      }
    }
  }

  return mergeShortChunks(chunks);
}

export function splitDocumentPages(text: string): Array<{ number: number | null; text: string }> {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\u000c/g, '\f').trim();
  if (!normalized) return [];
  if (!normalized.includes('\f')) return [{ number: null, text: normalized }];

  return normalized
    .split('\f')
    .map((page) => page.trim())
    .filter(Boolean)
    .map((page, index) => ({ number: index + 1, text: page }));
}

function splitSections(text: string): Array<{ title: string | null; text: string }> {
  const sections: Array<{ title: string | null; lines: string[] }> = [];
  let current: { title: string | null; lines: string[] } = { title: null, lines: [] };

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && HEADING_PATTERN.test(trimmed) && trimmed.length <= 140) {
      if (current.lines.some((item) => item.trim())) sections.push(current);
      current = { title: trimmed.replace(/^#{1,3}\s+/, ''), lines: [line] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.some((item) => item.trim())) sections.push(current);

  return sections
    .map((section) => ({ title: section.title, text: section.lines.join('\n').trim() }))
    .filter((section) => section.text);
}

function splitBySize(text: string): string[] {
  if (text.length <= MAX_CHARS) return [text];
  const parts: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(text.length, start + TARGET_CHARS);
    if (end < text.length) {
      const lineBreak = text.lastIndexOf('\n', end);
      if (lineBreak > start + TARGET_CHARS / 2) end = lineBreak;
    }
    const piece = text.slice(start, end).trim();
    if (piece) parts.push(piece);
    if (end >= text.length) break;
    start = Math.max(end - OVERLAP_CHARS, start + 1);
  }

  return parts;
}

function mergeShortChunks(chunks: DocumentChunk[]): DocumentChunk[] {
  const merged: DocumentChunk[] = [];
  for (const chunk of chunks) {
    const previous = merged[merged.length - 1];
    const sameLocation = previous
      && previous.pageStart === chunk.pageStart
      && previous.sectionTitle === chunk.sectionTitle;
    if (
      previous
      && sameLocation
      && previous.content.length < MIN_MERGE_CHARS
      && previous.content.length + chunk.content.length + 1 <= MAX_CHARS
    ) {
      previous.content = `${previous.content}\n${chunk.content}`;
      previous.pageEnd = chunk.pageEnd;
    } else {
      merged.push({ ...chunk });
    }
  }
  return merged;
}
