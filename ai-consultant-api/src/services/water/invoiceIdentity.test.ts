import { describe, expect, it } from 'vitest';
import { invoiceNoticeFromRow, resolveInvoiceDownload } from './invoiceIdentity.js';

describe('resolveInvoiceDownload', () => {
    it('rejects a period without an account', () => {
        expect(resolveInvoiceDownload({ period: '2026-07' })).toEqual({
            ok: false,
            error: 'Нужен id счёта или период вместе с лицевым счётом',
        });
    });

    it('keeps two accounts in the same month distinct', () => {
        const first = invoiceNoticeFromRow({
            id: 'invoice-a',
            period: '2026-07',
            account_number: '107.00',
            amount_byn: 10,
            volume_m3: 4,
        });
        const second = invoiceNoticeFromRow({
            id: 'invoice-b',
            period: '2026-07',
            account_number: '107.09',
            amount_byn: 22,
            volume_m3: 9,
        });

        expect(resolveInvoiceDownload({ invoiceId: second.id })).toEqual({
            ok: true,
            by: 'id',
            invoiceId: 'invoice-b',
        });
        expect(resolveInvoiceDownload({ period: first.period, account: first.account_number ?? '' })).toEqual({
            ok: true,
            by: 'period_account',
            period: '2026-07',
            account: '107.00',
        });
        expect(first.id).not.toBe(second.id);
    });
});
