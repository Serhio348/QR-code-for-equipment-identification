/**
 * Цвета серий на дашборде «Вода».
 * Скважина и потери заняты своими цветами. Остальным рядам достаются
 * оттенки, которые не сливаются ни с ними, ни друг с другом.
 */

/** Линия скважины. */
export const SOURCE_COLOR = '#1e40af';

/** Зона потерь. */
export const LOSSES_COLOR = '#ef4444';

/**
 * Кандидаты для счётчиков. Красный и тёмно-синий сюда не входят:
 * они уже стоят на потерях и скважине.
 */
export const METER_SERIES_PALETTE: readonly string[] = [
  '#f97316',
  '#eab308',
  '#84cc16',
  '#15803d',
  '#0f766e',
  '#0891b2',
  '#7c3aed',
  '#c026d3',
  '#db2777',
  '#9a3412',
  '#4d7c0f',
  '#155e75',
  '#6b21a8',
  '#a16207',
  '#3f3f46',
  '#fb7185',
];

const RESERVED_SERIES_COLORS = [SOURCE_COLOR, LOSSES_COLOR];

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const lightness = (max + min) / 2;
  if (max === min) return [0, 0, lightness * 100];
  const delta = max - min;
  const saturation = lightness > 0.5
    ? delta / (2 - max - min)
    : delta / (max + min);
  let hue = 0;
  if (max === rn) hue = (gn - bn) / delta + (gn < bn ? 6 : 0);
  else if (max === gn) hue = (bn - rn) / delta + 2;
  else hue = (rn - gn) / delta + 4;
  return [hue * 60, saturation * 100, lightness * 100];
}

function hueDistance(a: number, b: number): number {
  const raw = Math.abs(a - b);
  return Math.min(raw, 360 - raw);
}

/** Насколько два цвета различимы на легенде и в стопке столбцов. */
export function chartColorDistance(left: string, right: string): number {
  const [h1, s1, l1] = rgbToHsl(...hexToRgb(left));
  const [h2, s2, l2] = rgbToHsl(...hexToRgb(right));
  const hueWeight = Math.min(s1, s2) / 100;
  return hueDistance(h1, h2) * hueWeight
    + Math.abs(l1 - l2) * 1.2
    + Math.abs(s1 - s2) * 0.25;
}

function colorsCollide(left: string, right: string): boolean {
  const [h1, s1, l1] = rgbToHsl(...hexToRgb(left));
  const [h2, s2, l2] = rgbToHsl(...hexToRgb(right));
  const dh = hueDistance(h1, h2);
  const dl = Math.abs(l1 - l2);
  if (Math.min(s1, s2) < 18) return dl < 14;
  return dh < 26 && dl < 22;
}

/**
 * Каждой подписи счётчика — свой цвет.
 * Порядок подписей не меняет набор: сначала самые далёкие от скважины, потерь и уже выбранных.
 */
export function buildMeterLabelColorMap(labels: string[]): Map<string, string> {
  const unique = [...new Set(labels.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  const used = [...RESERVED_SERIES_COLORS];
  const map = new Map<string, string>();

  for (const label of unique) {
    let best = METER_SERIES_PALETTE[0];
    let bestScore = -1;
    for (const candidate of METER_SERIES_PALETTE) {
      if (used.includes(candidate)) continue;
      if (used.some(color => colorsCollide(candidate, color))) continue;
      const score = Math.min(...used.map(color => chartColorDistance(candidate, color)));
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    if (bestScore < 0) {
      for (const candidate of METER_SERIES_PALETTE) {
        if (used.includes(candidate)) continue;
        const score = Math.min(...used.map(color => chartColorDistance(candidate, color)));
        if (score > bestScore) {
          bestScore = score;
          best = candidate;
        }
      }
    }
    map.set(label, best);
    used.push(best);
  }

  return map;
}
