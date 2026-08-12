/**
 * documentSessionTools.test.ts
 *
 * Tools pending/get session поверх documentSessionService.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  clearDocumentSessionsForTests,
  getPendingRead,
  putDocument,
} from '../services/ai/documentSessionService.js';
import { runWithToolContext } from '../services/ai/toolContext.js';
import { executeDocumentSessionTool } from './documentSessionTools.js';

const FILE_ID = 'ABCDEFGHIJKLMNOPQRSTUV';
const FILE_URL = `https://drive.google.com/file/d/${FILE_ID}/view`;

afterEach(() => {
  clearDocumentSessionsForTests();
});

describe('executeDocumentSessionTool', () => {
  it('set_pending_document_read stores hint for follow-up', async () => {
    putDocument('u1', {
      fileId: FILE_ID,
      fileUrl: FILE_URL,
      fileName: 'passport.pdf',
      fullText: 'x',
      totalChars: 1,
      truncatedOnFetch: false,
    });

    const result = await runWithToolContext({ userId: 'u1' }, () =>
      executeDocumentSessionTool('set_pending_document_read', {
        file_url: FILE_URL,
        section_hint: 'Глава 2',
      }),
    );

    expect(result).toMatchObject({ success: true });
    expect(getPendingRead('u1')?.sectionHint).toBe('Глава 2');
  });

  it('get_document_session returns cached meta without full text', async () => {
    putDocument('u1', {
      fileId: FILE_ID,
      fileUrl: FILE_URL,
      fileName: 'passport.pdf',
      fullText: 'secret body',
      totalChars: 11,
      truncatedOnFetch: false,
    });

    const result = (await runWithToolContext({ userId: 'u1' }, () =>
      executeDocumentSessionTool('get_document_session', {}),
    )) as {
      document: { fileName: string; cachedChars: number; fullText?: string } | null;
      cachedDocuments: Array<{ fileName: string; active: boolean }>;
    };

    expect(result.document?.fileName).toBe('passport.pdf');
    expect(result.document?.cachedChars).toBe(11);
    expect(result.document).not.toHaveProperty('fullText');
    expect(result.cachedDocuments).toHaveLength(1);
    expect(result.cachedDocuments[0].active).toBe(true);
  });

  it('clear_pending_document_read clears pending', async () => {
    await runWithToolContext({ userId: 'u1' }, () =>
      executeDocumentSessionTool('set_pending_document_read', {
        file_url: FILE_URL,
        section_hint: 'X',
      }),
    );
    await runWithToolContext({ userId: 'u1' }, () =>
      executeDocumentSessionTool('clear_pending_document_read', {}),
    );
    expect(getPendingRead('u1')).toBeUndefined();
  });
});
