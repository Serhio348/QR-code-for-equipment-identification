/**
 * routes/invoices.ts
 *
 * Маршруты для синхронизации счетов bvod.by.
 *
 * Эндпоинты (защищены заголовком X-Sync-Secret):
 *   POST /api/invoices/sync      — скачать только новые счета (не в БД)
 *   POST /api/invoices/sync-all  — скачать все счета (bulk import)
 *
 * Защита:
 *   Заголовок X-Sync-Secret должен совпадать с INVOICE_SYNC_SECRET из env.
 *   Это предотвращает несанкционированный запуск через публичный Railway URL.
 *
 * Используется из GitHub Actions (daily cron):
 *   curl -X POST https://{railway-url}/api/invoices/sync \
 *     -H "X-Sync-Secret: ${{ secrets.INVOICE_SYNC_SECRET }}"
 */

import { Router, Request, Response } from 'express';
import { syncInvoices } from '../services/invoiceSyncService.js';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config/env.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

const router = Router();

// ============================================
// Middleware: проверка секрета
// ============================================

function requireSyncSecret(req: Request, res: Response, next: () => void): void {
    const secret = process.env.INVOICE_SYNC_SECRET;
    if (!secret) {
        res.status(500).json({ error: 'INVOICE_SYNC_SECRET не задан на сервере' });
        return;
    }
    const provided = req.headers['x-sync-secret'];
    if (provided !== secret) {
        res.status(401).json({ error: 'Неверный X-Sync-Secret' });
        return;
    }
    next();
}

// ============================================
// POST /api/invoices/sync
// Скачать только новые счета (которых нет в БД)
// ============================================

router.post('/sync', requireSyncSecret, async (_req: Request, res: Response) => {
    console.log('[POST /api/invoices/sync] Starting incremental sync...');
    try {
        const result = await syncInvoices(false);
        res.json({
            ok: true,
            ...result,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[POST /api/invoices/sync] Error:', err);
        res.status(500).json({ ok: false, error: message });
    }
});

// ============================================
// POST /api/invoices/sync-all
// Скачать ВСЕ счета (первичный импорт)
// ============================================

router.post('/sync-all', requireSyncSecret, async (_req: Request, res: Response) => {
    console.log('[POST /api/invoices/sync-all] Starting full sync...');
    try {
        const result = await syncInvoices(true);
        res.json({
            ok: true,
            ...result,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[POST /api/invoices/sync-all] Error:', err);
        res.status(500).json({ ok: false, error: message });
    }
});

// ============================================
// GET /api/invoices/signed-url?period=YYYY-MM
// Получить временную ссылку на PDF счёта (1 час)
// ============================================

router.get('/signed-url', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    const period = req.query.period as string;
    if (!period) {
        res.status(400).json({ error: 'period обязателен (YYYY-MM)' });
        return;
    }

    const { data, error } = await supabase
        .from('water_invoices')
        .select('storage_path, file_name')
        .eq('period', period)
        .limit(1)
        .single();

    if (error || !data?.storage_path) {
        res.status(404).json({ error: 'Файл не найден' });
        return;
    }

    const { data: signed } = await supabase.storage
        .from('invoices')
        .createSignedUrl(data.storage_path, 3600);

    if (!signed?.signedUrl) {
        res.status(500).json({ error: 'Не удалось создать ссылку' });
        return;
    }

    res.json({ url: signed.signedUrl, file_name: data.file_name });
});

export default router;