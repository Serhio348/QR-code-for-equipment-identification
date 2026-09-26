import { describe, expect, it } from 'vitest';
import { invoiceDownloadSearch } from './invoiceDownloadQuery';

describe('invoiceDownloadSearch', () => {
  it('does not download by period alone', () => {
    expect(invoiceDownloadSearch({ period: '2026-07' })).toBeNull();
  });

  it('uses the invoice id when two accounts share a month', () => {
    expect(invoiceDownloadSearch({ invoiceId: 'invoice-b', period: '2026-07' })).toBe('id=invoice-b');
    expect(invoiceDownloadSearch({ period: '2026-07', account: '107.09' })).toBe(
      'period=2026-07&account=107.09',
    );
  });
});
