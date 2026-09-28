/**
 * engine.test.ts
 *
 * Движок бланка без базы и без модели.
 * Проверяет черновик, TTL, команды и одну запись на подтверждение.
 */

import { describe, expect, it } from 'vitest';
import { FORM_DRAFT_TTL_MS, createDraftStore } from './draftStore.js';
import { handleFormTurn } from './engine.js';
import { matchTriggerPhrase } from './parse.js';
import { createFormRegistry } from './registry.js';
import type { UserAppAccess } from '../userAppAccessService.js';
import type { FormDefinition, FormEngineResult, FormServices } from './types.js';

const allowed: UserAppAccess = { equipment: true, water: true, isAdmin: false };
const denied: UserAppAccess = { equipment: false, water: false, isAdmin: false };

const services: FormServices = {
  listEquipment: async () => [],
  getEquipment: async () => null,
  listSamplingPoints: async () => [],
  addMaintenanceEntry: async () => {},
  addWaterAnalysis: async () => {},
};

function sampleForm(submit: FormDefinition['submit']): FormDefinition {
  return {
    id: 'sample',
    matchTrigger: (text) => matchTriggerPhrase(text, ['начать бланк']),
    isAllowed: (access) => access.equipment,
    steps: [
      {
        id: 'name',
        label: 'Имя',
        optional: false,
        editPhrases: ['имя'],
        prompt: () => ({ text: 'Как вас зовут?' }),
      },
      {
        id: 'note',
        label: 'Примечание',
        optional: true,
        editPhrases: ['примечание'],
        prompt: () => ({ text: 'Примечание?', suggestions: ['Пропустить'] }),
        onSkip: () => [{ key: 'note', value: '', undoable: true }],
      },
    ],
    async interpret(text, draft) {
      const stepId = draft.currentStep || 'name';
      if (stepId === 'name') {
        return { type: 'ok', values: [{ key: 'name', value: text.trim(), undoable: true }] };
      }
      return { type: 'ok', values: [{ key: 'note', value: text.trim(), undoable: true }] };
    },
    confirmation: (draft) => ({
      text: `Проверьте данные:\n\nИмя: ${draft.values.name ?? ''}\n\nСохранить?`,
      suggestions: ['Да', 'Нет', 'Редактировать'],
    }),
    submit,
  };
}

const otherForm: FormDefinition = {
  id: 'other',
  matchTrigger: (text) => matchTriggerPhrase(text, ['другой бланк']),
  isAllowed: () => true,
  steps: [
    {
      id: 'title',
      label: 'Название',
      optional: false,
      editPhrases: ['название'],
      prompt: () => ({ text: 'Название?' }),
    },
  ],
  async interpret(text) {
    return { type: 'ok', values: [{ key: 'title', value: text.trim(), undoable: true }] };
  },
  confirmation: () => ({ text: 'Сохранить?', suggestions: ['Да', 'Нет', 'Редактировать'] }),
  submit: async () => ({ ok: true, text: 'Сохранено.' }),
};

function session(submit: FormDefinition['submit'] = async () => ({ ok: true, text: 'Сохранено.' })) {
  const store = createDraftStore();
  const form = sampleForm(submit);
  const registry = createFormRegistry([form, otherForm]);
  const now = Date.parse('2026-09-28T10:00:00.000Z');
  const say = (userId: string, text: string, at = now): Promise<FormEngineResult> => handleFormTurn(
    { userId, text, access: allowed, now: at },
    { store, registry, services },
  );
  return { store, form, now, say };
}

