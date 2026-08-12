/**
 * driveFileContextService.test.ts
 *
 * Проверяет, когда preload индекса Drive включается/пропускается,
 * и что индекс форматируется из ответа GAS.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../equipment/index.js', () => ({
  gasClient: {
    get: vi.fn(),
  },
}));

import { gasClient } from '../equipment/index.js';
import { clearDocumentSessionsForTests } from './documentSessionService.js';
import { buildDriveFileContext } from './driveFileContextService.js';
import type { ChatMessage, EquipmentContext } from './types.js';

const gasGet = vi.mocked(gasClient.get);

const equipment: EquipmentContext = {
  id: 'eq-1',
  name: 'Осмос',
  type: 'RO',
  googleDriveUrl: 'https://drive.google.com/drive/folders/FOLDER1234567890abcd',
};

function userMsg(text: string): ChatMessage[] {
  return [{ role: 'user', content: text }];
}

afterEach(() => {
  clearDocumentSessionsForTests();
  gasGet.mockReset();
});

describe('buildDriveFileContext', () => {
  it('returns empty without googleDriveUrl', async () => {
    const ctx = await buildDriveFileContext(userMsg('найди паспорт'), {
      id: 'eq-1',
      name: 'X',
      type: 't',
    });
    expect(ctx).toBe('');
    expect(gasGet).not.toHaveBeenCalled();
  });

  it('skips preload for short confirmations (follow-up)', async () => {
    const ctx = await buildDriveFileContext(userMsg('ок'), equipment);
    expect(ctx).toBe('');
    expect(gasGet).not.toHaveBeenCalled();
  });

  it('skips preload for unrelated short questions', async () => {
    const ctx = await buildDriveFileContext(userMsg('какая температура?'), equipment);
    expect(ctx).toBe('');
    expect(gasGet).not.toHaveBeenCalled();
  });

  it('preloads for document intent phrases', async () => {
    gasGet.mockImplementation(async (_action, params) => {
      const mime = (params as { mimeType?: string } | undefined)?.mimeType;
      if (mime === 'application/vnd.google-apps.folder') {
        return {
          files: [
            {
              id: 'folderDocs',
              name: 'Документация',
              url: 'https://drive.google.com/drive/folders/folderDocs',
              mimeType: 'application/vnd.google-apps.folder',
            },
          ],
        };
      }
      const folderId = (params as { folderId?: string } | undefined)?.folderId;
      if (folderId === 'folderDocs') {
        return {
          files: [
            {
              id: 'nestedPdf',
              name: 'паспорт.pdf',
              url: 'https://drive.google.com/file/d/nestedPdf/view',
              mimeType: 'application/pdf',
            },
          ],
        };
      }
      return {
        files: [
          {
            id: 'rootPdf',
            name: 'инструкция.pdf',
            url: 'https://drive.google.com/file/d/rootPdf/view',
            mimeType: 'application/pdf',
          },
        ],
      };
    });

    const ctx = await buildDriveFileContext(userMsg('найди паспорт'), equipment);

    expect(ctx).toContain('ПРЕДВАРИТЕЛЬНЫЙ ИНДЕКС GOOGLE DRIVE');
    expect(ctx).toContain('инструкция.pdf');
    expect(ctx).toContain('Документация');
    expect(ctx).toContain('паспорт.pdf');
    expect(gasGet).toHaveBeenCalled();
  });

  it('preloads for long requests even without keyword', async () => {
    gasGet.mockResolvedValue({ files: [] });
    const long = 'x'.repeat(700);
    await buildDriveFileContext(userMsg(long), equipment);
    expect(gasGet).toHaveBeenCalled();
  });

  it('preloads for «прочитай паспорт» (must not be treated as follow-up)', async () => {
    gasGet.mockResolvedValue({ files: [] });
    await buildDriveFileContext(userMsg('прочитай паспорт'), equipment);
    expect(gasGet).toHaveBeenCalled();
  });

  it('returns empty string when GAS fails', async () => {
    gasGet.mockRejectedValue(new Error('GAS down'));
    const ctx = await buildDriveFileContext(userMsg('открой документацию'), equipment);
    expect(ctx).toBe('');
  });
});
