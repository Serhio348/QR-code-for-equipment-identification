/**
 * notificationRead.ts
 *
 * Подтверждение, что прочитанность реально записалась.
 *
 * 1. assertNotificationsMarked — число обновлённых строк совпадает с запросом
 */

export function assertNotificationsMarked(requestedIds: readonly string[], updatedIds: readonly string[]): number {
    const updated = new Set(updatedIds);
    const missing = requestedIds.filter(id => !updated.has(id));
    if (missing.length > 0) {
        const error = new Error('Не все уведомления отмечены прочитанными');
        error.name = 'NotificationReadMismatchError';
        throw error;
    }
    return requestedIds.length;
}
