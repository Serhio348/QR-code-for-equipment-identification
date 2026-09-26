import { describe, expect, it } from 'vitest';
import {
  AnalysisFileCleanupError,
  deleteAnalysisWithAttachments,
  detachAnalysisAttachment,
  linkUploadedAnalysisPdf,
} from './analysisAttachmentLifecycle';

describe('detachAnalysisAttachment', () => {
  it('keeps the file when the database unlink fails', async () => {
    const deleted: string[] = [];
    await expect(detachAnalysisAttachment(
      ['https://files/a.pdf'],
      'https://files/a.pdf',
      {
        writeUrls: async () => {
          throw new Error('сбой базы');
        },
        deleteFile: async (url) => {
          deleted.push(url);
        },
      },
    )).rejects.toThrow('сбой базы');
    expect(deleted).toEqual([]);
  });

  it('reports an orphan when storage delete fails after the link is gone', async () => {
    const written: string[][] = [];
    const outcome = await detachAnalysisAttachment(
      ['https://files/a.pdf', 'https://files/b.pdf'],
      'https://files/a.pdf',
      {
        writeUrls: async (urls) => {
          written.push(urls);
        },
        deleteFile: async () => {
          throw new Error('сбой хранилища');
        },
      },
    );
    expect(written).toEqual([['https://files/b.pdf']]);
    expect(outcome).toEqual({ urls: ['https://files/b.pdf'], fileRemoved: false });
  });
});

describe('linkUploadedAnalysisPdf', () => {
  it('deletes the uploaded file when the link is not saved', async () => {
    const deleted: string[] = [];
    await expect(linkUploadedAnalysisPdf([], 'https://files/new.pdf', {
      writeUrls: async () => {
        throw new Error('сбой записи ссылки');
      },
      deleteFile: async (url) => {
        deleted.push(url);
      },
    })).rejects.toThrow('сбой записи ссылки');
    expect(deleted).toEqual(['https://files/new.pdf']);
  });

  it('reports an orphan when compensation cannot delete the file', async () => {
    await expect(linkUploadedAnalysisPdf([], 'https://files/new.pdf', {
      writeUrls: async () => {
        throw new Error('сбой записи ссылки');
      },
      deleteFile: async () => {
        throw new Error('хранилище недоступно');
      },
    })).rejects.toThrow('файл остался в хранилище: хранилище недоступно');
  });
});

describe('deleteAnalysisWithAttachments', () => {
  it('does not delete files when the record delete fails', async () => {
    const deleted: string[] = [];
    await expect(deleteAnalysisWithAttachments({
      readUrls: async () => ['https://files/a.pdf'],
      deleteRecord: async () => {
        throw new Error('запись используется');
      },
      deleteFile: async (url) => {
        deleted.push(url);
      },
    })).rejects.toThrow('запись используется');
    expect(deleted).toEqual([]);
  });

  it('does not delete the record when the analysis is missing', async () => {
    let deletedRecord = false;
    await expect(deleteAnalysisWithAttachments({
      readUrls: async () => null,
      deleteRecord: async () => {
        deletedRecord = true;
      },
      deleteFile: async () => {},
    })).rejects.toThrow('Анализ не найден');
    expect(deletedRecord).toBe(false);
  });

  it('reports leftover files after the record is deleted', async () => {
    let deletedRecord = false;
    const error = await deleteAnalysisWithAttachments({
      readUrls: async () => ['https://files/a.pdf', 'https://files/b.pdf'],
      deleteRecord: async () => {
        deletedRecord = true;
      },
      deleteFile: async (url) => {
        if (url.endsWith('b.pdf')) throw new Error('сбой хранилища');
      },
    }).catch(caught => caught);

    expect(deletedRecord).toBe(true);
    expect(error).toBeInstanceOf(AnalysisFileCleanupError);
    expect(error.orphanUrls).toEqual(['https://files/b.pdf']);
  });
});
