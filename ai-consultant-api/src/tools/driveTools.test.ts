/**
 * driveTools.test.ts
 *
 * Проверяет read_file_content: fetch→кэш→slice, pending section/offset,
 * повторное чтение из кэша без второго вызова GAS.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/equipment/index.js', () => ({
  gasClient: {
    get: vi.fn(),
  },
}));

import { gasClient } from '../services/equipment/index.js';
import {
  clearDocumentSessionsForTests,
  getDocument,
  getPendingRead,
  setPendingRead,
} from '../services/ai/documentSessionService.js';
import { runWithToolContext } from '../services/ai/toolContext.js';
import { executeDriveTool } from './driveTools.js';

const gasGet = vi.mocked(gasClient.get);

afterEach(() => {
  clearDocumentSessionsForTests();
  gasGet.mockReset();
});

const FILE_ID = 'ABCDEFGHIJKLMNOPQRSTUV';
const FILE_URL = `https://drive.google.com/file/d/${FILE_ID}/view`;

function mockFileContent(content: string, extras: Record<string, unknown> = {}): void {
  gasGet.mockResolvedValue({
    success: true,
    content,
    fileName: 'passport.pdf',
    mimeType: 'application/pdf',
    charCount: content.length,
    truncated: false,
    ...extras,
  });
}

describe('executeDriveTool / read_file_content', () => {
  it('fetches from GAS, caches, and returns a chunk', async () => {
    mockFileContent('Глава 1\nТекст паспорта\n');

    const result = await runWithToolContext({ userId: 'u1', equipmentId: 'eq1' }, () =>
      executeDriveTool('read_file_content', { file_url: FILE_URL }),
    );

    expect(result).toMatchObject({
      success: true,
      fromCache: false,
      fileName: 'passport.pdf',
      content: expect.stringContaining('Текст паспорта'),
    });
    expect(gasGet).toHaveBeenCalledWith(
      'getFileContent',
      expect.objectContaining({ fileId: FILE_ID }),
    );
    expect(getDocument('u1', FILE_ID)?.fullText).toContain('Текст паспорта');
  });

  it('serves second read from session cache without GAS', async () => {
    mockFileContent('полный текст документа');

    await runWithToolContext({ userId: 'u1' }, () =>
      executeDriveTool('read_file_content', { file_url: FILE_URL }),
    );
    gasGet.mockClear();

    const second = await runWithToolContext({ userId: 'u1' }, () =>
      executeDriveTool('read_file_content', {
        file_url: FILE_URL,
        section_query: 'полный текст',
      }),
    );

    expect(second).toMatchObject({
      success: true,
      fromCache: true,
      sectionFound: true,
    });
    expect(gasGet).not.toHaveBeenCalled();
  });

  it('applies pending section_hint when agent omits section_query', async () => {
    mockFileContent('Intro\n\nРаздел Насос\nДавление 6 бар\n\nКонец\n');
    setPendingRead('u1', {
      fileId: FILE_ID,
      fileUrl: FILE_URL,
      sectionHint: 'Раздел Насос',
    });

    const result = (await runWithToolContext({ userId: 'u1' }, () =>
      executeDriveTool('read_file_content', { file_url: FILE_URL, max_length: 80 }),
    )) as { sectionFound: boolean; content: string; sectionQuery?: string };

    expect(result.sectionFound).toBe(true);
    expect(result.content).toContain('Давление 6 бар');
    expect(getPendingRead('u1')).toBeUndefined();
  });

  it('sets auto-pending with nextOffset when truncated', async () => {
    const long = 'A'.repeat(5_000);
    mockFileContent(long);

    await runWithToolContext({ userId: 'u1' }, () =>
      executeDriveTool('read_file_content', {
        file_url: FILE_URL,
        max_length: 1000,
      }),
    );

    const pending = getPendingRead('u1');
    expect(pending?.offset).toBe(1000);
    expect(pending?.note).toMatch(/продолжен/i);
  });

  it('returns error when file_url missing', async () => {
    const result = await runWithToolContext({ userId: 'u1' }, () =>
      executeDriveTool('read_file_content', {}),
    );
    expect(result).toMatchObject({ success: false });
  });

  it('search_files_in_folder forwards folder id to GAS', async () => {
    gasGet.mockResolvedValue({ files: [{ id: '1', name: 'a.pdf' }] });
    await executeDriveTool('search_files_in_folder', {
      folder_url: 'https://drive.google.com/drive/folders/FOLDER1234567890abcd',
      query: 'паспорт',
    });
    expect(gasGet).toHaveBeenCalledWith(
      'getFolderFiles',
      expect.objectContaining({
        folderId: 'FOLDER1234567890abcd',
        query: 'паспорт',
      }),
    );
  });

  it('search_files_in_folder adds hint when query returns empty', async () => {
    gasGet.mockResolvedValue({ files: [] });
    const result = (await executeDriveTool('search_files_in_folder', {
      folder_url: 'https://drive.google.com/drive/folders/FOLDER1234567890abcd',
      query: 'несуществующее',
    })) as { empty: boolean; hint: string; count: number };

    expect(result.empty).toBe(true);
    expect(result.count).toBe(0);
    expect(result.hint).toMatch(/без query/);
    expect(result.hint).toMatch(/файлов нет/);
  });
});
