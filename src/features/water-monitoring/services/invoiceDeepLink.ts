/**
 * invoiceDeepLink.ts
 *
 * Адрес счёта из push: id, либо период вместе с лицевым счётом.
 *
 * 1. invoiceNotificationPath — путь, который открывает service worker
 * 2. invoiceRequestFromSearch — тот же адрес после входа в приложение
 */

import type { InvoiceDownloadRequest } from './invoiceDownloadQuery';

const INVOICE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function invoiceNotificationPath(payload: {
    invoice_id?: unknown;
    period?: unknown;
    account_number?: unknown;
}): string {
    const id = typeof payload.invoice_id === 'string' ? payload.invoice_id.trim() : '';
    if (id) return `/water?invoice=${encodeURIComponent(id)}`;
    const period = typeof payload.period === 'string' ? payload.period.trim() : '';
    const account = typeof payload.account_number === 'string' ? payload.account_number.trim() : '';
    if (period && account) {
        return `/water?invoice=${encodeURIComponent(period)}&account=${encodeURIComponent(account)}`;
    }
    return '/water';
}

export function invoiceRequestFromSearch(search: string): InvoiceDownloadRequest | null {
    const params = new URLSearchParams(search);
    const invoice = params.get('invoice')?.trim() ?? '';
    if (!invoice) return null;
    if (INVOICE_ID.test(invoice)) return { invoiceId: invoice };
    const account = params.get('account')?.trim() ?? '';
    if (account) return { period: invoice, account };
    return null;
}
