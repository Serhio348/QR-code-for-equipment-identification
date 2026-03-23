/**
 * push.ts
 *
 * Маршруты Web Push подписок.
 */
import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth.js';
import { savePushSubscription, deletePushSubscription } from '../../services/water/index.js';
import { config } from '../../config/env.js';

const router = Router();

router.get('/vapid-key', (_req, res) => {
    if (!config.vapidPublicKey) {
        return res.status(503).json({ error: 'Push notifications not configured' });
    }
    res.json({ publicKey: config.vapidPublicKey });
});

router.post('/subscribe', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user?.id || '';
        const { endpoint, keys } = req.body as {
            endpoint: string;
            keys: { p256dh: string; auth: string };
        };
        if (!endpoint || !keys?.p256dh || !keys?.auth) {
            return res.status(400).json({ error: 'Invalid subscription object' });
        }
        await savePushSubscription(userId, endpoint, keys.p256dh, keys.auth);
        res.json({ success: true });
    } catch {
        res.status(500).json({ success: false, error: 'Ошибка сохранения подписки' });
    }
});

router.delete('/unsubscribe', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user?.id || '';
        const { endpoint } = req.body as { endpoint: string };
        if (!endpoint) {
            return res.status(400).json({ error: 'endpoint is required' });
        }
        await deletePushSubscription(userId, endpoint);
        res.json({ success: true });
    } catch {
        res.status(500).json({ success: false, error: 'Ошибка удаления подписки' });
    }
});

export default router;
