/**
 * Фиксированные цвета серий счётчиков на дашборде «Вода» (бары, линии, полосы распределения).
 * Палитра — заранее подобранные контрастные hex (без динамического HSL).
 */

export const METER_SERIES_PALETTE: readonly string[] = [
  '#0d9488',
  '#ea580c',
  '#7c3aed',
  '#16a34a',
  '#db2777',
  '#ca8a04',
  '#0284c7',
  '#9333ea',
  '#059669',
  '#e11d48',
  '#2563eb',
  '#65a30d',
  '#c026d3',
  '#0f766e',
  '#b45309',
  '#4f46e5',
  '#dc2626',
  '#0891b2',
  '#86198f',
  '#a855f7',
  '#15803d',
  '#d97706',
  '#0e7490',
  '#7e22ce',
  '#be123c',
  '#0369a1',
];

/**
 * Каждому уникальному ключу (подпись счётчика на графике) — цвет из палитры по порядку сортировки.
 */
export function buildMeterLabelColorMap(labels: string[]): Map<string, string> {
  const unique = [...new Set(labels.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  const map = new Map<string, string>();
  for (let i = 0; i < unique.length; i += 1) {
    map.set(unique[i], METER_SERIES_PALETTE[i % METER_SERIES_PALETTE.length]);
  }
  return map;
}
