/**
 * form.ts
 *
 * Бланк «Журнал обслуживания».
 * Запись идёт через существующий add_maintenance_entry.
 */

import { isToolAllowedForAccess } from '../../toolAccessPolicy.js';
import { applyAccepted, trackValue } from '../engine.js';
import {
  cutPrefix,
  matchCatalog,
  matchTriggerPhrase,
  normalizeUtterance,
  parseFormDate,
  splitClauses,
  utcToday,
  type CatalogEntry,
} from '../parse.js';
import type {
  AcceptedValue,
  EquipmentRecord,
  FormDefinition,
  FormDraft,
  FormPrompt,
  StepDecision,
} from '../types.js';

const TRIGGERS = [
  'добавь запись в журнал обслуживания',
  'добавить запись в журнал обслуживания',
  'заполни журнал обслуживания',
  'заполнить журнал обслуживания',
  'добавь в журнал обслуживания',
  'добавить в журнал обслуживания',
  'внеси в журнал обслуживания',
  'запиши в журнал обслуживания',
  'заполни журнал',
  'добавь в журнал',
];

const WORK_TYPES: Array<{ value: string; phrases: string[] }> = [
  { value: 'Техническое обслуживание', phrases: ['то', 'то-1', 'то1', 'т о', 'техническое обслуживание', 'техобслуживание'] },
  { value: 'Ремонт', phrases: ['ремонт'] },
  { value: 'Осмотр', phrases: ['осмотр'] },
  { value: 'Замена', phrases: ['замена'] },
];

const STATUSES: Array<{ value: string; label: string; phrases: string[] }> = [
  { value: 'completed', label: 'выполнено', phrases: ['выполнено', 'выполнен', 'completed'] },
  { value: 'planned', label: 'запланировано', phrases: ['запланировано', 'planned'] },
  { value: 'in_progress', label: 'в процессе', phrases: ['в процессе', 'в работе', 'in_progress'] },
];

const TYPE_SUGGESTIONS = WORK_TYPES.map((item) => item.value);
const STATUS_SUGGESTIONS = ['Выполнено', 'Запланировано', 'В процессе', 'Пропустить'];

function equipmentEntries(list: EquipmentRecord[]): CatalogEntry[] {
  return list.map((item) => ({ id: item.id, label: item.name }));
}

function byId(list: EquipmentRecord[], id: string): EquipmentRecord | undefined {
  return list.find((item) => item.id === id);
}

function equipmentValues(item: EquipmentRecord, sheetId?: string): AcceptedValue[] {
  return [
    { key: 'equipment', value: item.id, undoable: true },
    { key: 'equipmentName', value: item.name, undoable: false },
    { key: 'maintenanceSheetId', value: item.maintenanceSheetId || sheetId || '', undoable: false },
  ];
}

function clearEquipment(draft: FormDraft): void {
  delete draft.values.equipment;
  delete draft.values.equipmentName;
  delete draft.values.maintenanceSheetId;
  draft.filledOrder = draft.filledOrder.filter((key) => key !== 'equipment');
}

function matchType(text: string): string | null {
  const normalized = normalizeUtterance(text);
  return WORK_TYPES.find((item) => item.phrases.includes(normalized))?.value ?? null;
}

function matchStatus(text: string): string | null {
  const normalized = normalizeUtterance(text);
  return STATUSES.find((item) => item.phrases.includes(normalized))?.value ?? null;
}

function statusLabel(value: string | undefined): string {
  return STATUSES.find((item) => item.value === value)?.label ?? 'выполнено';
}

function choicePrompt(entries: CatalogEntry[]): FormPrompt {
  const names = entries.map((entry) => entry.label);
  return {
    text: `Найдено несколько: ${names.join(', ')}. Укажите точнее.`,
    suggestions: names.slice(0, 8),
  };
}

function remember(
  draft: FormDraft,
  values: AcceptedValue[],
  key: string,
  value: string,
  overwrite = false,
): void {
  if (!overwrite && (draft.values[key] !== undefined || values.some((item) => item.key === key))) return;
  values.push({ key, value, undoable: key !== 'maintenanceSheetId' && key !== 'equipmentName' });
  if (key === 'equipment') {
    const name = values.find((item) => item.key === 'equipmentName');
    const sheet = values.find((item) => item.key === 'maintenanceSheetId');
    if (!name || !sheet) return;
  }
}

