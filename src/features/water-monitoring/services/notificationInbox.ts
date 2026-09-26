/**
 * notificationInbox.ts
 *
 * Сколько toast показать и какие непрочитанные оставить в списке.
 *
 * 1. toastBatch — не больше трёх новых уведомлений за один опрос
 */

export const MAX_VISIBLE_TOASTS = 3;
export const NOTIFICATION_POLL_MS = 60_000;

export function toastBatch<T extends { id: string }>(
    unread: readonly T[],
    alreadyShown: ReadonlySet<string>,
    limit = MAX_VISIBLE_TOASTS,
): T[] {
    return unread.filter(item => !alreadyShown.has(item.id)).slice(0, limit);
}
