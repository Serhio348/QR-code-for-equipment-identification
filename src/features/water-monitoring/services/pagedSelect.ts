/**
 * pagedSelect.ts
 *
 * Полная выборка из PostgREST и baseline по каждому счётчику.
 *
 * Структура / что умеет:
 * 1. fetchAllPages — читает страницы, пока ответ короче лимита
 * 2. baselineFromLatestRows — одно последнее показание на device_id
 *
 * Пример:
 * 3 страницы по 1000 строк → все 2500, а не первая тысяча
 */

export const POSTGREST_PAGE_SIZE = 1000;
const MAX_PAGES = 100;

export interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

export interface LatestReadingRow {
  device_id: string;
  reading_value: number | null;
}

/**
 * Собирает все строки. Полная страница означает, что дальше есть ещё данные.
 * Ошибка запроса не считается концом выборки.
 */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = POSTGREST_PAGE_SIZE,
): Promise<T[]> {
  if (pageSize < 1) {
    throw new Error('pageSize должен быть больше 0');
  }
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * pageSize;
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) {
      throw new Error(error.message);
    }
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < pageSize) return rows;
  }
  throw new Error('Выборка не поместилась в отведённое число страниц');
}

/** Последняя строка каждого счётчика. Повтор того же device_id не перезаписывает первую. */
export function baselineFromLatestRows(
  rows: ReadonlyArray<LatestReadingRow | null | undefined>,
): Record<string, number> {
  const baseline: Record<string, number> = {};
  for (const row of rows) {
    if (!row || row.reading_value == null || !Number.isFinite(Number(row.reading_value))) continue;
    if (row.device_id in baseline) continue;
    baseline[row.device_id] = Number(row.reading_value);
  }
  return baseline;
}
