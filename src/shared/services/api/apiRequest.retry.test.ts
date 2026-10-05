import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from './apiRequest';

vi.mock('@/shared/config/api', () => ({
  API_CONFIG: {
    EQUIPMENT_API_URL: 'https://example.test/exec',
    TIMEOUT: 1000,
    MAX_RETRIES: 1,
    RETRY_DELAY: 0,
  },
}));

function driveNotFoundPage(): Response {
  return {
    ok: false,
    status: 404,
    statusText: 'Not Found',
    text: async () => '<!DOCTYPE html><html><p>Не удалось открыть файл.</p></html>',
    json: async () => {
      throw new Error('not json');
    },
  } as unknown as Response;
}

describe('apiRequest google file page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('retries when Google returns the file-not-found page', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(driveNotFoundPage())
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: [{ id: 'equip-a' }] }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiRequest<Array<{ id: string }>>('getAll');

    expect(result.data).toEqual([{ id: 'equip-a' }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports a short message instead of the html page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(driveNotFoundPage()));

    await expect(apiRequest('getAll')).rejects.toThrow(/Google не открыл файл/);
    try {
      await apiRequest('getAll');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain('DOCTYPE');
    }
  });
});
