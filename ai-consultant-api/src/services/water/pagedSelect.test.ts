/**
 * pagedSelect.test.ts
 *
 * DATA-03: список счетов не обрывается на первой полной странице.
 */
import { describe, expect, it } from 'vitest';
import { fetchAllPages } from './pagedSelect.js';

describe('fetchAllPages', () => {
  it('собирает ключи счетов со второй страницы', async () => {
    const invoices = Array.from({ length: 5 }, (_, index) => ({
      period: '2026-01',
      account_number: `107.0${index}`,
    }));
    const rows = await fetchAllPages(async (from, to) => ({
      data: invoices.slice(from, to + 1),
      error: null,
    }), 2);

    const keys = new Set(rows.map(row => `${row.period}|${row.account_number ?? ''}`));
    expect(keys.size).toBe(5);
    expect(keys.has('2026-01|107.04')).toBe(true);
  });
});
