import { describe, expect, it } from 'vitest';
import {
    compareAccountConsumption,
    consumptionGrowthAlert,
    tariffMemoryKey,
} from './invoiceComparison.js';

const ROWS = [
    { period: '2026-07', account_number: '107.00', volume_m3: 12 },
    { period: '2026-07', account_number: '107.09', volume_m3: 3 },
    { period: '2026-05', account_number: '107.00', volume_m3: 10 },
    { period: '2026-04', account_number: '107.09', volume_m3: 0 },
];

describe('compareAccountConsumption', () => {
    it('compares the same account across a skipped month and ignores the other account', () => {
        const comparison = compareAccountConsumption(ROWS, '107.00', '2026-07');
        expect(comparison).toMatchObject({
            status: 'compared',
            previousPeriod: '2026-05',
            currentPeriod: '2026-07',
            percent: 20,
        });
        expect(consumptionGrowthAlert(comparison)).toBeNull();
    });

    it('does not turn a zero previous volume into an infinite percent', () => {
        const comparison = compareAccountConsumption(ROWS, '107.09', '2026-07');
        expect(comparison.status).toBe('zero_baseline');
        expect(consumptionGrowthAlert(comparison)).toBeNull();
        expect(JSON.stringify(comparison)).not.toContain('Infinity');
    });

    it('does not compare two rows that share a period', () => {
        const comparison = compareAccountConsumption(
            [
                { period: '2026-07', account_number: '107.00', volume_m3: 12 },
                { period: '2026-07', account_number: '107.09', volume_m3: 3 },
            ],
            '107.00',
            '2026-07',
        );
        expect(comparison).toEqual({ status: 'no_baseline' });
    });
});

describe('tariffMemoryKey', () => {
    it('keeps tariffs of different accounts apart', () => {
        expect(tariffMemoryKey('water', '107.00')).toBe('tariff_water:107.00');
        expect(tariffMemoryKey('water', '107.09')).toBe('tariff_water:107.09');
        expect(tariffMemoryKey('sewage', '107.00')).not.toBe(tariffMemoryKey('water', '107.00'));
    });
});
