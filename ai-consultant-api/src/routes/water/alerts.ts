/**
 * alerts.ts
 *
 * Маршрут для получения проактивных алертов по воде.
 */
import { Router } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth.js';
import { fetchWaterAlertsSummary, type WaterAlertItem, type WaterAlertsSummary } from '../../services/water/waterAlertsService.js';

const router = Router();

export type AlertItem = WaterAlertItem;
export type AlertsSummary = WaterAlertsSummary;

router.get('/', authMiddleware, async (_req: AuthenticatedRequest, res) => {
    try {
        const data = await fetchWaterAlertsSummary();
        res.json({
            success: true,
            data,
        });
    } catch (err) {
        console.error('[Alerts] Unexpected error:', err);
        res.status(500).json({ success: false, error: 'Ошибка получения алертов' });
    }
});

export default router;
