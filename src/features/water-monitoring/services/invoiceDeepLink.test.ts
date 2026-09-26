import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { invoiceNotificationPath, invoiceRequestFromSearch } from './invoiceDeepLink';

const invoiceId = '550e8400-e29b-41d4-a716-446655440000';

describe('invoiceNotificationPath', () => {
    it('prefers the invoice id and does not open a period on its own', () => {
        expect(invoiceNotificationPath({
            invoice_id: invoiceId,
            period: '2026-01',
        })).toBe(`/water?invoice=${invoiceId}`);
        expect(invoiceNotificationPath({ period: '2026-01' })).toBe('/water');
        expect(invoiceNotificationPath({
            period: '2026-01',
            account_number: '100',
        })).toBe('/water?invoice=2026-01&account=100');
    });
});

describe('invoiceRequestFromSearch', () => {
    it('keeps the id through the query string and rejects a period without an account', () => {
        expect(invoiceRequestFromSearch(`?invoice=${invoiceId}`)).toEqual({ invoiceId });
        expect(invoiceRequestFromSearch('?invoice=2026-01&account=100')).toEqual({
            period: '2026-01',
            account: '100',
        });
        expect(invoiceRequestFromSearch('?invoice=2026-01')).toBeNull();
    });
});

describe('service worker invoice click', () => {
    it('opens an existing tab or a new window with the invoice id', () => {
        const source = readFileSync(path.join(process.cwd(), 'public/sw.js'), 'utf8');
        expect(source).toContain('invoice_id');
        expect(source).toContain('OPEN_PATH');
        expect(source).not.toContain('invoice=${period}');
    });
});
