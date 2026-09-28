/**
 * form.ts
 *
 * Бланк «Анализ воды».
 * Запись идёт через существующий add_water_quality_analysis.
 */

import { isToolAllowedForAccess } from '../../toolAccessPolicy.js';
import {
  cutPrefix,
  matchCatalog,
  matchTriggerPhrase,
  minskToday,
  normalizeUtterance,
  parseFormDate,
  splitClauses,
  type CatalogEntry,
} from '../parse.js';
import type {
  AcceptedValue,
  FormDefinition,
  FormDraft,
  FormPrompt,
  SamplingPointRecord,
  StepDecision,
} from '../types.js';

const TRIGGERS = [
  'добавь анализ воды',
  'добавить анализ воды',
  'заполни анализ воды',
  'заполнить анализ воды',
  'создай анализ воды',
  'создать анализ воды',
  'новый анализ воды',
  'создай анализ',
  'создать анализ',
];

const PARAMETERS: Array<{ id: string; title: string; unit: string; phrases: string[] }> = [
  { id: 'iron', title: 'железо', unit: 'мг/л', phrases: ['железо'] },
  { id: 'alkalinity', title: 'щёлочность', unit: 'мг-экв/л', phrases: ['щелочность'] },
  { id: 'hardness', title: 'жёсткость', unit: 'мг-экв/л', phrases: ['жесткость'] },
  { id: 'oxidizability', title: 'окисляемость', unit: 'мг O₂/л', phrases: ['окисляемость'] },
  { id: 'ph', title: 'pH', unit: 'pH', phrases: ['ph'] },
  { id: 'temperature', title: 'температура', unit: '°C', phrases: ['температура'] },
];

const WATER_STATUSES: Array<{ value: string; label: string; phrases: string[] }> = [
  { value: 'completed', label: 'выполнен', phrases: ['выполнен', 'выполнено', 'completed'] },
  { value: 'in_progress', label: 'в работе', phrases: ['в работе', 'in_progress'] },
];

const STATUS_SUGGESTIONS = ['Выполнен', 'В работе', 'Пропустить'];

function pointEntries(list: SamplingPointRecord[]): CatalogEntry[] {
  return list.map((point) => ({ id: point.id, label: point.name, extra: point.code }));
}

function pointValues(point: SamplingPointRecord): AcceptedValue[] {
  return [
    { key: 'point', value: point.id, undoable: true },
    { key: 'pointName', value: point.name, undoable: false },
  ];
}

function clearPoint(draft: FormDraft): void {
  delete draft.values.point;
  delete draft.values.pointName;
  draft.filledOrder = draft.filledOrder.filter((key) => key !== 'point');
}

function matchStatus(text: string): string | null {
  const normalized = normalizeUtterance(text);
  return WATER_STATUSES.find((item) => item.phrases.includes(normalized))?.value ?? null;
}

function statusLabel(value: string | undefined): string {
  return WATER_STATUSES.find((item) => item.value === value)?.label ?? 'выполнен';
}

function parseParameterClause(clause: string): { id: string; title: string; value?: number; missing: boolean } | null {
  const compact = clause
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/\s+/g, ' ');
  for (const parameter of PARAMETERS) {
    for (const phrase of parameter.phrases) {
      if (compact === phrase) return { id: parameter.id, title: parameter.title, missing: true };
      const match = compact.match(new RegExp(`^${phrase}\\s+(-?\\d+(?:\\.\\d+)?)\\s*$`, 'i'));
      if (!match) continue;
      const value = Number(match[1]);
      if (!Number.isFinite(value)) return { id: parameter.id, title: parameter.title, missing: true };
      return { id: parameter.id, title: parameter.title, value, missing: false };
    }
  }
  return null;
}

function choicePrompt(entries: CatalogEntry[]): FormPrompt {
  const names = entries.map((entry) => entry.label);
  return {
    text: `Найдено несколько точек: ${names.join(', ')}. Укажите точнее.`,
    suggestions: names.slice(0, 8),
  };
}

function parameterValue(id: string, draft: FormDraft, extra: AcceptedValue[] = []): string | undefined {
  const pending = [...extra].reverse().find((item) => item.key === `param:${id}`);
  return pending?.value ?? draft.values[`param:${id}`];
}

