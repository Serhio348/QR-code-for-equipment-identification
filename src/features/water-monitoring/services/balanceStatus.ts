/**
 * balanceStatus.ts
 *
 * Подписи расхода: ноль, отсутствие измерений и отрицательный баланс.
 *
 * Структура / что умеет:
 * 1. roleCoverage — все счётчики, часть или ни одного
 * 2. presentVolume — «0 м³» или «нет измерений»
 * 3. presentLoss — отрицательный баланс не показывается как ноль
 *
 * Пример:
 * скважина 10, производство 12 → «−2 м³», не «0 м³»
 */

export type RoleCoverage = 'none' | 'partial' | 'complete';

export function roleCoverage(
  deviceIds: readonly string[],
  measuredIds: ReadonlySet<string>,
): RoleCoverage {
  if (deviceIds.length === 0) return 'none';
  const measured = deviceIds.filter(id => measuredIds.has(id)).length;
  if (measured === 0) return 'none';
  if (measured < deviceIds.length) return 'partial';
  return 'complete';
}

export function formatM3(value: number): string {
  return `${value.toLocaleString('ru-RU')} м³`;
}

/** «0 м³» только если измерение было. Пустой ряд — не ноль. */
export function presentVolume(coverage: RoleCoverage, volumeM3: number): string {
  if (coverage === 'none') return 'нет измерений';
  return formatM3(volumeM3);
}

export function coverageNote(coverage: RoleCoverage): string | null {
  if (coverage === 'partial') return 'данные неполные: не у всех счётчиков есть показания';
  return null;
}

export interface LossPresentation {
  text: string;
  note: string | null;
  anomaly: boolean;
  balanceM3: number;
}

/**
 * Потери = скважина − производство, без зажима в ноль.
 * Если одной из сторон нет, это не нулевой баланс.
 */
export function presentLoss(
  sourceCoverage: RoleCoverage,
  productionCoverage: RoleCoverage,
  sourceM3: number,
  productionM3: number,
): LossPresentation {
  if (sourceCoverage === 'none' || productionCoverage === 'none') {
    return {
      text: 'нет измерений',
      note: 'баланс не считается без показаний скважины и производства',
      anomaly: false,
      balanceM3: 0,
    };
  }
  const balanceM3 = parseFloat((sourceM3 - productionM3).toFixed(2));
  if (balanceM3 < 0) {
    return {
      text: formatM3(balanceM3),
      note: 'производство выше скважины — это не нулевые потери',
      anomaly: true,
      balanceM3,
    };
  }
  const pct = sourceM3 > 0 ? parseFloat(((balanceM3 / sourceM3) * 100).toFixed(1)) : 0;
  return {
    text: `${formatM3(balanceM3)} (${pct}%)`,
    note: null,
    anomaly: false,
    balanceM3,
  };
}
