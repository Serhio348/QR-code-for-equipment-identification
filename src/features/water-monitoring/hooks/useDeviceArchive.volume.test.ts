/**
 * useDeviceArchive.volume.test.ts
 *
 * DATA-02: архив использует ту же сумму, что график: корректировка и сегмент замены.
 */
import { describe, expect, it } from 'vitest';
import type { BeliotDeviceReading } from '../services/supabaseBeliotReadingsApi';
import { computeArchivePeriodVolume, type GroupedReading } from './useDeviceArchive';

function reading(deviceId: string, iso: string, value: number): BeliotDeviceReading {
  return {
    id: iso,
    device_id: deviceId,
    reading_date: iso,
    reading_value: value,
    unit: 'м³',
    reading_type: 'hourly',
    source: 'test',
    period: 'current',
    created_at: iso,
    updated_at: iso,
  };
}

function period(groupKey: string, point: BeliotDeviceReading): GroupedReading {
  return {
    groupKey,
    groupDate: new Date(`${groupKey.length === 7 ? `${groupKey}-01` : groupKey}T00:00:00+03:00`),
    reading: point,
    consumption: 0,
  };
}

describe('computeArchivePeriodVolume', () => {
  const raw = [
    reading('11078', '2026-04-30T22:00:00+03:00', 1000),
    reading('11078', '2026-05-01T20:00:00+03:00', 1010),
    reading('11078', '2026-05-04T08:00:00+03:00', 0),
    reading('11078', '2026-05-04T20:00:00+03:00', 4),
    reading('11078', '2026-05-05T20:00:00+03:00', 9),
  ];

  it('в день замены берёт подтверждённые 3.48, а не max − min и не старую шкалу', () => {
    const volume = computeArchivePeriodVolume(period('2026-05-04', raw[3]), 0, 'day', [], raw);
    expect(volume).toBe(3.48);
  });

  it('месяц с заменой в середине совпадает с суммой сегментов', () => {
    const volume = computeArchivePeriodVolume(period('2026-05', raw[4]), 0, 'month', [], raw);
    expect(volume).toBe(18.48);
  });

  it('обычный месяц без замены равен последнему показанию минус baseline', () => {
    const plain = [
      reading('11013', '2026-04-30T22:00:00+03:00', 100),
      reading('11013', '2026-05-01T20:00:00+03:00', 110),
      reading('11013', '2026-05-02T20:00:00+03:00', 120),
    ];
    const volume = computeArchivePeriodVolume(period('2026-05', plain[2]), 0, 'month', [], plain);
    expect(volume).toBe(20);
  });
});
