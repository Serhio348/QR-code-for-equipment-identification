/**
 * gasLogSanitize.ts
 *
 * SEC-08: эталон алгоритма маскирования для логов GAS (зеркало Utils.gs).
 * Тесты гоняют эту копию; при изменении синхронизировать Utils.gs.
 */

const BLOCKED_KEYS = new Set([
  'password',
  'currentpassword',
  'newpassword',
  'confirmpassword',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'bearertoken',
  'authorization',
  'authtoken',
  'apisecret',
  'secret',
  'cookie',
  'cookies',
  'session',
  'content',
  'filecontent',
  'filedata',
  'base64',
  'photobase64',
  'rawbody',
  'body',
]);

export function isSensitiveLogKey(key: string): boolean {
  const normalized = String(key || '')
    .toLowerCase()
    .replace(/[_-]/g, '');
  if (BLOCKED_KEYS.has(normalized)) {
    return true;
  }
  return (
    normalized.includes('password') ||
    normalized.includes('token') ||
    normalized.includes('secret') ||
    normalized.includes('base64')
  );
}

export function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (depth > 6) {
    return '[MaxDepth]';
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    if (value.length > 120) {
      return `[redacted ${value.length} chars]`;
    }
    return value;
  }
  if (typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    const max = Math.min(value.length, 20);
    const arr = value.slice(0, max).map((item) => sanitizeForLog(item, depth + 1));
    if (value.length > max) {
      arr.push(`[+${value.length - max} items]`);
    }
    return arr;
  }

  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveLogKey(key)) {
      out[key] = '***';
      const len = raw === null || raw === undefined ? 0 : String(raw).length;
      if (len > 0) {
        out[`${key}_len`] = len;
      }
    } else {
      out[key] = sanitizeForLog(raw, depth + 1);
    }
  }
  return out;
}

export function safeJsonForLog(value: unknown): string {
  try {
    return JSON.stringify(sanitizeForLog(value));
  } catch {
    return '[unserializable]';
  }
}
