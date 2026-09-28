/**
 * draftStore.ts
 *
 * Память черновиков бланка: один draft на пользователя, TTL 30 минут.
 * Просроченный draft удаляется при обращении. Чужой userId его не видит.
 */

import type { FormDraft } from './types.js';

export const FORM_DRAFT_TTL_MS = 30 * 60 * 1000;

export interface DraftLookup {
  draft: FormDraft | null;
  expired: boolean;
}

export interface DraftStore {
  peek: (userId: string, now: number) => DraftLookup;
  save: (draft: FormDraft) => void;
  delete: (userId: string) => void;
  has: (userId: string) => boolean;
  /**
   * Синхронно помечает draft как отправляемый.
   * Второй вызов до завершения записи получает busy и не пишет повторно.
   */
  tryBeginSubmit: (userId: string, now: number) => FormDraft | 'busy' | 'missing';
  abortSubmit: (userId: string, now: number) => void;
}

export function createDraftStore(): DraftStore {
  const drafts = new Map<string, FormDraft>();

  const peek = (userId: string, now: number): DraftLookup => {
    const draft = drafts.get(userId);
    if (!draft) return { draft: null, expired: false };
    if (now - draft.updatedAt >= FORM_DRAFT_TTL_MS) {
      drafts.delete(userId);
      return { draft: null, expired: true };
    }
    return { draft, expired: false };
  };

  return {
    peek,
    save(draft: FormDraft): void {
      drafts.set(draft.userId, draft);
    },
    delete(userId: string): void {
      drafts.delete(userId);
    },
    has(userId: string): boolean {
      return drafts.has(userId);
    },
    tryBeginSubmit(userId: string, now: number): FormDraft | 'busy' | 'missing' {
      const lookup = peek(userId, now);
      if (!lookup.draft) return 'missing';
      if (lookup.draft.submitting) return 'busy';
      lookup.draft.submitting = true;
      lookup.draft.updatedAt = now;
      return lookup.draft;
    },
    abortSubmit(userId: string, now: number): void {
      const draft = drafts.get(userId);
      if (!draft) return;
      draft.submitting = false;
      draft.updatedAt = now;
    },
  };
}
