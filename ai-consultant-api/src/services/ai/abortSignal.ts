/**
 * abortSignal.ts
 *
 * Отмена останавливает следующий вызов модели и новые инструменты.
 * Уже выполненная запись остаётся.
 */

export function throwIfAborted(signal?: AbortSignal): void {
    if (!signal?.aborted) return;
    const error = new Error('Запрос остановлен. Запись, которая уже выполнилась, закрытием чата не отменяется.');
    error.name = 'AbortError';
    throw error;
}
