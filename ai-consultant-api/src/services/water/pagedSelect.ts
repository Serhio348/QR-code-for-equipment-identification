/**
 * pagedSelect.ts
 *
 * Полная выборка строк PostgREST страницами.
 *
 * Структура / что умеет:
 * 1. fetchAllPages — читает страницы, пока ответ короче лимита
 *
 * Пример:
 * 1001 счёт в water_invoices → две страницы, а не первая тысяча
 */

export const POSTGREST_PAGE_SIZE = 1000;
const MAX_PAGES = 100;

export interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
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
