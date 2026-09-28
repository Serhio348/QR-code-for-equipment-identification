/**
 * Цвета серий на дашборде «Вода».
 * Скважина — синяя линия, потери — красная шапка.
 * Счётчики идут по порядку столбца: соседние слои из разных семейств,
 * без второго зелёного и без красного.
 */

/** Линия скважины. */
export const SOURCE_COLOR = '#1e40af';

/** Зона потерь. */
export const LOSSES_COLOR = '#ef4444';

/**
 * Один цвет — одно семейство. Порядок совпадает с порядком слоёв в столбце:
 * первый счётчик снизу, следующий над ним.
 */
export const METER_SERIES_PALETTE: readonly string[] = [
  '#eab308',
  '#6d28d9',
  '#15803d',
  '#c026d3',
  '#0f766e',
  '#db2777',
  '#44403c',
  '#0891b2',
  '#65a30d',
  '#ea580c',
];

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

/** Расстояние по цветовому кругу, 0–180. У серого оттенка нет. */
export function seriesHueDistance(left: string, right: string): number | null {
  const [h1, s1] = rgbToHsl(...hexToRgb(left));
  const [h2, s2] = rgbToHsl(...hexToRgb(right));
  if (s1 < 18 || s2 < 18) return null;
  const raw = Math.abs(h1 - h2);
  return Math.min(raw, 360 - raw);
}

/**
 * Цвет по порядку списка. Первые имена — нижние слои столбца,
 * поэтому соседние в списке не должны быть оттенками одного цвета.
 */
export function buildMeterLabelColorMap(labels: string[]): Map<string, string> {
  const unique = [...new Set(labels.filter(Boolean))];
  const map = new Map<string, string>();
  unique.forEach((label, index) => {
    map.set(label, METER_SERIES_PALETTE[index % METER_SERIES_PALETTE.length]);
  });
  return map;
}
