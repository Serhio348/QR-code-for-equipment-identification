import { describe, expect, it } from 'vitest';
import { leaveDecision, maintenanceDraftIsDirty } from './leaveDecision';

describe('leaveDecision', () => {
    it('blocks a close while saving and asks before dropping a draft', () => {
        expect(leaveDecision({ dirty: true, saving: true })).toBe('block');
        expect(leaveDecision({ dirty: true, saving: false })).toBe('confirm');
        expect(leaveDecision({ dirty: false, saving: false })).toBe('allow');
    });
});

describe('maintenanceDraftIsDirty', () => {
    it('ignores the default empty entry and notices typed text or files', () => {
        expect(maintenanceDraftIsDirty({
            type: '',
            description: '',
            performedBy: '',
            fileCount: 0,
            editing: false,
        })).toBe(false);
        expect(maintenanceDraftIsDirty({
            type: '',
            description: 'Замена',
            performedBy: '',
            fileCount: 0,
            editing: false,
        })).toBe(true);
    });
});
