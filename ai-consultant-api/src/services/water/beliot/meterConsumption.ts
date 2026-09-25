/**
 * meterConsumption.ts
 *
 * Та же формула, что src/features/water-monitoring/services/dayConsumption.ts.
 * Архив, график, KPI и analyze_water_consumption считают расход одинаково.
 *
 * Расход счётчика за календарные сутки.
 *
 * Структура / что умеет:
 * 1. computeDayConsumption — max дня минус последнее известное показание
 * 2. consumptionFromDailySeries — сумма дней с заменой шкалы и ручной корректировкой
 * 3. readingDayKey — ключ даты YYYY-MM-DD
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
  /** Подтверждённый объём дня (firstDayVolume / корректировка). Заменяет расчёт. */
  volumeOverride?: number;
  isMeterReplacementDay?: (dayNumber: number) => boolean;
}): DayConsumptionResult {
  const {
    year,
    monthIndex,
    dayNumber,
    daysInMonth,
    readingsByDay,
    monthBaseline,
    volumeOverride,
    isMeterReplacementDay = () => false,
  } = params;

  if (volumeOverride !== undefined && Number.isFinite(volumeOverride)) {
    return {
      volumeM3: roundM3(volumeOverride),
      unknownDistribution: false,
      intervalFromDay: null,
      intervalToDay: null,
    };
  }

  const readingOn = (day: number): MeterDayReading | undefined =>
    readingsByDay[readingDayKey(year, monthIndex, day)];

  const previousAnchor = (day: number): { dayNumber: number; max: number } | null => {
    for (let d = day - 1; d >= 1; d -= 1) {
      if (isMeterReplacementDay(d)) {
        const replacement = readingOn(d);
        return replacement ? { dayNumber: d, max: replacement.max } : null;
      }
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

export interface DailyMeterSpan {
  /** YYYY-MM-DD */
  day: string;
  min: number;
  max: number;
}

/**
 * Сумма расхода по дням. Месячный итог равен сумме дней:
 * обычный месяц — от baseline, замена — отдельный сегмент шкалы,
 * ручная корректировка заменяет расчёт этого дня.
 */
export function consumptionFromDailySeries(params: {
  baseline?: number;
  days: readonly DailyMeterSpan[];
  replacementDay?: string | null;
  volumeOverrides?: Readonly<Record<string, number>>;
}): number {
  const spans = new Map<string, MeterDayReading>();
  for (const day of params.days) {
    const prev = spans.get(day.day);
    if (!prev) spans.set(day.day, { min: day.min, max: day.max });
    else {
      prev.min = Math.min(prev.min, day.min);
      prev.max = Math.max(prev.max, day.max);
    }
  }

  const overrides = params.volumeOverrides ?? {};
  const replacementDay = params.replacementDay ?? null;
  const monthKeys = new Set<string>();
  for (const day of spans.keys()) monthKeys.add(day.slice(0, 7));
  for (const day of Object.keys(overrides)) monthKeys.add(day.slice(0, 7));
  if (replacementDay) monthKeys.add(replacementDay.slice(0, 7));

  let carry = params.baseline;
  let total = 0;
  for (const monthKey of [...monthKeys].sort()) {
    const [yearStr, monthStr] = monthKey.split('-');
    const year = Number(yearStr);
    const monthIndex = Number(monthStr) - 1;
    if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) continue;
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const readingsByDay: Record<string, MeterDayReading> = {};
    for (const [day, span] of spans) {
      if (day.startsWith(`${monthKey}-`)) readingsByDay[day] = span;
    }

    let lastReadingDay = '';
    let lastReadingMax: number | undefined;
    for (let dayNumber = 1; dayNumber <= daysInMonth; dayNumber += 1) {
      const day = readingDayKey(year, monthIndex, dayNumber);
      const override = overrides[day];
      total += computeDayConsumption({
        year,
        monthIndex,
        dayNumber,
        daysInMonth,
        readingsByDay,
        monthBaseline: carry,
        volumeOverride: override,
        isMeterReplacementDay: (n) => readingDayKey(year, monthIndex, n) === replacementDay,
      }).volumeM3;
      const seg = readingsByDay[day];
      if (seg) {
        lastReadingDay = day;
        lastReadingMax = seg.max;
      }
    }

    const replacementInMonth = replacementDay?.startsWith(`${monthKey}-`) === true;
    if (replacementInMonth && lastReadingDay < (replacementDay ?? '')) {
      carry = undefined;
    } else if (lastReadingMax !== undefined) {
      carry = lastReadingMax;
    }
  }

  return parseFloat(total.toFixed(3));
}
