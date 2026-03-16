import { useEffect } from 'react';
import { toast } from 'react-toastify';
import {
    fetchUnreadNotifications,
    markNotificationsRead,
    type WaterNotification,
} from '../services/notificationsApi';

/**
 * Загружает непрочитанные уведомления при открытии вкладки Вода
 * и показывает их как toast. Помечает как прочитанные автоматически.
 */
export function useWaterNotifications(): void {
    useEffect(() => {
        let cancelled = false;

        async function loadAndShow() {
            const notifications = await fetchUnreadNotifications();
            if (cancelled || notifications.length === 0) return;

            const ids = notifications.map((n: WaterNotification) => n.id);

            for (const n of notifications) {
                if (n.type === 'high_consumption') {
                    toast.warning(`${n.title}\n${n.body}`, { autoClose: 10000 });
                } else if (n.type === 'tariff_change') {
                    toast.info(`${n.title}\n${n.body}`, { autoClose: 10000 });
                } else {
                    toast.success(`${n.title}\n${n.body}`, { autoClose: 8000 });
                }
            }

            markNotificationsRead(ids).catch(() => {});
        }

        loadAndShow();
        return () => { cancelled = true; };
    }, []); // только при монтировании
}