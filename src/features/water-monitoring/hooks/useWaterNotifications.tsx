/**
 * useWaterNotifications.tsx
 *
 * Список уведомлений на странице воды.
 * Toast показывает не больше трёх новых. Прочитанным сообщение становится
 * только после явной отметки, и только если сервер подтвердил запись.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import {
    fetchNotifications,
    markNotificationsRead,
    downloadInvoicePdf,
    type WaterNotification,
} from '../services/notificationsApi';
import { invoiceDownloadSearch, type InvoiceDownloadRequest } from '../services/invoiceDownloadQuery';
import { NOTIFICATION_POLL_MS, toastBatch } from '../services/notificationInbox';

export interface WaterNotificationInbox {
    notifications: WaterNotification[];
    error: string | null;
    markRead: (ids: string[]) => Promise<void>;
}

export function useWaterNotifications(): WaterNotificationInbox {
    const [notifications, setNotifications] = useState<WaterNotification[]>([]);
    const [error, setError] = useState<string | null>(null);
    const shownRef = useRef<Set<string>>(new Set());

    const load = useCallback(async (): Promise<void> => {
        try {
            const rows = await fetchNotifications();
            setNotifications(rows);
            setError(null);
            const unread = rows.filter(item => !item.is_read);
            for (const item of toastBatch(unread, shownRef.current)) {
                shownRef.current.add(item.id);
                showNotificationToast(item);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось загрузить уведомления');
        }
    }, []);

    useEffect(() => {
        void load();
        const timer = window.setInterval(() => { void load(); }, NOTIFICATION_POLL_MS);
        return () => window.clearInterval(timer);
    }, [load]);

    const markRead = useCallback(async (ids: string[]): Promise<void> => {
        const updated = await markNotificationsRead(ids);
        if (updated !== ids.length) {
            throw new Error('Не все уведомления отмечены прочитанными');
        }
        setNotifications(prev => prev.map(item => (
            ids.includes(item.id) ? { ...item, is_read: true } : item
        )));
        setError(null);
    }, []);

    return { notifications, error, markRead };
}

function invoiceRequestFromPayload(payload: Record<string, unknown> | undefined): InvoiceDownloadRequest {
    return {
        invoiceId: typeof payload?.invoice_id === 'string' ? payload.invoice_id : undefined,
        period: typeof payload?.period === 'string' ? payload.period : undefined,
        account: typeof payload?.account_number === 'string' ? payload.account_number : undefined,
    };
}

function showNotificationToast(item: WaterNotification): void {
    if (item.type === 'new_invoice') {
        showInvoiceToast(item);
        return;
    }
    const text = `${item.title}\n${item.body}`;
    if (item.type === 'high_consumption') {
        toast.warning(text, { autoClose: 10000 });
    } else if (item.type === 'tariff_change') {
        toast.info(text, { autoClose: 10000 });
    } else {
        toast.success(text, { autoClose: 8000 });
    }
}

function showInvoiceToast(item: WaterNotification): void {
    const request = invoiceRequestFromPayload(item.payload);
    const canOpen = invoiceDownloadSearch(request) !== null;
    const openPdf = async () => {
        const blob = await downloadInvoicePdf(request);
        if (!blob) {
            toast.error('Не удалось получить счёт');
            return;
        }
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener,noreferrer');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
    };

    toast.success(
        ({ closeToast }) => (
            <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{item.title}</div>
                <div style={{ fontSize: 13, marginBottom: canOpen ? 8 : 0 }}>{item.body}</div>
                {canOpen && (
                    <button
                        type="button"
                        onClick={() => { void openPdf(); closeToast?.(); }}
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
        { autoClose: 12000 },
    );
}
