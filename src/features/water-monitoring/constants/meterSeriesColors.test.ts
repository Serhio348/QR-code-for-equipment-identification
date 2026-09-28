import { describe, expect, it } from 'vitest';
import {
  LOSSES_COLOR,
  buildMeterLabelColorMap,
  seriesHueDistance,
} from './meterSeriesColors';

const STACK_ORDER = [
  'АЛПО',
  'Очистное отделение',
  'Ликерный участок',
  'Ввод с улицы Орджоникидзе',
  'Пожаротушение',
  'Посудо-тарный участок',
  'АБК по ул.Советская, 2 (здание)',
  'АБК по ул.Советская, 2 (полив)',
  'АБК по ул.Советская, 2/1',
];

function hueGap(left: string, right: string): number {
  return seriesHueDistance(left, right) ?? 180;
}

describe('buildMeterLabelColorMap', () => {
  it('paints stacked meters in different families, not shades of green or red', () => {
    const map = buildMeterLabelColorMap(STACK_ORDER);
    const colors = STACK_ORDER.map(label => map.get(label) ?? '');

    expect(new Set(colors).size).toBe(STACK_ORDER.length);
    expect(hueGap(colors[0], colors[1])).toBeGreaterThan(80);
    expect(hueGap(colors[colors.length - 1], LOSSES_COLOR)).toBeGreaterThan(60);

    for (let i = 0; i < colors.length - 1; i += 1) {
      expect(hueGap(colors[i], colors[i + 1])).toBeGreaterThan(40);
    }
    const greenFamily = colors.filter(color => hueGap(color, '#15803d') < 28);
    expect(greenFamily).toHaveLength(1);
  });
});
