/**
 * form.test.ts
 *
 * Бланк журнала обслуживания без GAS и без модели.
 */

import { describe, expect, it } from 'vitest';
import type { EquipmentContext } from '../../types.js';
import type { UserAppAccess } from '../../userAppAccessService.js';
import { createDraftStore } from '../draftStore.js';
import { handleFormTurn } from '../engine.js';
import { createFormRegistry } from '../registry.js';
import type { EquipmentRecord, FormEngineResult, FormServices, MaintenanceWriteInput } from '../types.js';
import { maintenanceForm } from './form.js';

const NOW = Date.parse('2026-09-28T10:00:00.000Z');
const allowed: UserAppAccess = { equipment: true, water: false, isAdmin: false };
const denied: UserAppAccess = { equipment: false, water: true, isAdmin: false };
const pumps: EquipmentRecord[] = [
  { id: 'eq-1', name: 'Насос №1', maintenanceSheetId: 'sheet-1' },
  { id: 'eq-2', name: 'Насос №2', maintenanceSheetId: 'sheet-2' },
  { id: 'eq-3', name: 'Насос №3', maintenanceSheetId: 'sheet-3' },
];

function textOf(result: FormEngineResult): string {
  return result.handled ? result.text : '';
}

function setup(access: UserAppAccess = allowed) {
  const store = createDraftStore();
  const writes: MaintenanceWriteInput[] = [];
  const services: FormServices = {
    listEquipment: async () => pumps,
    getEquipment: async (id) => pumps.find((item) => item.id === id) ?? null,
    listSamplingPoints: async () => [],
    addMaintenanceEntry: async (input) => {
      writes.push(input);
    },
    addWaterAnalysis: async () => {
      throw new Error('анализ здесь не записывается');
    },
  };
  const say = (text: string, equipmentContext?: EquipmentContext): Promise<FormEngineResult> => handleFormTurn(
    { userId: 'user-a', text, access, now: NOW, equipmentContext },
    { store, registry: createFormRegistry([maintenanceForm]), services },
  );
  return { store, writes, say };
}

async function fillToStatus(say: (text: string) => Promise<FormEngineResult>): Promise<void> {
  await say('заполни журнал обслуживания');
  await say('Насос №2');
  await say('сегодня');
  await say('ТО-1');
  await say('замена масла');
  await say('Иванов');
}

