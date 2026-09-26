import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getEquipmentById } from './equipmentQueries';

vi.mock('@/shared/config/api', () => ({
  API_CONFIG: {
    EQUIPMENT_API_URL: 'https://example.test/exec',
    TIMEOUT: 1000,
  },
}));

describe('getEquipmentById', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when the record is absent and throws when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: null }),
    }));
    await expect(getEquipmentById('missing')).resolves.toBeNull();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ success: false, error: 'down' }),
    }));
    await expect(getEquipmentById('offline')).rejects.toThrow(/503/);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Failed to fetch')));
    await expect(getEquipmentById('offline')).rejects.toThrow(/Failed to fetch/);
  });
});
