/**
 * notificationService.ts
 *
 * Сервис уведомлений: создание, отправка Web Push, получение непрочитанных.
 *
 * Типы уведомлений:
 *   new_invoice       — появился новый счёт (сумма, объём)
 *   high_consumption  — потребление выросло >20% к прошлому месяцу
 *   tariff_change     — изменился тариф на воду или канализацию
 *
 * Web Push отправляется на все устройства пользователя (push_subscriptions).
 * Toast-уведомления показываются при открытии вкладки Вода через
 * GET /api/notifications → фронтенд показывает toast → POST /api/notifications/mark-read
 */

import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config/env.js';
import type { ParsedInvoice } from './invoiceParserService.js';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

// Инициализация VAPID — нужна для подписи Web Push запросов
if (config.vapidPublicKey && config.vapidPrivateKey) {
    webpush.setVapidDetails(
        `mailto:${config.vapidEmail || 'admin@example.com'}`,
        config.vapidPublicKey,
        config.vapidPrivateKey
    );
}

// ============================================
// Типы
// ============================================

export type NotificationType = 'new_invoice' | 'high_consumption' | 'tariff_change';

export interface WaterNotification {
    id: string;
    type: NotificationType;
    title: string;
    body: string;
    payload: Record<string, unknown>;
    is_read: boolean;
    created_at: string;
}

// ============================================
// Создать уведомление
// ============================================

async function createNotification(
    type: NotificationType,
    title: string,
    body: string,
    payload: Record<string, unknown> = {}
): Promise<void> {
    // Список получателей: NOTIFICATION_USER_IDS=uuid1,uuid2,...
    const userIds = config.notificationUserIds;
    if (userIds.length === 0) {
        console.warn('[Notifications] NOTIFICATION_USER_IDS not set — skipping');
        return;
    }

    const rows = userIds.map(user_id => ({ user_id, type, title, body, payload }));
    const { error } = await supabase
        .from('water_notifications')
        .insert(rows);

    if (error) {
        console.error('[Notifications] Insert error:', error.message);
        return;
    }

    // Отправить Web Push всем получателям параллельно
    await Promise.allSettled(
        userIds.map(uid => sendPushToUser(uid, title, body, { type, ...payload }))
    );
}

// ============================================
// Отправить Web Push всем устройствам пользователя
// ============================================

async function sendPushToUser(
    userId: string,
    title: string,
    body: string,
    payload: Record<string, unknown> = {}
): Promise<void> {
    if (!config.vapidPublicKey || !config.vapidPrivateKey) return;

    const { data: subs } = await supabase
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth_key')
        .eq('user_id', userId);

    if (!subs || subs.length === 0) return;

    const staleIds: string[] = [];

    await Promise.allSettled(
        subs.map(async (sub) => {
            try {
                await webpush.sendNotification(
                    {
                        endpoint: sub.endpoint,
                        keys: { p256dh: sub.p256dh, auth: sub.auth_key },
                    },
                    JSON.stringify({ title, body, payload })
                );
            } catch (err: unknown) {
                const status = (err as { statusCode?: number }).statusCode;
                if (status === 410 || status === 404) {
                    // Подписка устарела — удаляем
                    staleIds.push(sub.id);
                } else {
                    console.warn('[Notifications] Push send error:', err);
                }
            }
        })
    );

    if (staleIds.length > 0) {
        await supabase
            .from('push_subscriptions')
            .delete()
            .in('id', staleIds);
    }
}

// ============================================
// Проверить и создать уведомления после синка
// ============================================

/**
 * Вызывается из invoiceSyncService ПЕРЕД updateTariffFromInvoice,
 * чтобы сравнить новый тариф со старым (ещё не обновлённым в памяти).
 */
export async function checkAndNotify(
    savedPeriods: Array<{ period: string; amount_byn?: number | null; volume_m3?: number | null; storage_path?: string | null }>,
    latestParsed: ParsedInvoice | null
): Promise<void> {
    if (savedPeriods.length === 0 && !latestParsed) return;

    // 1. Уведомление о новых счетах
    for (const inv of savedPeriods) {
        const volStr = inv.volume_m3 != null ? `${inv.volume_m3} м³` : '—';
        const amtStr = inv.amount_byn != null ? `${inv.amount_byn} BYN` : '—';
        await createNotification(
            'new_invoice',
            `Новый счёт за ${inv.period}`,
            `Объём: ${volStr}, сумма: ${amtStr}`,
            {
                period: inv.period,
                volume_m3: inv.volume_m3,
                amount_byn: inv.amount_byn,
                storage_path: inv.storage_path ?? null,
            }
        );
    }

    if (!latestParsed) return;

    // 2. Проверка роста потребления (>20%)
    await checkHighConsumption(latestParsed);

    // 3. Проверка изменения тарифа
    await checkTariffChange(latestParsed);
}

