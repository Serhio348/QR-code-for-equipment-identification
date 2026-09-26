/**
 * logoutOutcome.ts
 *
 * Локальный выход остаётся, даже если сервер не отозвал сессию.
 * Если не очистилась и локальная сессия, выход не считается успешным.
 */

export type LogoutOutcome = 'remote-revoked' | 'local-only';

export function classifySignOut(remoteError: unknown, localError: unknown): LogoutOutcome {
    if (!remoteError) return 'remote-revoked';
    if (localError) {
        throw remoteError instanceof Error ? remoteError : new Error('Не удалось выйти');
    }
    return 'local-only';
}
