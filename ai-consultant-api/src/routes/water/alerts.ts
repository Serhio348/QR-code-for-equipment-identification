/**
 * alerts.ts
 *
 * Маршрут для получения проактивных алертов по воде.
 */
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { config } from '../../config/env.js';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth.js';

const router = Router();
const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

export interface AlertItem {
    id: string;
    type: 'water_quality' | 'meter_verification';
    severity: 'critical' | 'warning';
    title: string;
    description: string;
}

export interface AlertsSummary {
    total: number;
    critical: number;
    warnings: number;
    items: AlertItem[];
}

router.get('/', authMiddleware, async (_req: AuthenticatedRequest, res) => {
    try {
        const items: AlertItem[] = [];
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
                const severity: 'critical' | 'warning' =
                    alert.priority === 'critical' || alert.priority === 'high' ? 'critical' : 'warning';
                items.push({
                    id: `wqa-${alert.id}`,
                    type: 'water_quality',
                    severity,
                    title: `Превышение нормы: ${alert.parameter_label || 'неизвестный параметр'}`,
                    description: alert.message || `Значение: ${alert.value} ${alert.unit}`,
                });
            }
        }

        const today = new Date();
        const in30Days = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
        const todayStr = today.toISOString().split('T')[0];
        const in30DaysStr = in30Days.toISOString().split('T')[0];

        const { data: meters, error: metersError } = await supabase
            .from('beliot_device_overrides')
            .select('device_id, name, next_verification_date')
            .not('next_verification_date', 'is', null)
            .lte('next_verification_date', in30DaysStr);
        if (metersError) {
            console.warn('[Alerts] beliot_device_overrides error:', metersError.message);
        }

        if (meters) {
            for (const meter of meters) {
                const verDate = meter.next_verification_date as string;
                const isExpired = verDate < todayStr;
                const daysLeft = Math.ceil((new Date(verDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                const label = (meter.name as string | null) || meter.device_id;
                items.push({
                    id: `mv-${meter.device_id}`,
                    type: 'meter_verification',
                    severity: isExpired ? 'critical' : 'warning',
                    title: isExpired ? `Поверка просрочена: ${label}` : `Поверка истекает: ${label}`,
                    description: isExpired
                        ? `Просрочено ${Math.abs(daysLeft)} дн. назад (дата: ${verDate})`
                        : `Осталось ${daysLeft} дн. (дата: ${verDate})`,
                });
            }
        }

        const critical = items.filter(i => i.severity === 'critical').length;
        const warnings = items.filter(i => i.severity === 'warning').length;
        res.json({
            success: true,
            data: {
                total: items.length,
                critical,
                warnings,
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