describe('maintenance form', () => {
  it('walks the journal and saves one completed entry', async () => {
    const { store, writes, say } = setup();
    await fillToStatus(say);
    const card = await say('Пропустить');
    expect(textOf(card)).toContain('Насос №2');
    expect(textOf(card)).toContain('2026-09-28');
    expect(textOf(card)).toContain('Техническое обслуживание');
    expect(textOf(card)).toContain('замена масла');
    expect(textOf(card)).toContain('Иванов');
    expect(textOf(card)).toContain('выполнено');
    expect(card.handled && card.suggestions).toEqual(['Да', 'Нет', 'Редактировать']);

    const saved = await say('Да');
    expect(textOf(saved)).toContain('сохранена');
    expect(writes).toEqual([{
      equipment_id: 'eq-2',
      date: '2026-09-28',
      type: 'Техническое обслуживание',
      description: 'замена масла',
      performed_by: 'Иванов',
      status: 'completed',
      maintenance_sheet_id: 'sheet-2',
    }]);
    expect(store.has('user-a')).toBe(false);
  });

  it('fills several fields from the opening sentence and defaults a skipped status', async () => {
    const { store, say } = setup();
    const next = await say('Заполни журнал обслуживания для Насоса №2: дата сегодня, ТО-1, замена масла, выполнил Иванов');
    const draft = store.peek('user-a', NOW).draft;
    expect(draft?.values.equipment).toBe('eq-2');
    expect(draft?.values.date).toBe('2026-09-28');
    expect(draft?.values.type).toBe('Техническое обслуживание');
    expect(draft?.values.description).toBe('замена масла');
    expect(draft?.values.performedBy).toBe('Иванов');
    expect(textOf(next)).toContain('Статус');

    const card = await say('Пропустить');
    expect(store.peek('user-a', NOW).draft?.values.status).toBe('completed');
    expect(textOf(card)).toContain('выполнено');
    expect(textOf(card)).toContain('замена масла');
  });

  it('rejects a bad date, a future date and an unknown work type', async () => {
    const { store, say } = setup();
    await say('заполни журнал обслуживания');
    await say('Насос №2');
    const bad = await say('2026-02-31');
    expect(textOf(bad)).toContain('Неверная дата');
    expect(store.peek('user-a', NOW).draft?.values.date).toBeUndefined();

    const future = await say('2026-09-29');
    expect(textOf(future)).toContain('будущ');
    expect(store.peek('user-a', NOW).draft?.values.date).toBeUndefined();

    await say('сегодня');
    const wrongType = await say('покраска');
    expect(textOf(wrongType)).toContain('тип');
    expect(store.peek('user-a', NOW).draft?.values.type).toBeUndefined();
  });

  it('does not accept unknown or ambiguous equipment, including a foreign id', async () => {
    const { store, say } = setup();
    await say('добавь в журнал обслуживания');
    const unknown = await say('Котельная');
    expect(textOf(unknown)).toContain('нет в доступном списке');
    expect(store.peek('user-a', NOW).draft?.values.equipment).toBeUndefined();

    const foreignId = await say('11111111-1111-4111-8111-111111111111');
    expect(textOf(foreignId)).toContain('нет в доступном списке');

    const ambiguous = await say('насос');
    expect(textOf(ambiguous)).toContain('Насос №1');
    expect(textOf(ambiguous)).toContain('Насос №2');
    expect(textOf(ambiguous)).toContain('Насос №3');
    expect(store.peek('user-a', NOW).draft?.values.equipment).toBeUndefined();
  });

  it('does not start without maintenance permission and ignores read questions', async () => {
    const blocked = setup(denied);
    expect(await blocked.say('заполни журнал обслуживания')).toEqual({ handled: false });
    expect(blocked.store.has('user-a')).toBe(false);

    const { say } = setup();
    expect(await say('когда было последнее обслуживание')).toEqual({ handled: false });
    expect(await say('покажи журнал обслуживания')).toEqual({ handled: false });
  });

  it('uses the open equipment card only when the server knows that id', async () => {
    const { store, say } = setup();
    const known = await say('заполни журнал обслуживания', {
      id: 'eq-2',
      name: 'Подмена',
      type: 'pump',
      maintenanceSheetId: 'sheet-2',
    });
    expect(textOf(known)).toContain('Дата');
    expect(store.peek('user-a', NOW).draft?.values).toMatchObject({
      equipment: 'eq-2',
      equipmentName: 'Насос №2',
    });

    const { say: askUnknown } = setup();
    const unknown = await askUnknown('заполни журнал обслуживания', {
      id: 'missing',
      name: 'Подмена',
      type: 'pump',
    });
    expect(textOf(unknown)).toContain('Какое оборудование');
  });

  it('discards the draft on Нет and keeps the other fields after a date edit', async () => {
    const { store, writes, say } = setup();
    await say('Заполни журнал обслуживания для Насоса №2: дата сегодня, ТО-1, замена масла, выполнил Иванов');
    await say('Пропустить');
    const declined = await say('Нет');
    expect(textOf(declined)).toContain('не сохранена');
    expect(writes).toHaveLength(0);
    expect(store.has('user-a')).toBe(false);

    const again = setup();
    await again.say('Заполни журнал обслуживания для Насоса №2: дата сегодня, ТО-1, замена масла, выполнил Иванов');
    await again.say('Пропустить');
    const menu = await again.say('Редактировать');
    expect(textOf(menu)).toContain('Что изменить?');
    await again.say('дату');
    const card = await again.say('2026-09-01');
    expect(textOf(card)).toContain('2026-09-01');
    expect(textOf(card)).toContain('замена масла');
    expect(textOf(card)).toContain('Иванов');
    expect(textOf(card)).toContain('Насос №2');
    expect(again.store.peek('user-a', NOW).draft?.values.type).toBe('Техническое обслуживание');
  });

  it('opens the date step directly from «изменить дату»', async () => {
    const { say } = setup();
    await say('Заполни журнал обслуживания для Насоса №2: дата сегодня, ТО-1, замена масла, выполнил Иванов');
    await say('Пропустить');
    const date = await say('Изменить дату');
    expect(textOf(date)).toContain('Дата');
    const card = await say('2026-09-27');
    expect(textOf(card)).toContain('2026-09-27');
    expect(textOf(card)).toContain('замена масла');
  });
});
