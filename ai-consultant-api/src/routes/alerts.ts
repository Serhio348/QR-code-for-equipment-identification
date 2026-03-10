/**
 * alerts.ts
 *
 * Маршрут для получения проактивных алертов по воде.
 *
 * GET /api/alerts — возвращает активные алерты из двух источников:
 *   1. water_quality_alerts — превышения норм качества воды (статус 'active')
 *   2. beliot_device_overrides — счётчики с просроченной/истекающей поверкой
 *
 * Используется фронтендом для:
 *   - Бейджа на кнопке AI-чата (число активных алертов)
 *   - Баннера при открытии чата (краткий список критических проблем)
 */

import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config/env.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// Supabase клиент с service_role — обходит RLS, нужен для серверных запросов
const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

// ============================================
// Типы
// ============================================

export interface AlertItem {
    id: string;
    /** Источник алерта */
    type: 'water_quality' | 'meter_verification';
    /** critical = красный, warning = жёлтый */
    severity: 'critical' | 'warning';
    /** Краткий заголовок */
    title: string;
    /** Детали */
    description: string;
}

export interface AlertsSummary {
    total: number;
    critical: number;
    warnings: number;
    items: AlertItem[];
}

// ============================================
// GET /api/alerts
// ============================================

router.get('/', authMiddleware, async (_req: AuthenticatedRequest, res) => {
    try {
        const items: AlertItem[] = [];

        // ----------------------------------------
        // Источник 1: Активные алерты качества воды
        // ----------------------------------------
        // Берём алерты со статусом 'active' — то есть ещё не подтверждённые
        // и не закрытые оператором.
        const { data: waterAlerts, error: waterError } = await supabase
            .from('water_quality_alerts')
            .select('id, priority, parameter_label, value, unit, message, created_at')
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(20);

        if (waterError) {
            console.warn('[Alerts] water_quality_alerts error:', waterError.message);
        }

        if (waterAlerts) {
            for (const alert of waterAlerts) {
                // critical и high → severity 'critical' (красный)
                // medium и low → severity 'warning' (жёлтый)
                const severity: 'critical' | 'warning' =
                    alert.priority === 'critical' || alert.priority === 'high'
                        ? 'critical'
                        : 'warning';

                items.push({
                    id: `wqa-${alert.id}`,
                    type: 'water_quality',
                    severity,
                    title: `Превышение нормы: ${alert.parameter_label || 'неизвестный параметр'}`,
                    description: alert.message || `Значение: ${alert.value} ${alert.unit}`,
                });
            }
        }

        // ----------------------------------------
        // Источник 2: Поверки счётчиков
        // ----------------------------------------
        // Ищем счётчики у которых next_verification_date:
        //   - уже прошла (просрочена) → critical
        //   - наступит в течение 30 дней → warning
        const today = new Date();
        const in30Days = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
        const todayStr = today.toISOString().split('T')[0];
        const in30DaysStr = in30Days.toISOString().split('T')[0];

        // Колонка next_verification_date появится в таблице после добавления миграции.
        // Пока что запрос может вернуть ошибку — она обрабатывается как предупреждение.
        const { data: meters, error: metersError } = await supabase
            .from('beliot_device_overrides')
            .select('device_id, name, next_verification_date')
            .not('next_verification_date', 'is', null)
            .lte('next_verification_date', in30DaysStr);

        if (metersError) {
            // Таблица может не иметь колонки next_verification_date — игнорируем
            console.warn('[Alerts] beliot_device_overrides error:', metersError.message);
        }

        if (meters) {
            for (const meter of meters) {
                const verDate = meter.next_verification_date as string;
                const isExpired = verDate < todayStr;
                const daysLeft = Math.ceil(
                    (new Date(verDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
                );
                const label = (meter.name as string | null) || meter.device_id;

                items.push({
                    id: `mv-${meter.device_id}`,
                    type: 'meter_verification',
                    severity: isExpired ? 'critical' : 'warning',
                    title: isExpired
                        ? `Поверка просрочена: ${label}`
                        : `Поверка истекает: ${label}`,
                    description: isExpired
                        ? `Просрочено ${Math.abs(daysLeft)} дн. назад (дата: ${verDate})`
                        : `Осталось ${daysLeft} дн. (дата: ${verDate})`,
                });
            }
        }

        // ----------------------------------------
        // Формируем сводку
        // ----------------------------------------
        const critical = items.filter(i => i.severity === 'critical').length;
        const warnings = items.filter(i => i.severity === 'warning').length;

        res.json({
            success: true,
            data: {
                total: items.length,
                critical,
                warnings,
                // critical сначала, потом warnings
                items: [
                    ...items.filter(i => i.severity === 'critical'),
                    ...items.filter(i => i.severity === 'warning'),
                ].slice(0, 50),
            } satisfies AlertsSummary,
        });

    } catch (err) {
        console.error('[Alerts] Unexpected error:', err);
        res.status(500).json({ success: false, error: 'Ошибка получения алертов' });
    }
});

export default router;
