/**
 * gasLogSanitize.test.ts
 *
 * SEC-08: уязвимость — пароли/токены/base64 не должны попадать в строку лога.
 */

import { describe, expect, it } from 'vitest';
import { isSensitiveLogKey, safeJsonForLog, sanitizeForLog } from '../gasLogSanitize';

describe('SEC-08 GAS log sanitization', () => {
  it('flags password/token/secret/apiSecret keys', () => {
    expect(isSensitiveLogKey('password')).toBe(true);
    expect(isSensitiveLogKey('new_password')).toBe(true);
    expect(isSensitiveLogKey('apiSecret')).toBe(true);
    expect(isSensitiveLogKey('api_secret')).toBe(true);
    expect(isSensitiveLogKey('access_token')).toBe(true);
    expect(isSensitiveLogKey('photoBase64')).toBe(true);
    expect(isSensitiveLogKey('action')).toBe(false);
    expect(isSensitiveLogKey('email')).toBe(false);
  });

  it('redacts password and apiSecret from login-like payload', () => {
    const input = {
      action: 'login',
      email: 'user@example.com',
      password: 'SuperSecret123!',
      apiSecret: 'gas-shared-secret-value',
    };
    const sanitized = sanitizeForLog(input) as Record<string, unknown>;
    const json = safeJsonForLog(input);

    expect(sanitized.password).toBe('***');
    expect(sanitized.apiSecret).toBe('***');
    expect(sanitized.email).toBe('user@example.com');
    expect(sanitized.action).toBe('login');
    expect(json).not.toContain('SuperSecret123!');
    expect(json).not.toContain('gas-shared-secret-value');
    expect(json).toContain('***');
  });

  it('redacts document content and long base64-like strings by key and length', () => {
    const longDoc = 'A'.repeat(500);
    const input = {
      action: 'createDocument',
      name: 'passport',
      content: longDoc,
      fileData: 'YmFzZTY0...' + 'x'.repeat(200),
    };
    const json = safeJsonForLog(input);

    expect(json).not.toContain(longDoc);
    expect(json).not.toContain('YmFzZTY0');
    expect(json).toMatch(/\*\*\*/);
  });

  it('does not leak nested password fields', () => {
    const input = {
      action: 'changePassword',
      user: {
        email: 'a@b.c',
        currentPassword: 'old-pass',
        newPassword: 'new-pass',
      },
    };
    const json = safeJsonForLog(input);
    expect(json).not.toContain('old-pass');
    expect(json).not.toContain('new-pass');
    expect(json).toContain('a@b.c');
  });
});