function parameterPrompt(draft: FormDraft, extra: AcceptedValue[] = []): FormPrompt {
  const entered = PARAMETERS.filter((item) => parameterValue(item.id, draft, extra) !== undefined);
  const next = PARAMETERS.find((item) => parameterValue(item.id, draft, extra) === undefined);
  const enteredText = entered.length > 0
    ? `Уже указано: ${entered.map((item) => `${item.title} ${parameterValue(item.id, draft, extra)}`).join(', ')}. `
    : '';
  if (!next) {
    return {
      text: `${enteredText}Показатели заполнены. Напишите «Дальше», чтобы продолжить.`,
      suggestions: ['Дальше'],
    };
  }
  return {
    text: `${enteredText}Укажите ${next.title} числом, например «${next.title} 0.2». Чтобы закончить показатели, напишите «Дальше».`,
    suggestions: ['Дальше'],
  };
}

function parameterValues(id: string, value: number): AcceptedValue[] {
  return [{ key: `param:${id}`, value: String(value), undoable: true }];
}

function remember(draft: FormDraft, values: AcceptedValue[], key: string, value: string): void {
  if (draft.values[key] !== undefined || values.some((item) => item.key === key)) return;
  values.push({ key, value, undoable: true });
}

function interpretPoint(text: string, list: SamplingPointRecord[]): StepDecision {
  const named = cutPrefix(text, ['точка отбора', 'точка', 'для']) ?? text;
  const matched = matchCatalog(named, pointEntries(list));
  if (matched.status === 'many') {
    return {
      type: 'partial',
      values: [],
      clear: ['point', 'pointName'],
      stepId: 'point',
      prompt: choicePrompt(matched.entries),
    };
  }
  if (matched.status === 'none') {
    return { type: 'invalid', message: 'Такой точки отбора нет в доступном списке. Укажите название из списка.' };
  }
  const point = list.find((item) => item.id === matched.entry.id);
  if (!point) {
    return { type: 'invalid', message: 'Такой точки отбора нет в доступном списке. Укажите название из списка.' };
  }
  return { type: 'ok', values: pointValues(point) };
}

function interpretParameters(text: string, draft: FormDraft): StepDecision {
  const clauses = splitClauses(text);
  const values: AcceptedValue[] = [];
  for (const clause of clauses) {
    const parsed = parseParameterClause(clause);
    if (parsed?.missing) {
      return {
        type: 'partial',
        values,
        stepId: 'parameters',
        prompt: {
          text: `Укажите число для показателя «${parsed.title}».`,
          suggestions: ['Дальше'],
        },
      };
    }
    if (parsed && parsed.value !== undefined) {
      values.push(...parameterValues(parsed.id, parsed.value));
      continue;
    }
    const number = clause
      .trim()
      .replace(/(\d),(\d)/g, '$1.$2')
      .match(/^-?\d+(?:\.\d+)?$/);
    if (number) {
      const next = PARAMETERS.find((item) => parameterValue(item.id, draft, values) === undefined);
      if (!next) {
        return { type: 'invalid', message: 'Все показатели уже указаны. Напишите «Дальше».', suggestions: ['Дальше'] };
      }
      values.push(...parameterValues(next.id, Number(number[0])));
      continue;
    }
    return {
      type: 'invalid',
      message: 'Нужно числовое значение показателя, например «железо 0.2».',
      suggestions: ['Дальше'],
    };
  }
  if (values.length === 0) {
    return { type: 'invalid', message: 'Нужно числовое значение показателя, например «железо 0.2».', suggestions: ['Дальше'] };
  }
  return { type: 'ok', values };
}

function interpretCurrent(text: string, draft: FormDraft, list: SamplingPointRecord[], now: number): StepDecision {
  const stepId = draft.currentStep || 'point';
  if (stepId === 'point') return interpretPoint(text, list);
  if (stepId === 'date') {
    const iso = parseFormDate(cutPrefix(text, ['дата пробы', 'дата']) ?? text, minskToday(now));
    if (!iso) return { type: 'invalid', message: 'Неверная дата пробы. Укажите «сегодня» или дату в формате ГГГГ-ММ-ДД.', suggestions: ['Сегодня'] };
    return { type: 'ok', values: [{ key: 'date', value: iso, undoable: true }] };
  }
  if (stepId === 'sampledBy') {
    const value = (cutPrefix(text, ['кто отобрал', 'пробу отобрал', 'отобрал']) ?? text).trim();
    if (!value) return { type: 'invalid', message: 'Укажите, кто отобрал пробу.' };
    return { type: 'ok', values: [{ key: 'sampledBy', value, undoable: true }] };
  }
  if (stepId === 'status') {
    const value = matchStatus(cutPrefix(text, ['статус']) ?? text);
    if (!value) return { type: 'invalid', message: 'Укажите статус: выполнен или в работе.', STATUS_SUGGESTIONS };
    return { type: 'ok', values: [{ key: 'status', value, undoable: true }] };
  }
  if (stepId === 'parameters') return interpretParameters(text, draft);
  const notes = (cutPrefix(text, ['примечание']) ?? text).trim();
  return { type: 'ok', values: [{ key: 'notes', value: notes, undoable: true }] };
}

