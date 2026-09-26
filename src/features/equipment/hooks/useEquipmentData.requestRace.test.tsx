import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Equipment } from '../types/equipment';
import { getEquipmentById } from '../services/equipmentApi';
import { clearEquipmentCache, useEquipmentData } from './useEquipmentData';

vi.mock('../services/equipmentApi', () => ({
  getEquipmentById: vi.fn(),
  getAllEquipment: vi.fn(),
}));

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function equipment(id: string, name: string): Equipment {
  return {
    id,
    name,
    type: 'pump',
    specs: {},
    googleDriveUrl: '',
    qrCodeUrl: '',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('useEquipmentData request race', () => {
  beforeEach(() => {
    clearEquipmentCache();
    vi.mocked(getEquipmentById).mockReset();
  });

  it('keeps B when the request for A finishes later', async () => {
    const pumpA = deferred<Equipment | null>();
    const pumpB = deferred<Equipment | null>();
    vi.mocked(getEquipmentById).mockImplementation((id: string) => {
      if (id === 'equip-a') return pumpA.promise;
      if (id === 'equip-b') return pumpB.promise;
      return Promise.resolve(null);
    });

    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useEquipmentData(id),
      { initialProps: { id: 'equip-a' } },
    );
    await waitFor(() => expect(getEquipmentById).toHaveBeenCalledWith('equip-a'));

    rerender({ id: 'equip-b' });
    await waitFor(() => expect(getEquipmentById).toHaveBeenCalledWith('equip-b'));

    await act(async () => {
      pumpB.resolve(equipment('equip-b', 'Насос B'));
    });
    await waitFor(() => {
      expect(result.current.data).toMatchObject({ id: 'equip-b', name: 'Насос B' });
    });

    await act(async () => {
      pumpA.resolve(equipment('equip-a', 'Насос A'));
    });

    expect(result.current.data).toMatchObject({ id: 'equip-b', name: 'Насос B' });
    expect(result.current.error).toBeNull();
  });

  it('ignores an error from the previous equipment request', async () => {
    const pumpA = deferred<Equipment | null>();
    const pumpB = deferred<Equipment | null>();
    vi.mocked(getEquipmentById).mockImplementation((id: string) => {
      if (id === 'equip-a') return pumpA.promise;
      if (id === 'equip-b') return pumpB.promise;
      return Promise.resolve(null);
    });

    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useEquipmentData(id),
      { initialProps: { id: 'equip-a' } },
    );
    await waitFor(() => expect(getEquipmentById).toHaveBeenCalledWith('equip-a'));

    rerender({ id: 'equip-b' });
    await waitFor(() => expect(getEquipmentById).toHaveBeenCalledWith('equip-b'));

    await act(async () => {
      pumpB.resolve(equipment('equip-b', 'Насос B'));
    });
    await waitFor(() => {
      expect(result.current.data).toMatchObject({ id: 'equip-b' });
    });

    await act(async () => {
      pumpA.reject(new Error('старый сбой'));
    });

    expect(result.current.data).toMatchObject({ id: 'equip-b', name: 'Насос B' });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
