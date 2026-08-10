/**
 * invoiceSyncService.test.ts
 *
 * Unit tests for invoice sync helpers (via parse/filename behavior).
 */
import { describe, expect, it } from 'vitest';
import { parseInvoiceText } from '../invoiceParserService.js';

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
