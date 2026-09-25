/**
 * tlsPolicy.test.ts
 *
 * SEC-07: тесты на уязвимость TLS.
 * 1. Глобальный NODE_TLS_REJECT_UNAUTHORIZED=0 детектится и сбрасывается
 * 2. Недоверенный/просроченный сертификат отвергается
 * 3. Beliot проходит строгую проверку (handshake OK)
 */

import { describe, expect, it } from 'vitest';
import {
  ensureTlsVerificationEnabled,
  isTlsVerificationDisabledGlobally,
} from '../tlsPolicy';

describe('SEC-07 TLS policy', () => {
  it('detects global TLS verification disable as insecure', () => {
    expect(
      isTlsVerificationDisabledGlobally({ NODE_TLS_REJECT_UNAUTHORIZED: '0' }),
    ).toBe(true);
    expect(
      isTlsVerificationDisabledGlobally({ NODE_TLS_REJECT_UNAUTHORIZED: '1' }),
    ).toBe(false);
    expect(isTlsVerificationDisabledGlobally({})).toBe(false);
  });

  it('ensureTlsVerificationEnabled clears NODE_TLS_REJECT_UNAUTHORIZED=0', () => {
    const env: NodeJS.ProcessEnv = { NODE_TLS_REJECT_UNAUTHORIZED: '0' };
    ensureTlsVerificationEnabled(env);
    expect(env.NODE_TLS_REJECT_UNAUTHORIZED).toBeUndefined();
    expect(isTlsVerificationDisabledGlobally(env)).toBe(false);
  });

  it('does not introduce NODE_TLS_REJECT_UNAUTHORIZED when already secure', () => {
    const env: NodeJS.ProcessEnv = {};
    ensureTlsVerificationEnabled(env);
    expect(env.NODE_TLS_REJECT_UNAUTHORIZED).toBeUndefined();
  });

  it('rejects HTTPS to an untrusted/expired certificate host', async () => {
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;

    let failed = false;
    let detail = '';
    try {
      await fetch('https://expired.badssl.com/', {
        signal: AbortSignal.timeout(15000),
      });
    } catch (err) {
      failed = true;
      const e = err as Error & { cause?: { code?: string } };
      detail = `${e.cause?.code ?? ''} ${e.message}`;
    }

    expect(failed).toBe(true);
    expect(detail).toMatch(/CERT|TLS|SSL|unable to verify|certificate|UNABLE_TO_VERIFY/i);
  }, 20000);

  it('accepts Beliot API host with strict TLS verification', async () => {
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    const response = await fetch('https://beliot.by:4443/api', {
      signal: AbortSignal.timeout(15000),
    });
    // Любой HTTP-статус = успешный TLS handshake при включённой проверке
    expect(response.status).toBeGreaterThanOrEqual(100);
  }, 20000);
});
