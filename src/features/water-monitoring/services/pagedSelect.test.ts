/**
 * pagedSelect.test.ts
 *
 * DATA-03: страница не считается полной выборкой, частый счётчик не вытесняет редкий.
 */
import { describe, expect, it } from 'vitest';
import { baselineFromLatestRows, fetchAllPages, type LatestReadingRow } from './pagedSelect';

describe('fetchAllPages', () => {
  it('дочитывает строки после полной первой страницы', async () => {
    const all = Array.from({ length: 5 }, (_, index) => index + 1);
    const rows = await fetchAllPages<number>(async (from, to) => {
      const data = all.slice(from, to + 1);
      return { data, error: null };
    }, 2);

    expect(rows).toEqual([1, 2, 3, 4, 5]);
  });

  it('не принимает ошибку за пустой конец выборки', async () => {
    await expect(fetchAllPages(async () => ({
      data: null,
      error: { message: 'timeout' },
    }), 2)).rejects.toThrow('timeout');
  });
});

describe('baseline по счётчикам', () => {
  const readings: LatestReadingRow[] = [
    ...Array.from({ length: 20 }, (_, index) => ({
      device_id: 'busy',
      reading_value: 1000 - index,
    })),
    { device_id: 'rare', reading_value: 40 },
  ];

  it('общий лимит новейших строк теряет редкий счётчик', () => {
    const shared = baselineFromLatestRows(readings.slice(0, 10));
    expect(shared).toEqual({ busy: 1000 });
    expect(shared.rare).toBeUndefined();
  });

  it('последняя строка каждого счётчика сохраняет редкое показание', () => {
    const perDevice = baselineFromLatestRows([
      readings.find(row => row.device_id === 'busy'),
      readings.find(row => row.device_id === 'rare'),
    ]);
    expect(perDevice).toEqual({ busy: 1000, rare: 40 });
  });
});
