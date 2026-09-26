/**
 * pushSubscriptionState.ts
 *
 * Состояние кнопки push без автоматического запроса разрешения.
 *
 * 1. pushUiState — не поддерживается, запрещено, включено, можно включить, ошибка
 */

export type PushUiState = 'unsupported' | 'denied' | 'subscribed' | 'ready' | 'error';

export function pushUiState(input: {
    supported: boolean;
    permission: NotificationPermission | 'unknown';
    subscribed: boolean;
    error: string | null;
}): PushUiState {
    if (!input.supported) return 'unsupported';
    if (input.permission === 'denied') return 'denied';
    if (input.error) return 'error';
    if (input.subscribed) return 'subscribed';
    return 'ready';
}
