/**
 * usePushSubscription.ts
 *
 * Включение push только по кнопке. При открытии раздела разрешение не запрашивается.
 */

import { useCallback, useEffect, useState } from 'react';
import { getVapidPublicKey, subscribeToPush } from '../services/notificationsApi';
import { detachBrowserPush } from '../services/pushDetach';
import { pushUiState, type PushUiState } from '../services/pushSubscriptionState';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return new Uint8Array([...rawData].map(char => char.charCodeAt(0)));
}

export interface PushSubscriptionControls {
    state: PushUiState;
    error: string | null;
    enable: () => Promise<void>;
    disable: () => Promise<void>;
}

export function usePushSubscription(): PushSubscriptionControls {
    const [supported, setSupported] = useState(false);
    const [permission, setPermission] = useState<NotificationPermission | 'unknown'>('unknown');
    const [subscribed, setSubscribed] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const available = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
        setSupported(available);
        if (!available) return;
        setPermission(Notification.permission);
        navigator.serviceWorker.ready.then(async (registration) => {
            const existing = await registration.pushManager.getSubscription();
            setSubscribed(existing !== null);
        }).catch((err: unknown) => {
            setError(err instanceof Error ? err.message : 'Не удалось прочитать подписку');
        });
    }, []);

    const enable = useCallback(async (): Promise<void> => {
        setError(null);
        try {
            const nextPermission = await Notification.requestPermission();
            setPermission(nextPermission);
            if (nextPermission !== 'granted') {
                if (nextPermission === 'denied') {
                    setError('Браузер запретил уведомления. Разрешите их в настройках сайта.');
                }
                return;
            }
            const vapidKey = await getVapidPublicKey();
            if (!vapidKey) throw new Error('Сервер не выдал ключ для уведомлений');
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
            });
            await subscribeToPush(subscription);
            setSubscribed(true);
        } catch (err) {
            setSubscribed(false);
            setError(err instanceof Error ? err.message : 'Не удалось включить уведомления');
        }
    }, []);

    const disable = useCallback(async (): Promise<void> => {
        setError(null);
        try {
            await detachBrowserPush();
            setSubscribed(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось отключить уведомления');
        }
    }, []);

    return {
        state: pushUiState({ supported, permission, subscribed, error }),
        error,
        enable,
        disable,
    };
}
