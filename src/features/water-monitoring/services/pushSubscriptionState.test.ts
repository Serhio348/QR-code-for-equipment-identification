import { describe, expect, it } from 'vitest';
import { pushUiState } from './pushSubscriptionState';

describe('pushUiState', () => {
    it('does not treat a denied permission or a failed subscribe as an enabled subscription', () => {
        expect(pushUiState({
            supported: true,
            permission: 'denied',
            subscribed: false,
            error: null,
        })).toBe('denied');
        expect(pushUiState({
            supported: true,
            permission: 'granted',
            subscribed: false,
            error: 'network',
        })).toBe('error');
        expect(pushUiState({
            supported: true,
            permission: 'default',
            subscribed: false,
            error: null,
        })).toBe('ready');
        expect(pushUiState({
            supported: true,
            permission: 'granted',
            subscribed: true,
            error: null,
        })).toBe('subscribed');
    });
});
