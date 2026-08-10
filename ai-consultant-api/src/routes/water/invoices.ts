/**
 * invoices.ts
 *
 * Маршруты для синхронизации счетов bvod.by.
 *
 * Структура / что умеет:
 * 1. POST /sync — инкрементальная синхронизация (новые счета)
 * 2. POST /sync-all — полная синхронизация
 * 3. GET /sync/status — статус фонового sync для GitHub Actions
 * 4. GET /download — скачать PDF из Storage
 *
 * Пример:
 * POST /api/invoices/sync?async=1 → { started: true }
 * GET  /api/invoices/sync/status → { inProgress, lastResult }
 */
import { Router, Request, Response } from 'express';
import { syncInvoices, type SyncResult } from '../../services/water/index.js';
import { createClient } from '@supabase/supabase-js';
import { config } from '../../config/env.js';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth.js';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);
const router = Router();

type SyncMode = 'incremental' | 'full';

interface SyncStatus {
    inProgress: boolean;
    mode: SyncMode | null;
    startedAt: string | null;
    finishedAt: string | null;
    lastResult: SyncResult | null;
    lastError: string | null;
}

const syncStatus: SyncStatus = {
    inProgress: false,
    mode: null,
    startedAt: null,
    finishedAt: null,
    lastResult: null,
    lastError: null,
};

function runSyncInBackground(forceAll: boolean): boolean {
    if (syncStatus.inProgress) return false;

    const mode: SyncMode = forceAll ? 'full' : 'incremental';
    syncStatus.inProgress = true;
    syncStatus.mode = mode;
    syncStatus.startedAt = new Date().toISOString();
    syncStatus.finishedAt = null;
    syncStatus.lastError = null;

    void syncInvoices(forceAll)
        .then((result) => {
            syncStatus.lastResult = result;
            syncStatus.lastError = null;
            console.log(
                `[Invoices background sync] done: mode=${mode}, saved=${result.saved}, ` +
                `skipped=${result.skipped}, errors=${result.errors.length}`
            );
        })
        .catch((err) => {
            const message = err instanceof Error ? err.message : String(err);
            syncStatus.lastError = message;
            syncStatus.lastResult = null;
            console.error('[Invoices background sync] failed:', err);
        })
        .finally(() => {
            syncStatus.inProgress = false;
            syncStatus.finishedAt = new Date().toISOString();
        });

    return true;
}

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

router.get('/sync/status', requireSyncSecret, (_req: Request, res: Response) => {
    res.json({
        ok: true,
        inProgress: syncStatus.inProgress,
        mode: syncStatus.mode,
        startedAt: syncStatus.startedAt,
        finishedAt: syncStatus.finishedAt,
        lastError: syncStatus.lastError,
        lastResult: syncStatus.lastResult
            ? {
                total: syncStatus.lastResult.total,
                skipped: syncStatus.lastResult.skipped,
                downloaded: syncStatus.lastResult.downloaded,
                saved: syncStatus.lastResult.saved,
                errors: syncStatus.lastResult.errors,
                details: syncStatus.lastResult.details,
            }
            : null,
    });
});

router.post('/sync', requireSyncSecret, async (_req: Request, res: Response) => {
    const asyncMode = _req.query.async === '1';
    if (asyncMode) {
        const started = runSyncInBackground(false);
        res.status(202).json({
            ok: true,
            started,
            inProgress: true,
            mode: 'incremental',
        });
        return;
    }
    try {
        const result = await syncInvoices(false);
        syncStatus.lastResult = result;
        syncStatus.lastError = null;
        syncStatus.mode = 'incremental';
        syncStatus.finishedAt = new Date().toISOString();
        res.json({ ok: true, ...result });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        syncStatus.lastError = message;
        syncStatus.lastResult = null;
        res.status(500).json({ ok: false, error: message });
    }
});

router.post('/sync-all', requireSyncSecret, async (_req: Request, res: Response) => {
    const asyncMode = _req.query.async === '1';
    if (asyncMode) {
        const started = runSyncInBackground(true);
        res.status(202).json({
            ok: true,
            started,
            inProgress: true,
            mode: 'full',
        });
        return;
    }
    try {
        const result = await syncInvoices(true);
        syncStatus.lastResult = result;
        syncStatus.lastError = null;
        syncStatus.mode = 'full';
        syncStatus.finishedAt = new Date().toISOString();
        res.json({ ok: true, ...result });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        syncStatus.lastError = message;
        syncStatus.lastResult = null;
        res.status(500).json({ ok: false, error: message });
    }
});

router.get('/download', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    const period = req.query.period as string;
    const account = req.query.account as string | undefined;
    if (!period) {
        res.status(400).json({ error: 'period обязателен (YYYY-MM)' });
        return;
    }
    let query = supabase.from('water_invoices').select('storage_path, file_name').eq('period', period);
    if (account) query = query.eq('account_number', account);

    const { data: rows, error } = await query.limit(1);
    const row = rows?.[0];
    if (error || !row?.storage_path) {
        res.status(404).json({ error: 'Файл не найден' });
        return;
    }
    const { data: file, error: downloadError } = await supabase.storage.from('invoices').download(row.storage_path);
    if (downloadError || !file) {
        res.status(500).json({ error: 'Не удалось скачать файл', detail: downloadError?.message });
        return;
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length < 5 || buffer.slice(0, 5).toString('ascii') !== '%PDF-') {
        res.status(502).json({ error: 'Файл в хранилище недоступен' });
        return;
    }
    const fileName = row.file_name || `${period}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
    res.send(buffer);
});

export default router;
