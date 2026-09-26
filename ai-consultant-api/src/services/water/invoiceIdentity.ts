/**
 * invoiceIdentity.ts
 *
 * Счёт однозначно задаётся id или парой период + лицевой счёт.
 * Выборка только по периоду не используется: в одном месяце бывает несколько счетов.
 */

export interface InvoiceNotice {
    id: string;
    period: string;
    account_number: string | null;
    amount_byn: number | null;
    volume_m3: number | null;
    storage_path: string | null;
}

export function invoiceNoticeFromRow(row: {
    id: string;
    period: string;
    account_number?: string | null;
    amount_byn?: number | null;
    volume_m3?: number | null;
    storage_path?: string | null;
}): InvoiceNotice {
    return {
        id: row.id,
        period: row.period,
        account_number: row.account_number ?? null,
        amount_byn: row.amount_byn ?? null,
        volume_m3: row.volume_m3 ?? null,
        storage_path: row.storage_path ?? null,
    };
}

export interface InvoiceDownloadQuery {
    invoiceId?: string;
    period?: string;
    account?: string;
}

export type InvoiceDownloadLookup =
    | { ok: true; by: 'id'; invoiceId: string }
    | { ok: true; by: 'period_account'; period: string; account: string }
    | { ok: false; error: string };

export function resolveInvoiceDownload(query: InvoiceDownloadQuery): InvoiceDownloadLookup {
    const invoiceId = query.invoiceId?.trim();
    if (invoiceId) return { ok: true, by: 'id', invoiceId };
    const period = query.period?.trim() ?? '';
    const account = query.account?.trim() ?? '';
    if (period && account) return { ok: true, by: 'period_account', period, account };
    return { ok: false, error: 'Нужен id счёта или период вместе с лицевым счётом' };
}
