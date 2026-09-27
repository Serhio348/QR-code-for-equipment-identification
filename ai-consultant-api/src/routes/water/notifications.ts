/**
 * notifications.ts
 *
 * Маршруты уведомлений.
 */
import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth.js';
import { getRecentNotifications, markNotificationsRead } from '../../services/water/index.js';

const router = Router();

router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user?.id || '';
        const notifications = await getRecentNotifications(userId);
        res.json({ success: true, data: notifications });
    } catch {
        res.status(500).json({ success: false, error: 'Ошибка получения уведомлений' });
    }
});

router.post('/mark-read', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user?.id || '';
        const ids: string[] = Array.isArray(req.body.ids) ? req.body.ids : [];
        const updated = await markNotificationsRead(userId, ids);
        res.json({ success: true, data: { updated } });
    } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (error instanceof Error && error.name === 'NotificationReadMismatchError') {
            res.status(409).json({ success: false, error: message });
            return;
        }
        res.status(500).json({ success: false, error: 'Ошибка обновления уведомлений' });
    }
});

export default router;