type ClauseKind =
  | { kind: 'equipment'; item: EquipmentRecord }
  | { kind: 'ambiguous'; entries: CatalogEntry[] }
  | { kind: 'unknown-equipment' }
  | { kind: 'date'; iso: string }
  | { kind: 'bad-date' }
  | { kind: 'future-date' }
  | { kind: 'type'; value: string }
  | { kind: 'bad-type' }
  | { kind: 'status'; value: string }
  | { kind: 'bad-status' }
  | { kind: 'performer'; value: string }
  | { kind: 'description'; value: string }
  | { kind: 'free'; value: string };

function classifyClause(
  clause: string,
  list: EquipmentRecord[],
  draft: FormDraft,
  now: number,
): ClauseKind {
  const performer = cutPrefix(clause, ['кто выполнил', 'выполнил', 'исполнитель']);
  if (performer !== null) return { kind: 'performer', value: performer };

  const described = cutPrefix(clause, ['что сделано', 'описание']);
  if (described !== null) return { kind: 'description', value: described };

  const dated = cutPrefix(clause, ['дата']);
  if (dated !== null) return classifyDate(dated || clause, draft, now);

  const typed = cutPrefix(clause, ['тип']);
  if (typed !== null) {
    const value = matchType(typed);
    return value ? { kind: 'type', value } : { kind: 'bad-type' };
  }

  const statusText = cutPrefix(clause, ['статус']);
  if (statusText !== null) {
    const value = matchStatus(statusText);
    return value ? { kind: 'status', value } : { kind: 'bad-status' };
  }

  const named = cutPrefix(clause, ['оборудование', 'для']);
  if (named !== null) return classifyEquipment(named || clause, list);

  const asType = matchType(clause);
  if (asType) return { kind: 'type', value: asType };
  const asDate = classifyDate(clause, draft, now);
  if (asDate.kind === 'date' || asDate.kind === 'future-date' || normalizeUtterance(clause) === 'сегодня') return asDate;
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizeUtterance(clause))) return asDate;
  const asStatus = matchStatus(clause);
  if (asStatus) return { kind: 'status', value: asStatus };

  const equipment = classifyEquipment(clause, list);
  if (equipment.kind === 'equipment' || equipment.kind === 'ambiguous') return equipment;
  return { kind: 'free', value: clause.trim() };
}

function classifyDate(text: string, draft: FormDraft, now: number): ClauseKind {
  const iso = parseFormDate(text, utcToday(now));
  if (!iso) return { kind: 'bad-date' };
  const status = draft.values.status || 'completed';
  if (status === 'completed' && iso > utcToday(now)) return { kind: 'future-date' };
  return { kind: 'date', iso };
}

function classifyEquipment(text: string, list: EquipmentRecord[]): ClauseKind {
  const matched = matchCatalog(text, equipmentEntries(list));
  if (matched.status === 'many') return { kind: 'ambiguous', entries: matched.entries };
  if (matched.status === 'none') return { kind: 'unknown-equipment' };
  const item = byId(list, matched.entry.id);
  return item ? { kind: 'equipment', item } : { kind: 'unknown-equipment' };
}

function invalid(message: string, suggestions?: string[]): StepDecision {
  return { type: 'invalid', message, suggestions };
}

function interpretCurrent(
  text: string,
  draft: FormDraft,
  list: EquipmentRecord[],
  now: number,
): StepDecision {
  const stepId = draft.currentStep || 'equipment';
  if (stepId === 'equipment') {
    const found = classifyEquipment(cutPrefix(text, ['оборудование', 'для']) ?? text, list);
    if (found.kind === 'ambiguous') {
      return { type: 'partial', values: [], clear: ['equipment', 'equipmentName', 'maintenanceSheetId'], stepId, prompt: choicePrompt(found.entries) };
    }
    if (found.kind !== 'equipment') {
      return invalid('Такого оборудования нет в доступном списке. Укажите название или номер.');
    }
    return { type: 'ok', values: equipmentValues(found.item) };
  }
  if (stepId === 'date') {
    const found = classifyDate(text, draft, now);
    if (found.kind === 'future-date') return invalid('Дата выполненных работ не может быть в будущем.', ['Сегодня']);
    if (found.kind !== 'date') return invalid('Неверная дата. Укажите «сегодня» или дату в формате ГГГГ-ММ-ДД.', ['Сегодня']);
    return { type: 'ok', values: [{ key: 'date', value: found.iso, undoable: true }] };
  }
  if (stepId === 'type') {
    const value = matchType(cutPrefix(text, ['тип']) ?? text);
    if (!value) return invalid('Укажите тип: техническое обслуживание, ремонт, осмотр или замена.', TYPE_SUGGESTIONS);
    return { type: 'ok', values: [{ key: 'type', value, undoable: true }] };
  }
  if (stepId === 'status') {
    const value = matchStatus(cutPrefix(text, ['статус']) ?? text);
    if (!value) return invalid('Укажите статус: выполнено, запланировано или в процессе.', STATUS_SUGGESTIONS);
    return { type: 'ok', values: [{ key: 'status', value, undoable: true }] };
  }
  if (stepId === 'description') {
    const value = (cutPrefix(text, ['что сделано', 'описание']) ?? text).trim();
    if (!value) return invalid('Опишите, что сделано.');
    return { type: 'ok', values: [{ key: 'description', value, undoable: true }] };
  }
  const value = (cutPrefix(text, ['кто выполнил', 'выполнил', 'исполнитель']) ?? text).trim();
  if (!value) return invalid('Укажите, кто выполнил работу.');
  return { type: 'ok', values: [{ key: 'performedBy', value, undoable: true }] };
}

