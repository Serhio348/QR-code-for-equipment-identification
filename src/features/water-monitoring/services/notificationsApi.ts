/**
 * notificationsApi.ts
 *
 * API-клиент для уведомлений и Web Push подписок.
 */

import { supabase } from '@/shared/config/supabase';

const API_URL = import.meta.env.VITE_AI_CONSULTANT_API_URL || 'http://localhost:3001';

// ============================================
// Типы
// ============================================

export interface WaterNotification {
    id: string;
    type: 'new_invoice' | 'high_consumption' | 'tariff_change';
    title: string;
    body: string;
    payload: Record<string, unknown>;
    is_read: boolean;
    created_at: string;
}

// ============================================
// Заголовки с токеном
// ============================================

async function getFreshToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session) return null;

    // Если токен истёк или истекает в ближайшие 30 сек — обновляем
    const expiresAtMs = session.expires_at ? session.expires_at * 1000 : null;
    if (expiresAtMs == null || expiresAtMs <= Date.now() + 30_000) {
        const { data: refreshed, error } = await supabase.auth.refreshSession();
        if (!error && refreshed.session?.access_token) {
            return refreshed.session.access_token;
        }
    }

    return session.access_token;
}

async function authHeaders(): Promise<Record<string, string>> {
    const token = await getFreshToken();
    return token
        ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
        : { 'Content-Type': 'application/json' };
}

// ============================================
// Получить непрочитанные уведомления
// ============================================

export async function fetchUnreadNotifications(): Promise<WaterNotification[]> {
    try {
        const headers = await authHeaders();
        const res = await fetch(`${API_URL}/api/notifications`, { headers });
        if (!res.ok) return [];
        const json = await res.json();
        return json.data ?? [];
    } catch {
        return [];
    }
}

// ============================================
// Пометить как прочитанные
// ============================================

export async function markNotificationsRead(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    try {
        const headers = await authHeaders();
        await fetch(`${API_URL}/api/notifications/mark-read`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ ids }),
        });
    } catch {
        // silent fail
    }
}

// ============================================
// Web Push: подписать устройство
// ============================================

export async function subscribeToPush(subscription: PushSubscription): Promise<void> {
    const json = subscription.toJSON();
    const headers = await authHeaders();
    await fetch(`${API_URL}/api/push/subscribe`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            endpoint: json.endpoint,
            keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
        }),
    });
}

// ============================================
// Web Push: получить публичный VAPID ключ
// ============================================

export async function getVapidPublicKey(): Promise<string | null> {
    try {
        const res = await fetch(`${API_URL}/api/push/vapid-key`);
        if (!res.ok) return null;
        const json = await res.json();
        return json.publicKey ?? null;
    } catch {
        return null;
    }
}

// ============================================
// Получить временную ссылку на PDF счёта
// ============================================

export async function getInvoiceSignedUrl(period: string): Promise<string | null> {
    try {
        const headers = await authHeaders();
        const res = await fetch(`${API_URL}/api/invoices/signed-url?period=${encodeURIComponent(period)}`, { headers });
        if (!res.ok) return null;
        const json = await res.json();
        return json.url ?? null;
    } catch {
        return null;
    }
}