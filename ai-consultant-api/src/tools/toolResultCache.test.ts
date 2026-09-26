import { beforeEach, describe, expect, it } from 'vitest';
import { runWithToolContext } from '../services/ai/toolContext.js';
import type { UserAppAccess } from '../services/ai/userAppAccessService.js';
import {
    clearToolCache,
    noteToolWrite,
    readCachedTool,
    storeCachedTool,
    toolCacheSize,
} from './toolResultCache.js';

const equipmentOnly: UserAppAccess = { equipment: true, water: false, isAdmin: false };
const waterOnly: UserAppAccess = { equipment: false, water: true, isAdmin: false };
const input = { query: 'насос' };

describe('toolResultCache', () => {
    beforeEach(() => {
        clearToolCache();
    });

    it('does not reuse a read across users or access scopes', async () => {
        await runWithToolContext({ userId: 'user-a', appAccess: equipmentOnly }, async () => {
            storeCachedTool('get_memory', input, { facts: ['a'] });
            expect(readCachedTool('get_memory', input)).toEqual({ hit: true, result: { facts: ['a'] } });
        });

        await runWithToolContext({ userId: 'user-b', appAccess: equipmentOnly }, async () => {
            expect(readCachedTool('get_memory', input)).toEqual({ hit: false });
        });

        await runWithToolContext({ userId: 'user-a', appAccess: waterOnly }, async () => {
            expect(readCachedTool('get_memory', input)).toEqual({ hit: false });
        });
    });

    it('drops the cached read after the matching write', async () => {
        await runWithToolContext({ userId: 'user-a', appAccess: waterOnly }, async () => {
            storeCachedTool('get_invoices', { account: '1' }, [{ id: 'old' }]);
            storeCachedTool('get_memory', input, { facts: ['keep'] });
            noteToolWrite('save_invoice');
            expect(readCachedTool('get_invoices', { account: '1' })).toEqual({ hit: false });
            expect(readCachedTool('get_memory', input)).toEqual({ hit: true, result: { facts: ['keep'] } });
        });
    });

    it('removes expired rows and keeps the cache bounded', async () => {
        await runWithToolContext({ userId: 'user-a', appAccess: equipmentOnly }, async () => {
            storeCachedTool('get_all_equipment', { q: 'old' }, ['old'], 0);
            storeCachedTool('get_all_equipment', { q: 'new' }, ['new'], 5 * 60 * 1000 + 1);
            expect(readCachedTool('get_all_equipment', { q: 'old' }, 5 * 60 * 1000 + 1)).toEqual({ hit: false });
            expect(toolCacheSize()).toBe(1);

            for (let index = 0; index < 205; index += 1) {
                storeCachedTool('get_equipment_details', { id: String(index) }, index, 10_000);
            }
            expect(toolCacheSize()).toBeLessThanOrEqual(200);
            expect(readCachedTool('get_equipment_details', { id: '0' }, 10_000)).toEqual({ hit: false });
            expect(readCachedTool('get_equipment_details', { id: '204' }, 10_000)).toEqual({ hit: true, result: 204 });
        });
    });
});
