/**
 * invoiceFileState.ts
 *
 * Метаданные счёта и PDF живут отдельно.
 * Запись без файла повторяется, а сбой загрузки не стирает уже сохранённый путь.
 */

export function invoiceFileKey(period: string, account: string | null | undefined): string {
    return `${period}|${account ?? ''}`;
}

export function invoicePdfAction(
    files: ReadonlyMap<string, string | null>,
    period: string,
    account: string | null | undefined,
    forceAll: boolean,
): 'skip' | 'import' {
    if (forceAll) return 'import';
    const key = invoiceFileKey(period, account);
    if (!files.has(key)) return 'import';
    return files.get(key) ? 'skip' : 'import';
}

export function nextStoragePath(previousPath: string | null, uploadedPath: string | null): string | null {
    return uploadedPath ?? previousPath;
}
