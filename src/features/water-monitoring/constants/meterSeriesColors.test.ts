import { describe, expect, it } from 'vitest';
import {
  LOSSES_COLOR,
  SOURCE_COLOR,
  buildMeterLabelColorMap,
  chartColorDistance,
} from './meterSeriesColors';

const METER_LABELS = [
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

describe('buildMeterLabelColorMap', () => {
  it('gives every balance series a color that stays apart from the others and from the well and losses', () => {
    const map = buildMeterLabelColorMap(METER_LABELS);
    const colors = METER_LABELS.map(label => map.get(label) ?? '');

    expect(new Set(colors).size).toBe(METER_LABELS.length);
    for (const color of colors) {
      expect(chartColorDistance(color, SOURCE_COLOR)).toBeGreaterThan(28);
      expect(chartColorDistance(color, LOSSES_COLOR)).toBeGreaterThan(28);
    }
    for (let i = 0; i < colors.length; i += 1) {
      for (let j = i + 1; j < colors.length; j += 1) {
        expect(chartColorDistance(colors[i], colors[j])).toBeGreaterThan(24);
      }
    }
  });
});
