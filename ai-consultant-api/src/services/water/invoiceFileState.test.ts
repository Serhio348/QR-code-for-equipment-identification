import { describe, expect, it } from 'vitest';
import { invoiceFileKey, invoicePdfAction, nextStoragePath } from './invoiceFileState.js';

describe('invoice PDF recovery', () => {
    it('retries an incremental import after a failed upload and then skips the stored file', () => {
        const files = new Map<string, string | null>();
        const period = '2026-07';
        const account = '107.00';
        const key = invoiceFileKey(period, account);

        expect(invoicePdfAction(files, period, account, false)).toBe('import');
        files.set(key, nextStoragePath(null, null));
        expect(invoicePdfAction(files, period, account, false)).toBe('import');

        files.set(key, nextStoragePath(null, 'invoices/107.00/2026-07.pdf'));
        expect(invoicePdfAction(files, period, account, false)).toBe('skip');
    });

    it('keeps the previous storage path when a later upload fails', () => {
        const previous = 'invoices/107.00/2026-07.pdf';
        expect(nextStoragePath(previous, null)).toBe(previous);
        expect(invoicePdfAction(new Map([[invoiceFileKey('2026-07', '107.00'), previous]]), '2026-07', '107.00', true)).toBe('import');
    });
});
