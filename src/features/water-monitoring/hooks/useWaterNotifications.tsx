import { useEffect } from 'react';
import { toast } from 'react-toastify';
import {
    fetchUnreadNotifications,
    markNotificationsRead,
    getInvoiceSignedUrl,
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
                if (n.type === 'new_invoice') {
                    const period = n.payload?.period as string | undefined;
                    showInvoiceToast(n, period);
                } else if (n.type === 'high_consumption') {
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

function showInvoiceToast(n: WaterNotification, period: string | undefined): void {
    const openPdf = async () => {
        if (!period) return;
        const url = await getInvoiceSignedUrl(period);
        if (url) {
            window.open(url, '_blank', 'noopener,noreferrer');
        } else {
            toast.error('Не удалось получить ссылку на счёт');
        }
    };

    toast.success(
        ({ closeToast }) => (
            <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{n.title}</div>
                <div style={{ fontSize: 13, marginBottom: period ? 8 : 0 }}>{n.body}</div>
                {period && (
                    <button
                        onClick={() => { openPdf(); closeToast?.(); }}
                        style={{
                            background: 'none',
                            border: '1px solid currentColor',
                            borderRadius: 4,
                            padding: '2px 10px',
                            cursor: 'pointer',
                            fontSize: 12,
                            color: 'inherit',
                        }}
                    >
                        Открыть счёт
                    </button>
                )}
            </div>
        ),
        { autoClose: 12000 }
    );
}
