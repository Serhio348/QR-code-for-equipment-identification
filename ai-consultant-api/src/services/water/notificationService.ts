/**
 * notificationService.ts
 *
 * Сервис уведомлений: создание, отправка Web Push, получение непрочитанных.
 */
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';
import { config } from '../../config/env.js';
import type { ParsedInvoice } from '../invoiceParserService.js';
import type { InvoiceNotice } from './invoiceIdentity.js';
import { compareAccountConsumption, consumptionGrowthAlert, tariffMemoryKey } from './invoiceComparison.js';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

if (config.vapidPublicKey && config.vapidPrivateKey) {
    webpush.setVapidDetails(
        `mailto:${config.vapidEmail || 'admin@example.com'}`,
        config.vapidPublicKey,
        config.vapidPrivateKey
    );
}

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

async function createNotification(type: NotificationType, title: string, body: string, payload: Record<string, unknown> = {}): Promise<void> {
    const userIds = config.notificationUserIds;
    if (userIds.length === 0) {
        console.warn('[notifications] NOTIFICATION_USER_IDS is empty — skip createNotification');
        return;
    }
    const rows = userIds.map(user_id => ({ user_id, type, title, body, payload }));
    const { error } = await supabase.from('water_notifications').insert(rows);
    if (error) {
        console.error('[notifications] Failed to insert water_notifications:', error.message);
        return;
    }
    await Promise.allSettled(userIds.map(uid => sendPushToUser(uid, title, body, { type, ...payload })));
}

async function sendPushToUser(userId: string, title: string, body: string, payload: Record<string, unknown> = {}): Promise<void> {
    if (!config.vapidPublicKey || !config.vapidPrivateKey) {
        console.warn('[notifications] VAPID keys missing — skip Web Push');
        return;
    }
    const { data: subs } = await supabase.from('push_subscriptions').select('id, endpoint, p256dh, auth_key').eq('user_id', userId);
    if (!subs || subs.length === 0) {
        console.warn(`[notifications] No push_subscriptions for user ${userId}`);
        return;
    }
    const staleIds: string[] = [];
    await Promise.allSettled(
        subs.map(async (sub) => {
            try {
                await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, JSON.stringify({ title, body, payload }));
            } catch (err: unknown) {
                const status = (err as { statusCode?: number }).statusCode;
                const bodyText = (err as { body?: string }).body;
                if (status === 410 || status === 404) {
                    staleIds.push(sub.id);
                } else {
                    console.error(`[notifications] Web Push failed for user ${userId}:`, status, bodyText || err);
                }
            }
        })
    );
    if (staleIds.length > 0) await supabase.from('push_subscriptions').delete().in('id', staleIds);
}

export async function checkAndNotify(
    savedInvoices: InvoiceNotice[],
    parsedInvoices: ParsedInvoice[]
): Promise<void> {
    if (savedInvoices.length === 0 && parsedInvoices.length === 0) return;
    for (const inv of savedInvoices) {
        const volStr = inv.volume_m3 != null ? `${inv.volume_m3} м³` : '—';
        const amtStr = inv.amount_byn != null ? `${inv.amount_byn} BYN` : '—';
        const accountStr = inv.account_number ? `, лицевой ${inv.account_number}` : '';
        await createNotification('new_invoice', `Новый счёт за ${inv.period}`, `Объём: ${volStr}, сумма: ${amtStr}${accountStr}`, {
            invoice_id: inv.id,
            period: inv.period,
            account_number: inv.account_number,
            volume_m3: inv.volume_m3,
            amount_byn: inv.amount_byn,
            storage_path: inv.storage_path ?? null,
        });
    }
    for (const parsed of parsedInvoices) {
        await checkHighConsumption(parsed);
        await checkTariffChange(parsed);
    }
}

