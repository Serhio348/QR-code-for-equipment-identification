import { useEffect } from 'react';
import { toast } from 'react-toastify';
import {
    fetchUnreadNotifications,
    markNotificationsRead,
    downloadInvoicePdf,
    type WaterNotification,
} from '../services/notificationsApi';
import { invoiceDownloadSearch, type InvoiceDownloadRequest } from '../services/invoiceDownloadQuery';

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
                    showInvoiceToast(n);
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

function invoiceRequestFromPayload(payload: Record<string, unknown> | undefined): InvoiceDownloadRequest {
    return {
        invoiceId: typeof payload?.invoice_id === 'string' ? payload.invoice_id : undefined,
        period: typeof payload?.period === 'string' ? payload.period : undefined,
        account: typeof payload?.account_number === 'string' ? payload.account_number : undefined,
    };
}

function showInvoiceToast(n: WaterNotification): void {
    const request = invoiceRequestFromPayload(n.payload);
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
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{n.title}</div>
                <div style={{ fontSize: 13, marginBottom: canOpen ? 8 : 0 }}>{n.body}</div>
                {canOpen && (
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
