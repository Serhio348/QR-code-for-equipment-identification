import { describe, expect, it } from 'vitest';
import { classifySignOut } from './logoutOutcome';

describe('classifySignOut', () => {
    it('confirms a remote revoke, keeps a local logout, and refuses a failed local clear', () => {
        expect(classifySignOut(null, null)).toBe('remote-revoked');
        expect(classifySignOut(new Error('offline'), null)).toBe('local-only');
        expect(() => classifySignOut(new Error('offline'), new Error('storage'))).toThrow(/offline/);
    });
});