describe('form engine', () => {
  it('starts a form and keeps one draft for the user', async () => {
    const { store, say } = session();
    const started = await say('user-a', 'начать бланк');
    expect(started.handled).toBe(true);
    if (started.handled) expect(started.text).toContain('Как вас зовут?');
    expect(store.peek('user-a', Date.parse('2026-09-28T10:00:00.000Z')).draft?.formId).toBe('sample');

    await say('user-a', 'начать бланк');
    expect(store.peek('user-a', Date.parse('2026-09-28T10:00:00.000Z')).draft?.values.name).toBe('начать бланк');
    expect(store.peek('user-a', Date.parse('2026-09-28T10:00:00.000Z')).draft?.formId).toBe('sample');
  });

  it('does not show one user the draft of another', async () => {
    const { store, now, say } = session();
    await say('user-a', 'начать бланк');
    const other = await say('user-b', 'Анна');
    expect(other.handled).toBe(false);
    expect(store.peek('user-b', now).draft).toBeNull();
    expect(store.peek('user-a', now).draft?.userId).toBe('user-a');
    expect(store.peek('user-a', now).draft?.values.name).toBeUndefined();
  });

  it('drops an expired draft and lets that message through to chat', async () => {
    const { store, now, say } = session();
    await say('user-a', 'начать бланк');
    const stillAlive = await say('user-a', 'Анна', now + FORM_DRAFT_TTL_MS - 1);
    expect(stillAlive.handled).toBe(true);

    const expired = await say('user-a', 'начать бланк', now + FORM_DRAFT_TTL_MS - 1 + FORM_DRAFT_TTL_MS);
    expect(expired).toEqual({ handled: false });
    expect(store.peek('user-a', now + FORM_DRAFT_TTL_MS - 1 + FORM_DRAFT_TTL_MS).draft).toBeNull();
  });

  it('keeps the active form ahead of another trigger', async () => {
    const { store, now, say } = session();
    await say('user-a', 'начать бланк');
    const next = await say('user-a', 'другой бланк');
    expect(next.handled).toBe(true);
    expect(store.peek('user-a', now).draft?.formId).toBe('sample');
    expect(store.peek('user-a', now).draft?.values.name).toBe('другой бланк');
  });

  it('does not start a form without permission', async () => {
    const { store, now, say } = session();
    const result = await handleFormTurn(
      { userId: 'user-a', text: 'начать бланк', access: denied, now },
      {
        store,
        registry: createFormRegistry([sampleForm(async () => ({ ok: true, text: 'Сохранено.' }))]),
        services,
      },
    );
    expect(result).toEqual({ handled: false });
    expect(store.has('user-a')).toBe(false);
  });

  it('cancels the draft', async () => {
    const { store, now, say } = session();
    await say('user-a', 'начать бланк');
    const cancelled = await say('user-a', 'Отмена');
    expect(cancelled).toEqual({ handled: true, text: 'Заполнение отменено.' });
    expect(store.peek('user-a', now).draft).toBeNull();
    expect(await say('user-a', 'привет')).toEqual({ handled: false });
  });

  it('steps back to the last answer and stops on the first step', async () => {
    const { say } = session();
    await say('user-a', 'начать бланк');
    const nowhere = await say('user-a', 'Назад');
    expect(nowhere.handled).toBe(true);
    if (nowhere.handled) expect(nowhere.text).toBe('Возвращаться некуда.');

    await say('user-a', 'Анна');
    const back = await say('user-a', 'Назад');
    expect(back.handled).toBe(true);
    if (back.handled) expect(back.text).toContain('Как вас зовут?');
  });

  it('skips only an optional step', async () => {
    const { store, now, say } = session();
    await say('user-a', 'начать бланк');
    const required = await say('user-a', 'Пропустить');
    expect(required.handled).toBe(true);
    if (required.handled) expect(required.text).toContain('обязательный');
    expect(store.peek('user-a', now).draft?.values.name).toBeUndefined();

    await say('user-a', 'Анна');
    const skipped = await say('user-a', 'Пропустить');
    expect(skipped.handled).toBe(true);
    if (skipped.handled) expect(skipped.text).toContain('Сохранить?');
    expect(store.peek('user-a', now).draft?.values.note).toBe('');
  });

  it('rejects an answer that is too long', async () => {
    const { store, now, say } = session();
    await say('user-a', 'начать бланк');
    const huge = 'а'.repeat(501);
    const result = await say('user-a', huge);
    expect(result.handled).toBe(true);
    if (result.handled) expect(result.text).toContain('Слишком длинный');
    expect(store.peek('user-a', now).draft?.values.name).toBeUndefined();
  });

  it('writes once when confirmation is sent twice at the same time', async () => {
    let calls = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { say } = session(async () => {
      calls += 1;
      await gate;
      return { ok: true, text: 'Сохранено.' };
    });
    await say('user-a', 'начать бланк');
    await say('user-a', 'Анна');
    await say('user-a', 'Пропустить');

    const first = say('user-a', 'Да');
    const second = say('user-a', 'Да');
    await Promise.resolve();
    release();
    const [left, right] = await Promise.all([first, second]);

    expect(calls).toBe(1);
    expect([left, right].filter((result) => result.handled)).toHaveLength(2);
    expect([left, right].some((result) => result.handled && result.text === 'Сохранено.')).toBe(true);
    expect([left, right].some((result) => result.handled && result.text === 'Запись уже выполняется.')).toBe(true);
  });

  it('keeps the draft when saving fails and answers inside the form without a model', async () => {
    let calls = 0;
    const { store, now, say } = session(async () => {
      calls += 1;
      return { ok: false, text: 'Журнал временно недоступен.' };
    });
    await say('user-a', 'начать бланк');
    const question = await say('user-a', 'когда было последнее обслуживание');
    expect(question.handled).toBe(true);
    expect(store.peek('user-a', now).draft?.formId).toBe('sample');
    await say('user-a', 'Отмена');

    await say('user-a', 'начать бланк');
    await say('user-a', 'Анна');
    await say('user-a', 'Пропустить');
    const failed = await say('user-a', 'Да');
    expect(failed.handled).toBe(true);
    if (failed.handled) expect(failed.text).toContain('Журнал временно недоступен');
    expect(store.peek('user-a', now).draft?.awaitingConfirmation).toBe(true);
    expect(calls).toBe(1);
  });
});
