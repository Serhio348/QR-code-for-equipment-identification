/**
 * notifications.ts
 *
 * Маршруты уведомлений.
 */
import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth.js';
import { getUnreadNotifications, markNotificationsRead } from '../../services/water/index.js';

const router = Router();

router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user?.id || '';
        const notifications = await getUnreadNotifications(userId);
        res.json({ success: true, data: notifications });
    } catch {
        res.status(500).json({ success: false, error: 'Ошибка получения уведомлений' });
    }
});

router.post('/mark-read', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user?.id || '';
        const ids: string[] = Array.isArray(req.body.ids) ? req.body.ids : [];
        await markNotificationsRead(userId, ids);
        res.json({ success: true });
    } catch {
        res.status(500).json({ success: false, error: 'Ошибка обновления уведомлений' });
    }
});

export default router;
