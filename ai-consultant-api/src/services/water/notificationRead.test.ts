import { describe, expect, it } from 'vitest';
import { assertNotificationsMarked } from './notificationRead.js';

describe('assertNotificationsMarked', () => {
    it('accepts a full update and rejects a partial one', () => {
        expect(assertNotificationsMarked(['a', 'b'], ['b', 'a'])).toBe(2);
        expect(() => assertNotificationsMarked(['a', 'b'], ['a'])).toThrow(/прочитанными/);
    });
});
