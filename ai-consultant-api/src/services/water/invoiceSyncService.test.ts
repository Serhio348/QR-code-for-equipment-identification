/**
 * invoiceSyncService.test.ts
 *
 * Unit tests for invoice sync helpers (via parse/filename behavior).
 */
import { describe, expect, it } from 'vitest';
import { parseInvoiceText } from '../invoiceParserService.js';
import { isDownloadableInvoice } from './invoiceSyncService.js';

describe('parseInvoiceText account/period fallbacks', () => {
    it('extracts account number from filename when PDF text has none', () => {
        const parsed = parseInvoiceText('Итого к оплате 10.00', '107.00-2026-07.pdf');
        expect(parsed.account_number).toBe('107.00');
        expect(parsed.period).toBe('2026-07');
    });

    it('keeps account from PDF text over filename', () => {
        const parsed = parseInvoiceText(
            'по лиц.счету No 107. 09\nИтого к оплате 12.50',
            '107.00-2026-07.pdf'
        );
        expect(parsed.account_number).toBe('107.09');
    });
});

describe('isDownloadableInvoice', () => {
    it('accepts pdf filenames and account-period labels', () => {
        expect(isDownloadableInvoice({
            fileType: 'pdf',
            title: '107.00-2026-07.pdf',
            downloadUrl: '/index.php/foo',
        })).toBe(true);
        expect(isDownloadableInvoice({
            fileType: 'file',
            title: '107.09-2026-06',
            downloadUrl: '/index.php/bar',
        })).toBe(true);
    });

    it('rejects portal navigation links even if marked as pdf', () => {
        expect(isDownloadableInvoice({
            fileType: 'pdf',
            title: 'Выставленные счета',
            downloadUrl: '/index.php/spisok-schetov-faktur',
        })).toBe(false);
        expect(isDownloadableInvoice({
            fileType: 'pdf',
            title: 'Вывод счетов-фактур',
            downloadUrl: '/index.php/vyvod',
        })).toBe(false);
    });
});
