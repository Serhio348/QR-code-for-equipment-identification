/**
 * notificationsApi.ts
 *
 * API-клиент для уведомлений и Web Push подписок.
 */

import { supabase } from '@/shared/config/supabase';
import { invoiceDownloadSearch, type InvoiceDownloadRequest } from './invoiceDownloadQuery';

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

export async function fetchNotifications(): Promise<WaterNotification[]> {
    const headers = await authHeaders();
    const res = await fetch(`${API_URL}/api/notifications`, { headers });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) {
        throw new Error(json?.error || 'Не удалось загрузить уведомления');
    }
    return json.data ?? [];
}

export async function markNotificationsRead(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const headers = await authHeaders();
    const res = await fetch(`${API_URL}/api/notifications/mark-read`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ids }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) {
        throw new Error(json?.error || 'Не удалось отметить уведомления прочитанными');
    }
    return typeof json.data?.updated === 'number' ? json.data.updated : ids.length;
}

export async function unsubscribeFromPush(endpoint: string): Promise<void> {
    const headers = await authHeaders();
    const res = await fetch(`${API_URL}/api/push/unsubscribe`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ endpoint }),
    });
    if (!res.ok) {
        throw new Error('Не удалось отвязать уведомления на сервере');
    }
}

// ============================================
// Web Push: подписать устройство
// ============================================

export async function subscribeToPush(subscription: PushSubscription): Promise<void> {
    const json = subscription.toJSON();
    const headers = await authHeaders();
    const res = await fetch(`${API_URL}/api/push/subscribe`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            endpoint: json.endpoint,
            keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
        }),
    });
    if (!res.ok) {
        throw new Error('Не удалось сохранить подписку на уведомления');
    }
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
// Скачать PDF счёта как Blob (без signed URL)
// ============================================

export async function downloadInvoicePdf(
    periodOrRequest: string | InvoiceDownloadRequest,
    account?: string,
): Promise<Blob | null> {
    try {
        const request: InvoiceDownloadRequest = typeof periodOrRequest === 'string'
            ? { period: periodOrRequest, account }
            : periodOrRequest;
        const params = invoiceDownloadSearch(request);
        if (!params) return null;

        let headers = await authHeaders();
        let res = await fetch(`${API_URL}/api/invoices/download?${params}`, { headers });

        // Если 401 — принудительно обновляем сессию и делаем один повтор
        if (res.status === 401) {
            const { data: refreshed } = await supabase.auth.refreshSession().catch(() => ({ data: null }));
            const token = refreshed?.session?.access_token;
            if (token) {
                headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
                res = await fetch(`${API_URL}/api/invoices/download?${params}`, { headers });
            }
        }

        if (!res.ok) return null;
        return await res.blob();
    } catch {
        return null;
    }
}