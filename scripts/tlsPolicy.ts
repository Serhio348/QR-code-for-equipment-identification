/**
 * tlsPolicy.ts
 *
 * SEC-07: политика TLS для collector-скриптов.
 *
 * Структура / что умеет:
 * 1. ensureTlsVerificationEnabled — запрещает глобальный NODE_TLS_REJECT_UNAUTHORIZED=0
 * 2. isTlsVerificationDisabledGlobally — проверка текущего env
 */

/**
 * True, если процесс отключил проверку сертификатов для всех HTTPS.
 */
export function isTlsVerificationDisabledGlobally(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.NODE_TLS_REJECT_UNAUTHORIZED === '0';
}

/**
 * Гарантирует, что глобальная проверка TLS включена.
 * Если кто-то выставил NODE_TLS_REJECT_UNAUTHORIZED=0 — снимаем и предупреждаем.
 */
export function ensureTlsVerificationEnabled(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
    delete env.NODE_TLS_REJECT_UNAUTHORIZED;
    console.warn(
      '[SEC-07] NODE_TLS_REJECT_UNAUTHORIZED=0 сброшен: проверка TLS обязательна для всех HTTPS (включая Beliot и Supabase).',
    );
  }
}
