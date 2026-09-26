/**
 * gasMutation.ts
 *
 * POST в GAS не повторяется. Повтор с тем же operationId возвращает уже записанный результат.
 */

export interface OperationStore<T> {
    get(operationId: string): T | undefined;
    set(operationId: string, value: T): void;
}

export function gasAttemptsForMethod(method: string, retryCount: number): number {
    return method.toUpperCase() === 'GET' ? retryCount : 0;
}

export function isLostGasResponse(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /timeout|fetch failed|network|ECONNRESET|HTTP 502|HTTP 503|HTTP 504/i.test(message);
}

export function runIdempotentWrite<T>(
    store: OperationStore<T>,
    operationId: string,
    write: () => T,
): { repeated: boolean; value: T } {
    const existing = store.get(operationId);
    if (existing !== undefined) return { repeated: true, value: existing };
    const value = write();
    store.set(operationId, value);
    return { repeated: false, value };
}
