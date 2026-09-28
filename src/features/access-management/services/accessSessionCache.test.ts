import { describe, expect, it } from 'vitest';
import {
  clearAccessSession,
  readAccessSession,
  writeAccessSession,
} from './accessSessionCache';
import type { UserAppAccess } from '../types/access';

const access: UserAppAccess = {
  email: 'user@example.com',
  userId: 'user-1',
  equipment: true,
  water: true,
  updatedAt: '2026-09-28T00:00:00.000Z',
};

describe('accessSessionCache', () => {
  it('remembers rights for the same email and forgets them on logout', () => {
    clearAccessSession();
    expect(readAccessSession('user@example.com')).toBeUndefined();

    writeAccessSession(' User@Example.com ', access);
    expect(readAccessSession('user@example.com')).toEqual(access);

    clearAccessSession();
    expect(readAccessSession('user@example.com')).toBeUndefined();
  });
});
