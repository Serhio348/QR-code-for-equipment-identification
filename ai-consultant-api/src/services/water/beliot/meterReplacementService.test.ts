/**
 * meterReplacementService.test.ts
 *
 * Проверяет применение и отклонение событий замены через backend-сервис.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFrom, mockRpc } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: mockFrom,
    rpc: mockRpc,
  }),
}));

import {
  confirmMeterReplacement,
  dismissMeterReplacement,
} from './meterReplacementService.js';

const EVENT_ROW = {
  id: '90d38309-f196-4e0f-9ad8-5be204ad2104',
  device_id: '11363',
  status: 'pending_review',
  detection_source: 'reading_drop',
  old_reading_value: 52061.81,
  old_reading_at: '2026-07-30T21:00:00.000Z',
  new_reading_value: 14382.1,
  new_reading_at: '2026-07-31T21:00:00.000Z',
  drop_m3: 37679.71,
  drop_ratio: 0.72,
  suggested_replacement_day: '2026-07-31',
  old_serial_number: '13001986',
  provider_serial_number: null,
  confirmed_serial_number: null,
  first_day_volume_m3: null,
  reason: null,
  detected_at: '2026-08-01T00:00:00.000Z',
};

function enrichmentMocks(): void {
  mockFrom
    .mockImplementationOnce(() => ({
      select: () => ({
        in: vi.fn().mockResolvedValue({
          data: [{ device_id: '11363', provider_name: 'MTK-40N' }],
        }),
      }),
    }))
    .mockImplementationOnce(() => ({
      select: () => ({
        in: vi.fn().mockResolvedValue({
          data: [{ device_id: '11363', name: 'ХВО' }],
        }),
      }),
    }));
}

describe('meterReplacementService', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockRpc.mockReset();
  });

  it('confirms a replacement through the atomic RPC', async () => {
    mockRpc.mockResolvedValue({ error: null });
    mockFrom
      .mockImplementationOnce(() => ({
        insert: vi.fn().mockResolvedValue({ error: null }),
      }))
      .mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            single: vi.fn().mockResolvedValue({
              data: {
                ...EVENT_ROW,
                status: 'confirmed',
                confirmed_serial_number: '13001660',
              },
              error: null,
            }),
          }),
        }),
      }));
    enrichmentMocks();

    const event = await confirmMeterReplacement(EVENT_ROW.id, {
      replacementDay: '2026-07-31',
      newSerialNumber: '13001660',
      firstDayVolumeM3: null,
      reason: 'Плановая замена',
    }, '67ed9c3a-103a-4aa5-9767-c25e5d418cb3', 'admin@example.com');

    expect(mockRpc).toHaveBeenCalledWith('confirm_beliot_meter_replacement', {
      p_event_id: EVENT_ROW.id,
      p_replacement_day: '2026-07-31',
      p_new_serial_number: '13001660',
      p_first_day_volume_m3: null,
      p_reason: 'Плановая замена',
      p_confirmed_by: '67ed9c3a-103a-4aa5-9767-c25e5d418cb3',
    });
    expect(event.confirmed_serial_number).toBe('13001660');
    expect(event.device_id).toBe('11363');
  });

  it('dismisses an active replacement without applying rules', async () => {
    mockFrom
      .mockImplementationOnce(() => ({
        update: () => ({
          eq: () => ({
            in: () => ({
              select: () => ({
                single: vi.fn().mockResolvedValue({
                  data: { ...EVENT_ROW, status: 'dismissed', reason: 'Ошибка данных' },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }))
      .mockImplementationOnce(() => ({
        insert: vi.fn().mockResolvedValue({ error: null }),
      }));
    enrichmentMocks();

    const event = await dismissMeterReplacement(
      EVENT_ROW.id,
      'Ошибка данных',
      '67ed9c3a-103a-4aa5-9767-c25e5d418cb3',
      'admin@example.com',
    );

    expect(mockRpc).not.toHaveBeenCalled();
    expect(event.status).toBe('dismissed');
  });
});
