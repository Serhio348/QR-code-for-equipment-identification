/**
 * balanceStatus.test.ts
 *
 * DATA-04: ноль, пустой ряд и отрицательный баланс — разные подписи.
 */
import { describe, expect, it } from 'vitest';
import { coverageNote, presentLoss, presentVolume, roleCoverage } from './balanceStatus';

describe('roleCoverage', () => {
  it('отличает пустой ряд, часть счётчиков и полный ряд', () => {
    expect(roleCoverage(['a', 'b'], new Set())).toBe('none');
    expect(roleCoverage(['a', 'b'], new Set(['a']))).toBe('partial');
    expect(roleCoverage(['a', 'b'], new Set(['a', 'b']))).toBe('complete');
  });
});

describe('presentVolume', () => {
  it('показывает 0 только когда измерение было', () => {
    expect(presentVolume('complete', 0)).toBe('0 м³');
    expect(presentVolume('none', 0)).toBe('нет измерений');
  });

  it('помечает неполный ряд', () => {
    expect(coverageNote('partial')).toMatch(/неполные/);
    expect(coverageNote('complete')).toBeNull();
  });
});

describe('presentLoss', () => {
  it('не зажимает отрицательный баланс в ноль', () => {
    const loss = presentLoss('complete', 'complete', 10, 12);
    expect(loss.balanceM3).toBe(-2);
    expect(loss.anomaly).toBe(true);
    expect(loss.text).toContain('-2');
    expect(loss.note).toMatch(/не нулевые потери/);
  });

  it('без показаний скважины не пишет 0 м³', () => {
    const loss = presentLoss('none', 'complete', 0, 12);
    expect(loss.text).toBe('нет измерений');
    expect(loss.anomaly).toBe(false);
  });

  it('нулевые потери остаются нулём', () => {
    const loss = presentLoss('complete', 'complete', 10, 10);
    expect(loss.balanceM3).toBe(0);
    expect(loss.text).toContain('0');
    expect(loss.anomaly).toBe(false);
  });
});
