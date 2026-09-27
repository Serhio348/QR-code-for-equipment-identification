import { describe, expect, it } from 'vitest';
import { balanceChartSeriesLabel, balanceDockedTipFingerprint } from './balanceChart';

describe('balanceChartSeriesLabel', () => {
  it('names the well and the losses and keeps an unknown series', () => {
    expect(balanceChartSeriesLabel('source')).toBe('Скважина');
    expect(balanceChartSeriesLabel('losses')).toBe('Потери');
    expect(balanceChartSeriesLabel('ХВО')).toBe('ХВО');
    expect(balanceChartSeriesLabel(undefined)).toBe('');
  });
});

describe('balanceDockedTipFingerprint', () => {
  it('changes when the selected day or a meter value changes', () => {
    const first = balanceDockedTipFingerprint('3', [{ name: 'source', value: 10 }]);
    const same = balanceDockedTipFingerprint('3', [{ name: 'source', value: 10 }]);
    const otherDay = balanceDockedTipFingerprint('4', [{ name: 'source', value: 10 }]);
    expect(first).toBe(same);
    expect(otherDay).not.toBe(first);
  });
});
