/**
 * memoryTools.test.ts
 *
 * SEC-06: права записи/чтения памяти через tools.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/ai/agentMemoryService.js', () => ({
  saveSharedFact: vi.fn(async () => undefined),
  savePersonalFact: vi.fn(async () => undefined),
  loadFactsForUser: vi.fn(async () => []),
  deactivateFactForUser: vi.fn(async () => undefined),
}));

import {
  saveSharedFact,
  savePersonalFact,
  loadFactsForUser,
  deactivateFactForUser,
} from '../services/ai/agentMemoryService.js';
import { runWithToolContext } from '../services/ai/toolContext.js';
import { executeMemoryTool } from './memoryTools.js';

const saveShared = vi.mocked(saveSharedFact);
const savePersonal = vi.mocked(savePersonalFact);
const loadForUser = vi.mocked(loadFactsForUser);
const deactivate = vi.mocked(deactivateFactForUser);

beforeEach(() => {
  saveShared.mockClear();
  savePersonal.mockClear();
  loadForUser.mockClear();
  deactivate.mockClear();
});

describe('executeMemoryTool (SEC-06)', () => {
  it('saves preference as personal for any user', async () => {
    const result = await runWithToolContext(
      {
        userId: 'u1',
        appAccess: { equipment: true, water: false, isAdmin: false },
      },
      () =>
        executeMemoryTool('save_memory', {
          category: 'preference',
          key: 'style',
          value: 'Кратко',
        }),
    );

    expect(savePersonal).toHaveBeenCalledWith('u1', 'preference', 'style', 'Кратко', undefined);
    expect(saveShared).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: true, scope: 'personal' });
  });

  it('rejects shared save for non-admin', async () => {
    const result = await runWithToolContext(
      {
        userId: 'u1',
        appAccess: { equipment: true, water: true, isAdmin: false },
      },
      () =>
        executeMemoryTool('save_memory', {
          category: 'tariff',
          key: 'tariff_water',
          value: '2 BYN',
        }),
    );

    expect(saveShared).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: false });
  });

  it('allows shared save for admin', async () => {
    const result = await runWithToolContext(
      {
        userId: 'admin1',
        appAccess: { equipment: true, water: true, isAdmin: true },
      },
      () =>
        executeMemoryTool('save_memory', {
          category: 'contact',
          key: 'dispatcher',
          value: '+375...',
        }),
    );

    expect(saveShared).toHaveBeenCalledWith(
      'contact',
      'dispatcher',
      '+375...',
      undefined,
      'admin1',
    );
    expect(result).toMatchObject({ success: true, scope: 'shared' });
  });

  it('loads facts for current user only', async () => {
    loadForUser.mockResolvedValueOnce([
      {
        category: 'tariff',
        key: 'tariff_water',
        value: '1.8',
        scope: 'shared',
      },
    ]);

    await runWithToolContext(
      {
        userId: 'u1',
        appAccess: { equipment: false, water: false, isAdmin: false },
      },
      () => executeMemoryTool('get_memory', {}),
    );

    expect(loadForUser).toHaveBeenCalledWith('u1', undefined);
  });

  it('deletes with actor permissions', async () => {
    await runWithToolContext(
      {
        userId: 'u1',
        appAccess: { equipment: true, water: true, isAdmin: false },
      },
      () => executeMemoryTool('delete_memory', { key: 'style' }),
    );

    expect(deactivate).toHaveBeenCalledWith('style', {
      userId: 'u1',
      isAdmin: false,
    });
  });
});