function interpretMany(text: string, draft: FormDraft, list: SamplingPointRecord[], now: number): StepDecision {
  const values: AcceptedValue[] = [];
  let ambiguous: CatalogEntry[] | null = null;
  let missingParameter: string | null = null;

  for (const clause of splitClauses(text)) {
    const performer = cutPrefix(clause, ['кто отобрал', 'пробу отобрал', 'отобрал']);
    if (performer !== null && performer) {
      remember(draft, values, 'sampledBy', performer);
      continue;
    }
    const noted = cutPrefix(clause, ['примечание']);
    if (noted !== null) {
      remember(draft, values, 'notes', noted);
      continue;
    }
    const dated = cutPrefix(clause, ['дата пробы', 'дата']);
    if (dated !== null || normalizeUtterance(clause) === 'сегодня' || /^\d{4}-\d{2}-\d{2}$/.test(normalizeUtterance(clause))) {
      const iso = parseFormDate(dated ?? clause, minskToday(now));
      if (!iso) return { type: 'invalid', message: 'Неверная дата пробы. Укажите «сегодня» или дату в формате ГГГГ-ММ-ДД.', suggestions: ['Сегодня'] };
      remember(draft, values, 'date', iso);
      continue;
    }
    const statusText = cutPrefix(clause, ['статус']);
    const status = matchStatus(statusText ?? clause);
    if (statusText !== null || status) {
      if (!status) return { type: 'invalid', message: 'Укажите статус: выполнен или в работе.', STATUS_SUGGESTIONS };
      remember(draft, values, 'status', status);
      continue;
    }
    const parameter = parseParameterClause(clause);
    if (parameter?.missing) {
      missingParameter = parameter.title;
      continue;
    }
    if (parameter && parameter.value !== undefined) {
      values.push(...parameterValues(parameter.id, parameter.value));
      continue;
    }
    const named = cutPrefix(clause, ['точка отбора', 'точка', 'для']) ?? clause;
    const matched = matchCatalog(named, pointEntries(list));
    if (matched.status === 'many') {
      ambiguous = matched.entries;
      continue;
    }
    if (matched.status === 'one') {
      const point = list.find((item) => item.id === matched.entry.id);
      if (point && draft.values.point === undefined && values.every((item) => item.key !== 'point')) {
        values.push(...pointValues(point));
      }
      continue;
    }
    if (cutPrefix(clause, ['точка отбора', 'точка', 'для']) !== null) {
      return { type: 'invalid', message: 'Такой точки отбора нет в доступном списке. Укажите название из списка.' };
    }
  }

  if (ambiguous) {
    return {
      type: 'partial',
      values: values.filter((item) => item.key !== 'point' && item.key !== 'pointName'),
      clear: ['point', 'pointName'],
      stepId: 'point',
      prompt: choicePrompt(ambiguous),
    };
  }
  if (missingParameter) {
    return {
      type: 'partial',
      values,
      stepId: draft.currentStep === 'parameters' ? 'parameters' : draft.currentStep,
      prompt: { text: `Укажите число для показателя «${missingParameter}».`, suggestions: ['Дальше'] },
    };
  }
  if (values.length === 0) return interpretCurrent(text, draft, list, now);
  return { type: 'ok', values };
}

function hasExplicitMarker(text: string): boolean {
  return splitClauses(text).some((clause) => (
    cutPrefix(clause, ['дата пробы', 'дата', 'кто отобрал', 'пробу отобрал', 'отобрал', 'примечание', 'статус', 'точка отбора', 'точка', 'для']) !== null
    || parseParameterClause(clause) !== null
  ));
}

