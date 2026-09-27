/**
 * notificationEventKey.ts
 *
 * Один ключ на пользователя и бизнес-событие, чтобы повторный sync
 * не создавал второе уведомление.
 */

export function notificationEventKey(
  type: string,
  userId: string,
  payload: Record<string, unknown>,
): string {
  const invoiceId = typeof payload.invoice_id === 'string' ? payload.invoice_id.trim() : '';
  const period = typeof payload.period === 'string' ? payload.period.trim() : '';
  const account = typeof payload.account_number === 'string' ? payload.account_number.trim() : '';
  const subject = invoiceId || `${period}|${account}`;
  return `${type}:${userId}:${subject}`;
}

export function syncLockDecision(
  startedAt: string | null,
  nowMs: number,
  staleMs: number,
): 'insert' | 'busy' | 'takeover' {
  if (!startedAt) return 'insert';
  const started = Date.parse(startedAt);
  if (!Number.isFinite(started) || nowMs - started > staleMs) return 'takeover';
  return 'busy';
}