function interpretMany(
  clauses: string[],
  draft: FormDraft,
  list: EquipmentRecord[],
  now: number,
): StepDecision {
  const values: AcceptedValue[] = [];
  const free: string[] = [];
  let ambiguous: CatalogEntry[] | null = null;
  let problem: StepDecision | null = null;

  for (const clause of clauses) {
    const found = classifyClause(clause, list, draft, now);
    if (found.kind === 'equipment') {
      if (draft.values.equipment === undefined || cutPrefix(clause, ['оборудование', 'для']) !== null || values.every((item) => item.key !== 'equipment')) {
        values.push(...equipmentValues(found.item));
      }
      continue;
    }
    if (found.kind === 'ambiguous') {
      ambiguous = found.entries;
      continue;
    }
    if (found.kind === 'unknown-equipment' && cutPrefix(clause, ['оборудование', 'для']) !== null) {
      problem = invalid('Такого оборудования нет в доступном списке. Укажите название или номер.');
      continue;
    }
    if (found.kind === 'date') {
      remember(draft, values, 'date', found.iso);
      continue;
    }
    if (found.kind === 'future-date') {
      problem = invalid('Дата выполненных работ не может быть в будущем.', ['Сегодня']);
      continue;
    }
    if (found.kind === 'bad-date' && cutPrefix(clause, ['дата']) !== null) {
      problem = invalid('Неверная дата. Укажите «сегодня» или дату в формате ГГГГ-ММ-ДД.', ['Сегодня']);
      continue;
    }
    if (found.kind === 'type') {
      remember(draft, values, 'type', found.value);
      continue;
    }
    if (found.kind === 'bad-type') {
      problem = invalid('Укажите тип: техническое обслуживание, ремонт, осмотр или замена.', TYPE_SUGGESTIONS);
      continue;
    }
    if (found.kind === 'status') {
      remember(draft, values, 'status', found.value);
      continue;
    }
    if (found.kind === 'performer' && found.value) {
      remember(draft, values, 'performedBy', found.value);
      continue;
    }
    if (found.kind === 'description' && found.value) {
      remember(draft, values, 'description', found.value);
      continue;
    }
    if (found.kind === 'free') free.push(found.value);
  }

  if (free.length > 0 && draft.values.description === undefined && !values.some((item) => item.key === 'description')) {
    values.push({ key: 'description', value: free.join(', '), undoable: true });
  }

  if (ambiguous) {
    return {
      type: 'partial',
      values: values.filter((item) => item.key !== 'equipment' && item.key !== 'equipmentName' && item.key !== 'maintenanceSheetId'),
      clear: ['equipment', 'equipmentName', 'maintenanceSheetId'],
      stepId: 'equipment',
      prompt: choicePrompt(ambiguous),
    };
  }
  if (problem && values.length === 0) return problem;
  if (values.length === 0) return interpretCurrent(clauses.join(', '), draft, list, now);
  return { type: 'ok', values };
}

