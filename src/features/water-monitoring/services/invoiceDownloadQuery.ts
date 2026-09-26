/**
 * Запрос скачивания счёта: id или период вместе с лицевым счётом.
 */

export interface InvoiceDownloadRequest {
  invoiceId?: string;
  period?: string;
  account?: string;
}

export function invoiceDownloadSearch(request: InvoiceDownloadRequest): string | null {
  const invoiceId = request.invoiceId?.trim();
  if (invoiceId) return `id=${encodeURIComponent(invoiceId)}`;
  const period = request.period?.trim() ?? '';
  const account = request.account?.trim() ?? '';
  if (period && account) {
    return `period=${encodeURIComponent(period)}&account=${encodeURIComponent(account)}`;
  }
  return null;
}
