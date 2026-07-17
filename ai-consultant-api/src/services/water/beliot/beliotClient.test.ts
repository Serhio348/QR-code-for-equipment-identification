/**
 * beliotClient.test.ts
 *
 * Проверяет нормализацию разных форматов списка устройств Beliot.
 */

import { describe, expect, it } from 'vitest';
import { extractDevicesFromResponse } from './beliotClient.js';

describe('extractDevicesFromResponse', () => {
  it('extracts nested paginated devices', () => {
    const devices = extractDevicesFromResponse({
      data: {
        data: {
          metering_devices: {
            data: [{ device_id: 11015 }, { device_id: 11016 }],
          },
        },
      },
    });

    expect(devices).toHaveLength(2);
    expect(devices[0].device_id).toBe(11015);
  });

  it('extracts fallback abonent devices', () => {
    const devices = extractDevicesFromResponse({
      data: {
        devices_list: [{ device_id: '11363' }],
      },
    });

    expect(devices).toEqual([{ device_id: '11363' }]);
  });

  it('returns an empty list for an unknown response', () => {
    expect(extractDevicesFromResponse({ status: 'ok' })).toEqual([]);
  });
});
