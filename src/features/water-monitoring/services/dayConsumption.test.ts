/**
 * dayConsumption.test.ts
 *
 * DATA-01: пропуск суток не должен дважды учитывать уже посчитанный расход.
 */
import { describe, expect, it } from 'vitest';
import { computeDayConsumption, consumptionFromDailySeries, type MeterDayReading } from './dayConsumption';

const YEAR = 2026;
const MONTH = 8; // сентябрь
const DAYS = 30;

function days(
  readings: Record<number, MeterDayReading>,
  baseline?: number,
  replacementDays: number[] = [],
): Array<ReturnType<typeof computeDayConsumption>> {
  const readingsByDay: Record<string, MeterDayReading> = {};
  for (const [day, reading] of Object.entries(readings)) {
    const key = `2026-09-${String(day).padStart(2, '0')}`;
    readingsByDay[key] = reading;
  }
  const replacement = new Set(replacementDays);
  return Array.from({ length: DAYS }, (_, index) =>
    computeDayConsumption({
      year: YEAR,
      monthIndex: MONTH,
      dayNumber: index + 1,
      daysInMonth: DAYS,
      readingsByDay,
      monthBaseline: baseline,
      isMeterReplacementDay: (dayNumber) => replacement.has(dayNumber),
    }),
  );
}

function volumes(result: Array<ReturnType<typeof computeDayConsumption>>): number[] {
  return result.map((day) => day.volumeM3);
}

describe('computeDayConsumption', () => {
  it('не учитывает расход первого дня повторно после одного пропуска', () => {
    const result = days(
      {
        1: { min: 108, max: 110 },
        3: { min: 118, max: 120 },
      },
      100,
    );

    expect(volumes(result).slice(0, 3)).toEqual([10, 0, 10]);
    expect(result[0].unknownDistribution).toBe(false);
    expect(result[1]).toMatchObject({
      unknownDistribution: true,
      intervalFromDay: 2,
      intervalToDay: 3,
    });
    expect(result[2]).toMatchObject({
      unknownDistribution: true,
      intervalFromDay: 2,
      intervalToDay: 3,
    });
    expect(volumes(result).reduce((sum, value) => sum + value, 0)).toBe(20);
  });

  it('после нескольких пропусков вычитает последнее известное показание', () => {
    const result = days(
      {
        1: { min: 105, max: 110 },
        4: { min: 130, max: 140 },
      },
      100,
    );

    expect(volumes(result).slice(0, 4)).toEqual([10, 0, 0, 30]);
    expect(result[1].intervalFromDay).toBe(2);
    expect(result[1].intervalToDay).toBe(4);
    expect(result[3].intervalFromDay).toBe(2);
    expect(volumes(result).reduce((sum, value) => sum + value, 0)).toBe(40);
  });

  it('1-е число вычитает baseline и не помечает день как пропуск', () => {
    const result = days({ 1: { min: 100, max: 110 } }, 100);

    expect(result[0]).toMatchObject({
      volumeM3: 10,
      unknownDistribution: false,
      intervalFromDay: null,
      intervalToDay: null,
    });
  });

  it('пропуск с начала месяца относит расход к первому снятию один раз', () => {
    const result = days({ 2: { min: 110, max: 115 } }, 100);

    expect(volumes(result).slice(0, 2)).toEqual([0, 15]);
    expect(result[0]).toMatchObject({
      unknownDistribution: true,
      intervalFromDay: 1,
      intervalToDay: 2,
    });
    expect(result[1].unknownDistribution).toBe(true);
    expect(volumes(result).reduce((sum, value) => sum + value, 0)).toBe(15);
  });

  it('день замены считает max − min и не подмешивает старую шкалу через пропуск', () => {
    const result = days(
      {
        1: { min: 1000, max: 1010 },
        2: { min: 0, max: 4 },
        4: { min: 5, max: 9 },
      },
      1000,
      [2],
    );

    expect(volumes(result).slice(0, 4)).toEqual([10, 4, 0, 5]);
    expect(result[1].unknownDistribution).toBe(false);
    expect(result[2]).toMatchObject({
      unknownDistribution: true,
      intervalFromDay: 3,
      intervalToDay: 4,
    });
    expect(result[3]).toMatchObject({
      volumeM3: 5,
      unknownDistribution: true,
      intervalFromDay: 3,
      intervalToDay: 4,
    });
  });

  it('пропуск перед заменой не добавляется к расходу нового счётчика', () => {
    const result = days(
      {
        1: { min: 1000, max: 1010 },
        3: { min: 0, max: 4 },
      },
      1000,
      [3],
    );

    expect(volumes(result).slice(0, 3)).toEqual([10, 0, 4]);
    expect(result[1]).toMatchObject({
      unknownDistribution: true,
      intervalFromDay: 2,
      intervalToDay: 2,
    });
    expect(result[2].unknownDistribution).toBe(false);
    expect(volumes(result).reduce((sum, value) => sum + value, 0)).toBe(14);
  });

  it('ручная корректировка заменяет max − min в день замены', () => {
    const readings = {
      1: { min: 1000, max: 1010 },
      2: { min: 0, max: 4 },
      3: { min: 5, max: 9 },
    };
    const result = days(readings, 1000, [2]).map((day, index) =>
      index === 1
        ? computeDayConsumption({
          year: YEAR,
          monthIndex: MONTH,
          dayNumber: 2,
          daysInMonth: DAYS,
          readingsByDay: { '2026-09-02': readings[2] },
          monthBaseline: 1000,
          volumeOverride: 3.48,
          isMeterReplacementDay: () => true,
        })
        : day,
    );

    expect(result[1].volumeM3).toBe(3.48);
    expect(result[1].unknownDistribution).toBe(false);
    expect(result[2].volumeM3).toBe(5);
  });

  it('обычный месяц, замена в середине и замена на 1-е число дают одну сумму', () => {
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
