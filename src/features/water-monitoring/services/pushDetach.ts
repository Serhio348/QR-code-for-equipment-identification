/**
 * pushDetach.ts
 *
 * Снимает push этого браузера перед выходом, чтобы следующий аккаунт
 * не получал чужие уведомления.
 */

import { unsubscribeFromPush } from './notificationsApi';

export async function detachBrowserPush(): Promise<void> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    if (!existing) return;

    let serverError: unknown = null;
    try {
        await unsubscribeFromPush(existing.endpoint);
    } catch (error) {
        serverError = error;
    }
    await existing.unsubscribe();
    if (serverError) throw serverError instanceof Error ? serverError : new Error('Не удалось отвязать уведомления');
}
