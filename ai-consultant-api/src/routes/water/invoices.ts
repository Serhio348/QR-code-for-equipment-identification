/**
 * invoices.ts
 *
 * Маршруты для синхронизации счетов bvod.by.
 */
import { Router, Request, Response } from 'express';
import { syncInvoices } from '../../services/water/index.js';
import { createClient } from '@supabase/supabase-js';
import { config } from '../../config/env.js';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth.js';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);
const router = Router();
let syncInProgress = false;

function runSyncInBackground(forceAll: boolean): void {
    if (syncInProgress) return;
    syncInProgress = true;
    void syncInvoices(forceAll)
        .catch((err) => {
            console.error('[Invoices background sync] failed:', err);
        })
        .finally(() => {
            syncInProgress = false;
        });
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

router.post('/sync', requireSyncSecret, async (_req: Request, res: Response) => {
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
        res.json({ ok: true, ...result });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(500).json({ ok: false, error: message });
    }
});

router.post('/sync-all', requireSyncSecret, async (_req: Request, res: Response) => {
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
        res.json({ ok: true, ...result });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
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
