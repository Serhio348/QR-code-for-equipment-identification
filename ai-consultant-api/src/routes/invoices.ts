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
let syncInProgress = false;

// ============================================
// Фоновый запуск sync (чтобы не упираться в timeout прокси)
// ============================================
function runSyncInBackground(forceAll: boolean): void {
    if (syncInProgress) return;
    syncInProgress = true;

    void syncInvoices(forceAll)
        .then((result) => {
            console.log(
                `[Invoices background sync] done: forceAll=${forceAll}, saved=${result.saved}, skipped=${result.skipped}, errors=${result.errors.length}`
            );
        })
        .catch((err) => {
            console.error('[Invoices background sync] failed:', err);
        })
        .finally(() => {
            syncInProgress = false;
        });
}

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
    const asyncMode = _req.query.async === '1';

    if (asyncMode) {
        if (syncInProgress) {
            res.status(202).json({ ok: true, started: false, inProgress: true, mode: 'incremental' });
            return;
        }
        runSyncInBackground(false);
        res.status(202).json({ ok: true, started: true, inProgress: true, mode: 'incremental' });
        return;
    }

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
    const asyncMode = _req.query.async === '1';

    if (asyncMode) {
        if (syncInProgress) {
            res.status(202).json({ ok: true, started: false, inProgress: true, mode: 'full' });
            return;
        }
        runSyncInBackground(true);
        res.status(202).json({ ok: true, started: true, inProgress: true, mode: 'full' });
        return;
    }

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
// GET /api/invoices/download?period=YYYY-MM
// Скачать PDF счёта напрямую (без signedUrl)
// ============================================

router.get('/download', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    const period = req.query.period as string;
    const account = req.query.account as string | undefined;

    if (!period) {
        res.status(400).json({ error: 'period обязателен (YYYY-MM)' });
        return;
    }

    let query = supabase
        .from('water_invoices')
        .select('storage_path, file_name')
        .eq('period', period);

    if (account) query = query.eq('account_number', account);

    // Используем limit(1) без .single() — .single() ломается при нескольких строках
    const { data: rows, error } = await query.limit(1);
    const row = rows?.[0];

    if (error || !row?.storage_path) {
        res.status(404).json({ error: 'Файл не найден' });
        return;
    }

    const { data: file, error: downloadError } = await supabase.storage
        .from('invoices')
        .download(row.storage_path);

    if (downloadError) {
        console.error('[Invoices] Storage download error:', downloadError);
        res.status(500).json({ error: 'Не удалось скачать файл', detail: downloadError.message });
        return;
    }

    if (!file) {
        console.error('[Invoices] Storage returned empty file for path:', row.storage_path);
        res.status(500).json({ error: 'Файл пустой' });
        return;
    }

    // Читаем blob один раз — проверяем заголовок PDF из того же buffer
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length < 5 || buffer.slice(0, 5).toString('ascii') !== '%PDF-') {
        console.error('[Invoices] Downloaded content is not a PDF, path:', row.storage_path, buffer.slice(0, 50).toString());
        res.status(502).json({ error: 'Файл в хранилище недоступен' });
        return;
    }

    const fileName = row.file_name || `${period}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
    res.send(buffer);
});

export default router;