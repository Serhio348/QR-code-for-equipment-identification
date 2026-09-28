/**
 * parse.ts
 *
 * Нормализация реплик, даты и однозначный выбор из справочника.
 * Справочник передаётся снаружи: сам модуль ничего не ищет в базе.
 */

export const MAX_FORM_ANSWER_LENGTH = 500;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface CatalogEntry {
  id: string;
  label: string;
  extra?: string;
}

export type CatalogMatch =
  | { status: 'one'; entry: CatalogEntry }
  | { status: 'none' }
  | { status: 'many'; entries: CatalogEntry[] };

export function normalizeUtterance(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'`]/g, '')
    .replace(/[.,!?;()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Фраза запуска в начале реплики. Возвращает хвост исходного текста.
 * specificity — длина фразы, чтобы побеждал более точный бланк.
 */
export function matchTriggerPhrase(
  raw: string,
  phrases: string[],
): { remainder: string; specificity: number } | null {
  const lowered = raw.toLowerCase().replace(/ё/g, 'е').trim();
  const sorted = [...phrases].sort((left, right) => right.length - left.length);
  for (const phrase of sorted) {
    const body = phrase.split(/\s+/).map(escapeRegExp).join('\\s+');
    const re = new RegExp(`^${body}(?=$|[\\s:,.\\-—])`, 'i');
    const match = lowered.match(re);
    if (!match) continue;
    const rest = raw.slice(match[0].length).replace(/^[\s:,.\-—]+/, '').trim();
    const restNorm = normalizeUtterance(rest);
    if ((phrase === 'создай анализ' || phrase === 'создать анализ') && restNorm.startsWith('потреблен')) {
      continue;
    }
    return { remainder: rest, specificity: phrase.length };
  }
  return null;
}

export function splitClauses(text: string): string[] {
  return text
    .replace(/:/g, ',')
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function utcToday(now: number): string {
  return new Date(now).toISOString().split('T')[0];
}

export function minskToday(now: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Minsk',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now));
}

/** «сегодня» или существующая календарная дата ГГГГ-ММ-ДД. */
export function parseFormDate(text: string, today: string): string | null {
  const normalized = normalizeUtterance(text).replace(/^дата\s+/, '');
  if (normalized === 'сегодня') return today;
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function looseLabel(value: string): string {
  return normalizeUtterance(value)
    .replace(/№/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      if (/^насос(?:а|у|ом|е|ы)?$/.test(word)) return 'насос';
      if (/^скважин(?:а|ы|е|у|ой|ою)?$/.test(word)) return 'скважина';
      return word;
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(value: string): string[] {
  return looseLabel(value).split(' ').filter(Boolean);
}

function tokensCover(query: string, label: string): boolean {
  const needle = tokens(query);
  const haystack = tokens(label);
  if (needle.length === 0 || haystack.length === 0) return false;
  return needle.every((token) => haystack.includes(token));
}

/**
 * Один объект, если запрос однозначен.
 * Совпадение по id — только полное равенство с элементом списка.
 */
export function matchCatalog(query: string, entries: CatalogEntry[]): CatalogMatch {
  const trimmed = query.trim();
  if (!trimmed) return { status: 'none' };

  const byId = entries.filter((entry) => entry.id === trimmed);
  if (byId.length === 1) return { status: 'one', entry: byId[0] };
  if (UUID_RE.test(trimmed)) return { status: 'none' };

  const exact = entries.filter((entry) => {
    const label = looseLabel(entry.label);
    const extra = looseLabel(entry.extra ?? '');
    const needle = looseLabel(trimmed);
    return needle !== '' && (label === needle || (extra !== '' && extra === needle));
  });
  if (exact.length === 1) return { status: 'one', entry: exact[0] };
  if (exact.length > 1) return { status: 'many', entries: exact };

  const partial = entries.filter((entry) => (
    tokensCover(trimmed, entry.label) || (entry.extra ? tokensCover(trimmed, entry.extra) : false)
  ));
  if (partial.length === 1) return { status: 'one', entry: partial[0] };
  if (partial.length > 1) return { status: 'many', entries: partial };
  return { status: 'none' };
}

export type FormCommand =
  | { type: 'cancel' }
  | { type: 'back' }
  | { type: 'skip' }
  | { type: 'next' }
  | { type: 'yes' }
  | { type: 'no' }
  | { type: 'edit-menu' }
  | { type: 'edit-last' }
  | { type: 'edit'; target: string };

export function parseCommand(text: string): FormCommand | null {
  const normalized = normalizeUtterance(text);
  if (normalized === 'отмена') return { type: 'cancel' };
  if (normalized === 'назад') return { type: 'back' };
  if (normalized === 'пропустить') return { type: 'skip' };
  if (normalized === 'дальше') return { type: 'next' };
  if (normalized === 'да') return { type: 'yes' };
  if (normalized === 'нет') return { type: 'no' };
  if (normalized === 'редактировать') return { type: 'edit-menu' };
  if (normalized === 'изменить') return { type: 'edit-last' };
  if (normalized.startsWith('изменить ')) {
    return { type: 'edit', target: normalized.slice('изменить '.length).trim() };
  }
  return null;
}

export function stripLabel(text: string, labels: string[]): string | null {
  const normalized = normalizeUtterance(text);
  for (const label of labels) {
    if (normalized === label) return '';
    if (normalized.startsWith(`${label} `)) {
      return text.trim().slice(text.trim().toLowerCase().replace(/ё/g, 'е').indexOf(label) + label.length).trim();
    }
  }
  return null;
}
