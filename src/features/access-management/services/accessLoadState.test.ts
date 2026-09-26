import { describe, expect, it } from 'vitest';
import { guardDecision, menuAccessView, profileQueryOutcome } from './accessLoadState';

describe('menuAccessView', () => {
  it('keeps a network failure separate from a real denial and a missing profile', () => {
    expect(menuAccessView({
      loading: false,
      accessError: 'Failed to fetch',
      profileMissing: false,
      appCount: 0,
    })).toBe('error');

    expect(menuAccessView({
      loading: false,
      accessError: null,
      profileMissing: true,
      appCount: 0,
    })).toBe('profile-missing');

    expect(menuAccessView({
      loading: false,
      accessError: null,
      profileMissing: false,
      appCount: 0,
    })).toBe('denied');
  });
});

describe('guardDecision', () => {
  it('stays closed on both denial and a failed check', () => {
    expect(guardDecision({ checking: false, failed: true, hasAccess: false })).toBe('error');
    expect(guardDecision({ checking: false, failed: false, hasAccess: false })).toBe('denied');
    expect(guardDecision({ checking: false, failed: false, hasAccess: true })).toBe('allowed');
  });
});

describe('profileQueryOutcome', () => {
  it('treats a missing row differently from any other database error', () => {
    expect(profileQueryOutcome({ code: 'PGRST116' })).toBe('missing');
    expect(profileQueryOutcome({ code: 'PGRST000' })).toBe('failed');
    expect(profileQueryOutcome(null)).toBe('ok');
  });
});
