import { describe, expect, it } from 'vitest';
import { notificationEventKey, syncLockDecision } from './notificationEventKey.js';

describe('notificationEventKey', () => {
  it('stays the same when the same invoice is processed again', () => {
    const payload = { invoice_id: 'abc', period: '2026-09', account_number: '107.00' };
    expect(notificationEventKey('new_invoice', 'user-1', payload))
      .toBe(notificationEventKey('new_invoice', 'user-1', payload));
    expect(notificationEventKey('new_invoice', 'user-2', payload))
      .not.toBe(notificationEventKey('new_invoice', 'user-1', payload));
  });
});

describe('syncLockDecision', () => {
  it('lets one fresh run proceed and takes over a stale lock', () => {
    const now = Date.parse('2026-09-27T12:00:00Z');
    expect(syncLockDecision(null, now, 60_000)).toBe('insert');
    expect(syncLockDecision('2026-09-27T11:59:30Z', now, 60_000)).toBe('busy');
    expect(syncLockDecision('2026-09-27T10:00:00Z', now, 60_000)).toBe('takeover');
  });
});