async function checkHighConsumption(latest: ParsedInvoice): Promise<void> {
    if (latest.volume_m3 == null || !latest.account_number) return;
    const { data } = await supabase
        .from('water_invoices')
        .select('period, account_number, volume_m3')
        .eq('account_number', latest.account_number)
        .lte('period', latest.period)
        .order('period', { ascending: false })
        .limit(24);
    const alert = consumptionGrowthAlert(
        compareAccountConsumption(data ?? [], latest.account_number, latest.period),
    );
    if (!alert) return;
    await createNotification(
        'high_consumption',
        `Потребление воды выросло на ${alert.percent}%`,
        `${alert.previousPeriod}: ${alert.previousVolume} м³ → ${alert.currentPeriod}: ${alert.currentVolume} м³`,
        {
            account_number: latest.account_number,
            period: alert.currentPeriod,
            prev_period: alert.previousPeriod,
            current_volume: alert.currentVolume,
            prev_volume: alert.previousVolume,
            percent_change: alert.percent,
        },
    );
}

async function checkTariffChange(latest: ParsedInvoice): Promise<void> {
    if (!latest.account_number) return;
    if (latest.tariff_per_m3 == null && latest.sewage_tariff_per_m3 == null) return;
    const waterKey = tariffMemoryKey('water', latest.account_number);
    const sewageKey = tariffMemoryKey('sewage', latest.account_number);
    const { data: memRows } = await supabase
      .from('agent_memory')
      .select('key, value')
      .in('key', [waterKey, sewageKey])
      .eq('scope', 'shared')
      .eq('is_active', true);
    if (!memRows || memRows.length === 0) return;
    const memWater = memRows.find(r => r.key === waterKey);
    const memSewage = memRows.find(r => r.key === sewageKey);
    const oldWater = memWater ? parseFloat(memWater.value) : null;
    const oldSewage = memSewage ? parseFloat(memSewage.value) : null;
    const waterChanged = latest.tariff_per_m3 != null && oldWater != null && Math.abs(latest.tariff_per_m3 - oldWater) > 0.0001;
    const sewageChanged = latest.sewage_tariff_per_m3 != null && oldSewage != null && Math.abs(latest.sewage_tariff_per_m3 - oldSewage) > 0.0001;
    if (!waterChanged && !sewageChanged) return;
    const parts: string[] = [];
    if (waterChanged && oldWater != null && latest.tariff_per_m3 != null) parts.push(`Вода: ${oldWater} → ${latest.tariff_per_m3} BYN/м³`);
    if (sewageChanged && oldSewage != null && latest.sewage_tariff_per_m3 != null) parts.push(`Канализация: ${oldSewage} → ${latest.sewage_tariff_per_m3} BYN/м³`);
    await createNotification('tariff_change', `Изменился тариф, лицевой ${latest.account_number}`, parts.join(', '), {
        account_number: latest.account_number,
        period: latest.period,
        old_tariff_water: oldWater,
        new_tariff_water: latest.tariff_per_m3,
        old_tariff_sewage: oldSewage,
        new_tariff_sewage: latest.sewage_tariff_per_m3,
    });
}

export async function getUnreadNotifications(userId: string): Promise<WaterNotification[]> {
    const { data, error } = await supabase
        .from('water_notifications')
        .select('id, type, title, body, payload, is_read, created_at')
        .eq('user_id', userId)
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(20);
    if (error) return [];
    return (data ?? []) as WaterNotification[];
}

export async function markNotificationsRead(userId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await supabase.from('water_notifications').update({ is_read: true }).in('id', ids).eq('user_id', userId);
}

export async function savePushSubscription(userId: string, endpoint: string, p256dh: string, authKey: string): Promise<void> {
    const { error } = await supabase.from('push_subscriptions').upsert(
        { user_id: userId, endpoint, p256dh, auth_key: authKey },
        { onConflict: 'endpoint' }
    );
    if (error) throw new Error(`Ошибка сохранения подписки: ${error.message}`);
}

export async function deletePushSubscription(userId: string, endpoint: string): Promise<void> {
    const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint).eq('user_id', userId);
    if (error) throw new Error(`Ошибка удаления подписки: ${error.message}`);
}