export const waterQualityForm: FormDefinition = {
  id: 'water-quality',
  matchTrigger: (text) => matchTriggerPhrase(text, TRIGGERS),
  isAllowed: (access) => isToolAllowedForAccess('add_water_quality_analysis', access),
  steps: [
    {
      id: 'point',
      label: 'Точка отбора',
      optional: false,
      editPhrases: ['точку', 'точка', 'точка отбора'],
      prompt: () => ({ text: 'Точка отбора? Укажите название из списка.' }),
      onClear: clearPoint,
    },
    {
      id: 'date',
      label: 'Дата пробы',
      optional: false,
      editPhrases: ['дату', 'дата', 'дата пробы'],
      prompt: () => ({ text: 'Дата пробы? Можно написать «сегодня» или дату в формате ГГГГ-ММ-ДД.', suggestions: ['Сегодня'] }),
    },
    {
      id: 'sampledBy',
      label: 'Кто отобрал',
      optional: false,
      editPhrases: ['кто отобрал', 'отобрал'],
      prompt: () => ({ text: 'Кто отобрал пробу?' }),
    },
    {
      id: 'status',
      label: 'Статус',
      optional: true,
      editPhrases: ['статус'],
      prompt: () => ({ text: 'Статус анализа? Если пропустить, будет «выполнен».', suggestions: STATUS_SUGGESTIONS }),
      onSkip: () => [{ key: 'status', value: 'completed', undoable: true }],
    },
    {
      id: 'parameters',
      label: 'Показатели',
      optional: false,
      editPhrases: ['показатели', 'показатель'],
      prompt: (draft) => parameterPrompt(draft),
      isDone: (draft) => draft.values.parametersDone === 'yes',
      onNext: (draft) => {
        draft.values.parametersDone = 'yes';
      },
      onClear: (draft) => {
        delete draft.values.parametersDone;
      },
    },
    {
      id: 'notes',
      label: 'Примечание',
      optional: true,
      editPhrases: ['примечание'],
      prompt: () => ({ text: 'Примечание? Можно пропустить.', suggestions: ['Пропустить'] }),
      onSkip: () => [{ key: 'notes', value: '', undoable: true }],
    },
  ],
  async interpret(text, draft, runtime) {
    let list: SamplingPointRecord[] = [];
    try {
      list = await runtime.services.listSamplingPoints();
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'список недоступен';
      return { type: 'invalid', message: `Не удалось получить точки отбора: ${detail}` };
    }
    if (draft.currentStep === 'parameters' && !hasExplicitMarker(text)) return interpretParameters(text, draft);
    if (splitClauses(text).length > 1 || hasExplicitMarker(text)) return interpretMany(text, draft, list, runtime.now);
    return interpretCurrent(text, draft, list, runtime.now);
  },
  confirmation(draft) {
    const lines = PARAMETERS
      .filter((item) => draft.values[`param:${item.id}`] !== undefined)
      .map((item) => `${item.title}: ${draft.values[`param:${item.id}`]} ${item.unit}`);
    const notes = draft.values.notes?.trim();
    return {
      text: [
        'Проверьте данные:',
        '',
        `Точка отбора: ${draft.values.pointName ?? ''}`,
        `Дата пробы: ${draft.values.date ?? ''}`,
        `Кто отобрал: ${draft.values.sampledBy ?? ''}`,
        `Статус: ${statusLabel(draft.values.status)}`,
        lines.length > 0 ? `Показатели:\n${lines.join('\n')}` : 'Показатели: не указаны',
        ...(notes ? [`Примечание: ${notes}`] : []),
        '',
        'Сохранить?',
      ].join('\n'),
      suggestions: ['Да', 'Нет', 'Редактировать'],
    };
  },
  async submit(draft, runtime) {
    if (!draft.values.point || !draft.values.date || !draft.values.sampledBy) {
      return { ok: false, text: 'В бланке не хватает данных. Ответьте «Редактировать» и заполните пустой пункт.' };
    }
    const results = PARAMETERS.flatMap((item) => {
      const raw = draft.values[`param:${item.id}`];
      if (raw === undefined) return [];
      return [{ parameter_name: item.id, value: Number(raw), unit: item.unit }];
    });
    try {
      const points = await runtime.services.listSamplingPoints();
      const point = points.find((item) => item.id === draft.values.point);
      if (!point) return { ok: false, text: 'Точка отбора недоступна. Выберите её снова и ответьте «Да».' };
      const notes = draft.values.notes?.trim();
      await runtime.services.addWaterAnalysis({
        sampling_point_id: point.id,
        sample_date: draft.values.date,
        sampled_by: draft.values.sampledBy,
        status: draft.values.status || 'completed',
        notes: notes || undefined,
        results,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Не удалось сохранить запись';
      return { ok: false, text: `Не удалось сохранить запись. ${detail}` };
    }
    return { ok: true, text: 'Анализ воды сохранён.' };
  },
};
