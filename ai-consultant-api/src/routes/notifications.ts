/**
 * notifications.ts
 *
 * Маршруты уведомлений:
 *   GET  /api/notifications          — непрочитанные уведомления (для toast)
 *   POST /api/notifications/mark-read — пометить прочитанными
 */

import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { getUnreadNotifications, markNotificationsRead } from '../services/notificationService.js';

const router = Router();

// GET /api/notifications
router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user?.id || '';
        const notifications = await getUnreadNotifications(userId);
        res.json({ success: true, data: notifications });
    } catch (err) {
        console.error('[Notifications] GET error:', err);
        res.status(500).json({ success: false, error: 'Ошибка получения уведомлений' });
    }
});

// POST /api/notifications/mark-read  { ids: string[] }
router.post('/mark-read', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user?.id || '';
        const ids: string[] = Array.isArray(req.body.ids) ? req.body.ids : [];
        await markNotificationsRead(userId, ids);
        res.json({ success: true });
    } catch (err) {
        console.error('[Notifications] mark-read error:', err);
        res.status(500).json({ success: false, error: 'Ошибка обновления уведомлений' });
    }
});

export default router;