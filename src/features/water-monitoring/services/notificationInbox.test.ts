import { describe, expect, it } from 'vitest';
import { toastBatch } from './notificationInbox';

describe('toastBatch', () => {
    it('shows at most three new notices and skips ones already shown', () => {
        const unread = ['a', 'b', 'c', 'd'].map(id => ({ id }));
        expect(toastBatch(unread, new Set(['b'])).map(item => item.id)).toEqual(['a', 'c', 'd']);
        expect(toastBatch(unread, new Set()).map(item => item.id)).toEqual(['a', 'b', 'c']);
    });
});
