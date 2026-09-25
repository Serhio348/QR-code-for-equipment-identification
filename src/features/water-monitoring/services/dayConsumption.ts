/**
 * dayConsumption.ts
 *
 * Расход счётчика за календарные сутки.
 *
 * Структура / что умеет:
 * 1. computeDayConsumption — max дня минус последнее известное показание
 * 2. readingDayKey — ключ даты YYYY-MM-DD
 *
 * Пропуск не откатывается к началу месяца: объём интервала учитывается один раз
 * в день, когда показание снова появилось, и помечается как неизвестное
 * распределение по суткам.
 *
 * Пример:
 * baseline 100, день 1 = 110, день 2 пустой, день 3 = 120
 * → 10 + 0 + 10 = 20, а не 10 + 0 + 20
 */

export interface MeterDayReading {
  min: number;
  max: number;
}

export interface DayConsumptionResult {
  /** м³. Для дня без показания — 0, расход не выдумывается. */
  volumeM3: number;
  /** День внутри пропуска между двумя известными точками. */
  unknownDistribution: boolean;
  /** Первое число интервала пропуска, если unknownDistribution. */
  intervalFromDay: number | null;
  /** Последнее число интервала пропуска, если unknownDistribution. */
  intervalToDay: number | null;
}

export function readingDayKey(year: number, monthIndex: number, dayNumber: number): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${year}-${pad(monthIndex + 1)}-${pad(dayNumber)}`;
}

function roundM3(value: number): number {
  return Math.max(0, parseFloat(value.toFixed(3)));
}

/**
 * Расход за день `dayNumber` месяца.
 * `monthIndex` — 0..11, как в Date.
 * `monthBaseline` — последнее показание до 1-го числа; для 1-го числа это предыдущая точка.
 * День замены счётчика считается как max − min и не продолжает старую шкалу.
 */
export function computeDayConsumption(params: {
  year: number;
  monthIndex: number;
  dayNumber: number;
  daysInMonth: number;
  readingsByDay: Readonly<Record<string, MeterDayReading>>;
  monthBaseline?: number;
  isMeterReplacementDay?: (dayNumber: number) => boolean;
}): DayConsumptionResult {
  const {
    year,
    monthIndex,
    dayNumber,
    daysInMonth,
    readingsByDay,
    monthBaseline,
    isMeterReplacementDay = () => false,
  } = params;

  const readingOn = (day: number): MeterDayReading | undefined =>
    readingsByDay[readingDayKey(year, monthIndex, day)];

  const previousAnchor = (day: number): { dayNumber: number; max: number } | null => {
    for (let d = day - 1; d >= 1; d -= 1) {
      const seg = readingOn(d);
      if (seg) return { dayNumber: d, max: seg.max };
    }
    if (monthBaseline !== undefined && Number.isFinite(monthBaseline)) {
      return { dayNumber: 0, max: monthBaseline };
    }
    return null;
  };

  const nextReadingDay = (day: number): number | null => {
    for (let d = day + 1; d <= daysInMonth; d += 1) {
      if (readingOn(d)) return d;
    }
    return null;
  };

  const seg = readingOn(dayNumber);
  if (!seg) {
    const anchor = previousAnchor(dayNumber);
    const next = nextReadingDay(dayNumber);
    if (!anchor || next == null) {
      return {
        volumeM3: 0,
        unknownDistribution: false,
        intervalFromDay: null,
        intervalToDay: null,
      };
    }
    // День замены не принимает расход со старой шкалы: интервал заканчивается накануне.
    const intervalToDay = isMeterReplacementDay(next) ? next - 1 : next;
    if (intervalToDay < anchor.dayNumber + 1) {
      return {
        volumeM3: 0,
        unknownDistribution: false,
        intervalFromDay: null,
        intervalToDay: null,
      };
    }
    return {
      volumeM3: 0,
      unknownDistribution: true,
      intervalFromDay: anchor.dayNumber + 1,
      intervalToDay,
    };
  }

  if (isMeterReplacementDay(dayNumber)) {
    return {
      volumeM3: roundM3(seg.max - seg.min),
      unknownDistribution: false,
      intervalFromDay: null,
      intervalToDay: null,
    };
  }

  const anchor = previousAnchor(dayNumber);
  const prevMax = anchor ? anchor.max : seg.min;
  const spansGap = anchor != null && anchor.dayNumber < dayNumber - 1;
  return {
    volumeM3: roundM3(seg.max - prevMax),
    unknownDistribution: spansGap,
    intervalFromDay: spansGap ? anchor.dayNumber + 1 : null,
    intervalToDay: spansGap ? dayNumber : null,
  };
}