export const maintenanceForm: FormDefinition = {
  id: 'maintenance',
  matchTrigger: (text) => matchTriggerPhrase(text, TRIGGERS),
  isAllowed: (access) => isToolAllowedForAccess('add_maintenance_entry', access),
  steps: [
    {
      id: 'equipment',
      label: 'Оборудование',
      optional: false,
      editPhrases: ['оборудование'],
      prompt: () => ({ text: 'Какое оборудование? Укажите номер или название.' }),
      onClear: clearEquipment,
    },
    {
      id: 'date',
      label: 'Дата',
      optional: false,
      editPhrases: ['дату', 'дата'],
      prompt: () => ({ text: 'Дата работ? Можно написать «сегодня» или дату в формате ГГГГ-ММ-ДД.', suggestions: ['Сегодня'] }),
    },
    {
      id: 'type',
      label: 'Тип',
      optional: false,
      editPhrases: ['тип'],
      prompt: () => ({ text: 'Тип работ?', suggestions: TYPE_SUGGESTIONS }),
    },
    {
      id: 'description',
      label: 'Что сделано',
      optional: false,
      editPhrases: ['что сделано', 'описание'],
      prompt: () => ({ text: 'Что сделано?' }),
    },
    {
      id: 'performedBy',
      label: 'Кто выполнил',
      optional: false,
      editPhrases: ['кто выполнил', 'исполнитель', 'исполнителя'],
      prompt: () => ({ text: 'Кто выполнил?' }),
    },
    {
      id: 'status',
      label: 'Статус',
      optional: true,
      editPhrases: ['статус'],
      prompt: () => ({ text: 'Статус записи? Если пропустить, будет «выполнено».', suggestions: STATUS_SUGGESTIONS }),
      onSkip: () => [{ key: 'status', value: 'completed', undoable: true }],
    },
  ],
  async prepare(draft, runtime) {
    if (draft.values.equipment) return;
    const id = runtime.equipmentContext?.id?.trim();
    if (!id) return;
    try {
      const found = await runtime.services.getEquipment(id);
      if (!found) return;
      applyAccepted(draft, equipmentValues(found, runtime.equipmentContext?.maintenanceSheetId));
      trackValue(draft, 'equipment');
    } catch {
      return;
    }
  },
  async interpret(text, draft, runtime) {
    let list: EquipmentRecord[] = [];
    try {
      list = await runtime.services.listEquipment();
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'список недоступен';
      return invalid(`Не удалось получить список оборудования: ${detail}`);
    }
    const clauses = splitClauses(text);
    const explicit = clauses.some((clause) => (
      cutPrefix(clause, ['дата', 'тип', 'статус', 'для', 'оборудование', 'что сделано', 'описание', 'выполнил', 'кто выполнил', 'исполнитель']) !== null
    ));
    if (clauses.length > 1 || explicit) return interpretMany(clauses, draft, list, runtime.now);
    return interpretCurrent(text, draft, list, runtime.now);
  },
  confirmation(draft) {
    return {
      text: [
        'Проверьте данные:',
        '',
        `Оборудование: ${draft.values.equipmentName ?? ''}`,
        `Дата: ${draft.values.date ?? ''}`,
        `Тип: ${draft.values.type ?? ''}`,
        `Что сделано: ${draft.values.description ?? ''}`,
        `Исполнитель: ${draft.values.performedBy ?? ''}`,
        `Статус: ${statusLabel(draft.values.status)}`,
        '',
        'Сохранить?',
      ].join('\n'),
      suggestions: ['Да', 'Нет', 'Редактировать'],
    };
  },
  async submit(draft, runtime) {
    const equipmentId = draft.values.equipment;
    if (!equipmentId || !draft.values.date || !draft.values.type || !draft.values.description || !draft.values.performedBy) {
      return { ok: false, text: 'В бланке не хватает данных. Ответьте «Редактировать» и заполните пустой пункт.' };
    }
    try {
      const equipment = await runtime.services.getEquipment(equipmentId);
      if (!equipment || equipment.id !== equipmentId) {
        return { ok: false, text: 'Оборудование недоступно. Выберите его снова и ответьте «Да».' };
      }
      const sheet = draft.values.maintenanceSheetId || equipment.maintenanceSheetId;
      await runtime.services.addMaintenanceEntry({
        equipment_id: equipment.id,
        date: draft.values.date,
        type: draft.values.type,
        description: draft.values.description,
        performed_by: draft.values.performedBy,
        status: draft.values.status || 'completed',
        maintenance_sheet_id: sheet || undefined,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Не удалось сохранить запись';
      return { ok: false, text: `Не удалось сохранить запись. ${detail}` };
    }
    return { ok: true, text: 'Запись в журнал обслуживания сохранена.' };
  },
};
