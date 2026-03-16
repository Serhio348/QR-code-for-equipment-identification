import { useEffect } from 'react';
import { subscribeToPush, getVapidPublicKey } from '../services/notificationsApi';

/** Конвертирует base64url VAPID ключ в Uint8Array для pushManager.subscribe */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return new Uint8Array([...rawData].map(c => c.charCodeAt(0))) as unknown as Uint8Array;
}

/**
 * Регистрирует Web Push подписку устройства.
 * Запрашивает разрешение у пользователя, затем отправляет подписку на бэкенд.
 * Вызывается один раз при открытии вкладки Вода.
 */
export function usePushSubscription(): void {
    useEffect(() => {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
        if (Notification.permission === 'denied') return;

        async function subscribe() {
            try {
                const registration = await navigator.serviceWorker.ready;

                // Если подписка уже есть — переотправляем на бэкенд (идемпотентно)
                const existing = await registration.pushManager.getSubscription();
                if (existing) {
                    await subscribeToPush(existing).catch(() => {});
                    return;
                }

                // Получаем VAPID публичный ключ с бэкенда
                const vapidKey = await getVapidPublicKey();
                if (!vapidKey) return;

                // Запрашиваем разрешение
                const permission = await Notification.requestPermission();
                if (permission !== 'granted') return;

                const subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as ArrayBuffer,
                });

                await subscribeToPush(subscription).catch(() => {});
            } catch {
                // silent fail — push не критичен
            }
        }

        subscribe();
    }, []);
}