/**
 * meterConsumption.test.ts
 *
 * DATA-02: AI считает расход той же формулой, что архив и дашборд.
 */
import { describe, expect, it } from 'vitest';
import { consumptionFromDailySeries } from './meterConsumption.js';

describe('consumptionFromDailySeries', () => {
  it('совпадает с дашбордом: обычный месяц, замена в середине и на границе месяца', () => {
    expect(consumptionFromDailySeries({
      baseline: 100,
      days: [
        { day: '2026-09-01', min: 105, max: 110 },
        { day: '2026-09-02', min: 112, max: 120 },
      ],
    })).toBe(20);

    expect(consumptionFromDailySeries({
      baseline: 1000,
      days: [
        { day: '2026-09-01', min: 1005, max: 1010 },
        { day: '2026-09-15', min: 0, max: 4 },
        { day: '2026-09-16', min: 5, max: 9 },
      ],
      replacementDay: '2026-09-15',
      volumeOverrides: { '2026-09-15': 3.48 },
    })).toBe(18.48);

    expect(consumptionFromDailySeries({
      baseline: 5000,
      days: [
        { day: '2026-09-01', min: 0, max: 4 },
        { day: '2026-09-02', min: 5, max: 12 },
      ],
      replacementDay: '2026-09-01',
      volumeOverrides: { '2026-09-01': 3.48 },
    })).toBe(11.48);
  });
});