// ----------------------------------------
// Рост потребления >20%
// ----------------------------------------

async function checkHighConsumption(latest: ParsedInvoice): Promise<void> {
    if (latest.volume_m3 == null) return;

    // Берём два последних периода из БД
    const { data } = await supabase
        .from('water_invoices')
        .select('period, volume_m3')
        .order('period_date', { ascending: false })
        .limit(2);

    if (!data || data.length < 2) return;

    const [current, previous] = data;
    if (current.volume_m3 == null || previous.volume_m3 == null) return;

    const change = (current.volume_m3 - previous.volume_m3) / previous.volume_m3;
    if (change <= 0.20) return;

    const pct = Math.round(change * 100);
    await createNotification(
        'high_consumption',
        `Потребление воды выросло на ${pct}%`,
        `${previous.period}: ${previous.volume_m3} м³ → ${current.period}: ${current.volume_m3} м³`,
        {
            period: current.period,
            prev_period: previous.period,
            current_volume: current.volume_m3,
            prev_volume: previous.volume_m3,
            percent_change: pct,
        }
    );
}

// ----------------------------------------
// Изменение тарифа
// ----------------------------------------

async function checkTariffChange(latest: ParsedInvoice): Promise<void> {
    if (latest.tariff_per_m3 == null && latest.sewage_tariff_per_m3 == null) return;

    // Читаем текущий тариф из agent_memory (до обновления)
    const { data: memRows } = await supabase
        .from('agent_memory')
        .select('key, value')
        .in('key', ['tariff_water', 'tariff_sewage'])
        .eq('is_active', true);

    if (!memRows || memRows.length === 0) return; // нечего сравнивать

    const memWater = memRows.find(r => r.key === 'tariff_water');
    const memSewage = memRows.find(r => r.key === 'tariff_sewage');

    const oldWater = memWater ? parseFloat(memWater.value) : null;
    const oldSewage = memSewage ? parseFloat(memSewage.value) : null;

    const waterChanged =
        latest.tariff_per_m3 != null &&
        oldWater != null &&
        Math.abs(latest.tariff_per_m3 - oldWater) > 0.0001;

    const sewageChanged =
        latest.sewage_tariff_per_m3 != null &&
        oldSewage != null &&
        Math.abs(latest.sewage_tariff_per_m3 - oldSewage) > 0.0001;

    if (!waterChanged && !sewageChanged) return;

    const parts: string[] = [];
    if (waterChanged && oldWater != null && latest.tariff_per_m3 != null) {
        parts.push(`Вода: ${oldWater} → ${latest.tariff_per_m3} BYN/м³`);
    }
    if (sewageChanged && oldSewage != null && latest.sewage_tariff_per_m3 != null) {
        parts.push(`Канализация: ${oldSewage} → ${latest.sewage_tariff_per_m3} BYN/м³`);
    }

    await createNotification(
        'tariff_change',
        'Изменился тариф на воду',
        parts.join(', '),
        {
            period: latest.period,
            old_tariff_water: oldWater,
            new_tariff_water: latest.tariff_per_m3,
            old_tariff_sewage: oldSewage,
            new_tariff_sewage: latest.sewage_tariff_per_m3,
        }
    );
}

// ============================================
// Получить непрочитанные уведомления
// ============================================

export async function getUnreadNotifications(userId: string): Promise<WaterNotification[]> {
    const { data, error } = await supabase
        .from('water_notifications')
        .select('id, type, title, body, payload, is_read, created_at')
        .eq('user_id', userId)
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(20);

    if (error) {
        console.error('[Notifications] Fetch error:', error.message);
        return [];
    }

    return (data ?? []) as WaterNotification[];
}

// ============================================
// Пометить как прочитанные
// ============================================

export async function markNotificationsRead(userId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    const { error } = await supabase
        .from('water_notifications')
        .update({ is_read: true })
        .in('id', ids)
        .eq('user_id', userId);

    if (error) {
        console.error('[Notifications] Mark read error:', error.message);
    }
}

// ============================================
// Сохранить Web Push подписку
// ============================================

export async function savePushSubscription(
    userId: string,
    endpoint: string,
    p256dh: string,
    authKey: string
): Promise<void> {
    const { error } = await supabase
        .from('push_subscriptions')
        .upsert(
            { user_id: userId, endpoint, p256dh, auth_key: authKey },
            { onConflict: 'endpoint' }
        );

    if (error) {
        throw new Error(`Ошибка сохранения подписки: ${error.message}`);
    }
}

// ============================================
// Удалить Web Push подписку
// ============================================

export async function deletePushSubscription(userId: string, endpoint: string): Promise<void> {
    const { error } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('endpoint', endpoint)
        .eq('user_id', userId);

    if (error) {
        throw new Error(`Ошибка удаления подписки: ${error.message}`);
    }
}