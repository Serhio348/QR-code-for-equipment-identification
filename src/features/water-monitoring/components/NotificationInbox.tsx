/**
 * NotificationInbox.tsx
 *
 * История уведомлений воды. Прочтение только по кнопке.
 */

import { useState } from 'react';
import { toast } from 'react-toastify';
import { downloadInvoicePdf, type WaterNotification } from '../services/notificationsApi';
import { invoiceDownloadSearch, type InvoiceDownloadRequest } from '../services/invoiceDownloadQuery';
import type { WaterNotificationInbox } from '../hooks/useWaterNotifications';
import './NotificationInbox.css';

interface NotificationInboxProps {
    inbox: WaterNotificationInbox;
}

function invoiceRequest(payload: Record<string, unknown> | undefined): InvoiceDownloadRequest {
    return {
        invoiceId: typeof payload?.invoice_id === 'string' ? payload.invoice_id : undefined,
        period: typeof payload?.period === 'string' ? payload.period : undefined,
        account: typeof payload?.account_number === 'string' ? payload.account_number : undefined,
    };
}

export default function NotificationInbox({ inbox }: NotificationInboxProps) {
    const [open, setOpen] = useState(false);
    const [pendingId, setPendingId] = useState<string | null>(null);
    const unread = inbox.notifications.filter(item => !item.is_read).length;

    const markOne = async (id: string): Promise<void> => {
        setPendingId(id);
        try {
            await inbox.markRead([id]);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Не удалось отметить уведомление');
        } finally {
            setPendingId(null);
        }
    };

    const openInvoice = async (item: WaterNotification): Promise<void> => {
        const blob = await downloadInvoicePdf(invoiceRequest(item.payload));
        if (!blob) {
            toast.error('Не удалось получить счёт');
            return;
        }
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener,noreferrer');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
    };

    return (
        <section className="notification-inbox">
            <button
                type="button"
                className="notification-inbox__toggle"
                aria-expanded={open}
                onClick={() => setOpen(value => !value)}
            >
                Уведомления{unread > 0 ? ` (${unread})` : ''}
            </button>
            {inbox.error && <p className="notification-inbox__error" role="alert">{inbox.error}</p>}
            {open && (
                <ul className="notification-inbox__list">
                    {inbox.notifications.length === 0 && <li>Пока нет уведомлений.</li>}
                    {inbox.notifications.map(item => {
                        const canOpen = invoiceDownloadSearch(invoiceRequest(item.payload)) !== null;
                        return (
                            <li key={item.id} className={item.is_read ? 'is-read' : 'is-unread'}>
                                <p className="notification-inbox__title">{item.title}</p>
                                <p>{item.body}</p>
                                <div className="notification-inbox__actions">
                                    {!item.is_read && (
                                        <button type="button" disabled={pendingId === item.id} onClick={() => { void markOne(item.id); }}>
                                            Прочитано
                                        </button>
                                    )}
                                    {canOpen && (
                                        <button type="button" onClick={() => { void openInvoice(item); }}>
                                            Открыть счёт
                                        </button>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}
