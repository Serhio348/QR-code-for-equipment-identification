/**
 * form.test.ts
 *
 * Бланк анализа воды без Supabase и без модели.
 */

import { describe, expect, it } from 'vitest';
import type { UserAppAccess } from '../../userAppAccessService.js';
import { createDraftStore } from '../draftStore.js';
import { handleFormTurn } from '../engine.js';
import { createFormRegistry } from '../registry.js';
import type { FormEngineResult, FormServices, SamplingPointRecord, WaterAnalysisWriteInput } from '../types.js';
import { waterQualityForm } from './form.js';

const NOW = Date.parse('2026-09-28T10:00:00.000Z');
const allowed: UserAppAccess = { equipment: false, water: true, isAdmin: false };
const denied: UserAppAccess = { equipment: true, water: false, isAdmin: false };
const points: SamplingPointRecord[] = [
  { id: 'p1', name: 'Скважина 1', code: 'SKV-1' },
  { id: 'p2', name: 'Скважина 2', code: 'SKV-2' },
];

function textOf(result: FormEngineResult): string {
  return result.handled ? result.text : '';
}

function setup(access: UserAppAccess = allowed) {
  const store = createDraftStore();
  const writes: WaterAnalysisWriteInput[] = [];
  const services: FormServices = {
    listEquipment: async () => [],
    getEquipment: async () => null,
    listSamplingPoints: async () => points,
    addMaintenanceEntry: async () => {
      throw new Error('журнал здесь не записывается');
    },
    addWaterAnalysis: async (input) => {
      writes.push(input);
    },
  };
  const say = (text: string): Promise<FormEngineResult> => handleFormTurn(
    { userId: 'user-a', text, access, now: NOW },
    { store, registry: createFormRegistry([waterQualityForm]), services },
  );
  return { store, writes, say };
}

describe('water quality form', () => {
  it('walks the analysis and saves the entered parameter', async () => {
    const { store, writes, say } = setup();
    expect(textOf(await say('создай анализ'))).toContain('Точка отбора');
    await say('Скважина 1');
    await say('сегодня');
    await say('Иванов');
    await say('Пропустить');
    const measured = await say('железо 0.2');
    expect(textOf(measured)).toContain('Дальше');
    expect(store.peek('user-a', NOW).draft?.values['param:iron']).toBe('0.2');
    expect(store.peek('user-a', NOW).draft?.values.parametersDone).toBeUndefined();

    await say('Дальше');
    const card = await say('Пропустить');
    expect(textOf(card)).toContain('Скважина 1');
    expect(textOf(card)).toContain('2026-09-28');
    expect(textOf(card)).toContain('Иванов');
    expect(textOf(card)).toContain('выполнен');
    expect(textOf(card)).toContain('железо: 0.2 мг/л');
    expect(textOf(card)).not.toContain('Примечание:');

    const saved = await say('Да');
    expect(textOf(saved)).toContain('сохранён');
    expect(writes).toEqual([{
      sampling_point_id: 'p1',
      sample_date: '2026-09-28',
      sampled_by: 'Иванов',
      status: 'completed',
      notes: undefined,
      results: [{ parameter_name: 'iron', value: 0.2, unit: 'мг/л' }],
    }]);
    expect(store.has('user-a')).toBe(false);
  });

  it('takes several fields from one sentence', async () => {
    const { store, say } = setup();
    const next = await say('добавь анализ воды для Скважина 1, дата сегодня, отобрал Иванов, железо 0.3');
    const draft = store.peek('user-a', NOW).draft;
    expect(draft?.values.point).toBe('p1');
    expect(draft?.values.date).toBe('2026-09-28');
    expect(draft?.values.sampledBy).toBe('Иванов');
    expect(draft?.values['param:iron']).toBe('0.3');
    expect(textOf(next)).toContain('Статус');
  });

  it('rejects a parameter without a number and a non-numeric value', async () => {
    const { store, say } = setup();
    await say('создай анализ');
    await say('Скважина 1');
    await say('сегодня');
    await say('Иванов');
    await say('Пропустить');

    const missing = await say('железо');
    expect(textOf(missing)).toContain('число');
    expect(store.peek('user-a', NOW).draft?.values['param:iron']).toBeUndefined();

    const letters = await say('железо abc');
    expect(textOf(letters)).toContain('число');
    expect(store.peek('user-a', NOW).draft?.values['param:iron']).toBeUndefined();
  });

  it('finishes an empty parameter list with Дальше and allows skipping the note', async () => {
    const { say } = setup();
    await say('создай анализ');
    await say('SKV-2');
    await say('2026-09-20');
    await say('Петров');
    await say('в работе');
    await say('Дальше');
    const card = await say('Пропустить');
    expect(textOf(card)).toContain('Скважина 2');
    expect(textOf(card)).toContain('в работе');
    expect(textOf(card)).toContain('Показатели: не указаны');
    expect(textOf(card)).not.toContain('Примечание:');
  });

  it('does not accept an unknown or ambiguous sampling point', async () => {
    const { store, say } = setup();
    await say('создай анализ воды');
    const unknown = await say('Река');
    expect(textOf(unknown)).toContain('нет в доступном списке');
    expect(store.peek('user-a', NOW).draft?.values.point).toBeUndefined();

    const ambiguous = await say('скважина');
    expect(textOf(ambiguous)).toContain('Скважина 1');
    expect(textOf(ambiguous)).toContain('Скважина 2');
    expect(store.peek('user-a', NOW).draft?.values.point).toBeUndefined();
  });

  it('does not start without water permission and ignores consumption questions', async () => {
    const blocked = setup(denied);
    expect(await blocked.say('создай анализ')).toEqual({ handled: false });
    expect(await blocked.say('добавь анализ воды')).toEqual({ handled: false });

    const { say } = setup();
    expect(await say('создай анализ потребления')).toEqual({ handled: false });
    expect(await say('покажи последний анализ')).toEqual({ handled: false });
  });

  it('edits one field and keeps the parameter already entered', async () => {
    const { store, writes, say } = setup();
    await say('создай анализ');
    await say('Скважина 1');
    await say('сегодня');
    await say('Иванов');
    await say('Пропустить');
    await say('железо 0,2');
    await say('Дальше');
    await say('мутность небольшая');
    const card = textOf(await say('Редактировать'));
    expect(card).toContain('Что изменить?');
    await say('точку');
    const updated = await say('Скважина 2');
    expect(textOf(updated)).toContain('Скважина 2');
    expect(textOf(updated)).toContain('железо: 0.2 мг/л');
    expect(textOf(updated)).toContain('мутность небольшая');
    expect(textOf(updated)).toContain('Иванов');

    const declined = await say('Нет');
    expect(textOf(declined)).toContain('не сохранена');
    expect(writes).toHaveLength(0);
    expect(store.has('user-a')).toBe(false);
  });
});
