/**
 * sync-invoices.ts
 *
 * CLI-синхронизация счетов bvod.by → Supabase.
 * Запускается из GitHub Actions (Playwright на runner), чтобы не зависеть
 * от сетевого доступа Railway к bvod.by.
 *
 * Env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY | SUPABASE_SERVICE_ROLE_KEY
 *   BVOD_LOGIN
 *   BVOD_PASSWORD
 *   BVOD_HTTP_PROXY (опционально)
 *   FORCE_ALL=1 — пересохранить все счета
 */

function requireEnv(): void {
    if (!process.env.SUPABASE_URL) {
        throw new Error('SUPABASE_URL is required');
    }
    if (!process.env.SUPABASE_SERVICE_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY is required');
    }
    if (!process.env.BVOD_LOGIN || !process.env.BVOD_PASSWORD) {
        throw new Error('BVOD_LOGIN and BVOD_PASSWORD are required');
    }
}

async function main(): Promise<void> {
    requireEnv();

    const forceAll = process.env.FORCE_ALL === '1' || process.argv.includes('--all');
    console.log(`[sync-invoices] Starting ${forceAll ? 'full' : 'incremental'} sync...`);
    if (process.env.BVOD_HTTP_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY) {
        console.log('[sync-invoices] Proxy env detected');
    }

    const { syncInvoices } = await import('../src/services/water/invoiceSyncService.js');
    const { closeBrowser } = await import('../src/services/browserService.js');

    try {
        const result = await syncInvoices(forceAll);
        console.log(
            `[sync-invoices] Done: total=${result.total}, saved=${result.saved}, ` +
            `skipped=${result.skipped}, downloaded=${result.downloaded}, errors=${result.errors.length}`
        );

        if (result.errors.length > 0) {
            console.error('[sync-invoices] Errors:');
            for (const err of result.errors.slice(0, 20)) {
                console.error(`  - ${err}`);
            }
        }

        if (result.total === 0) {
            throw new Error('No downloadable invoices found on portal');
        }
        if (result.errors.length > 0 && result.saved === 0) {
            throw new Error('All invoice saves failed');
        }
    } finally {
        await closeBrowser().catch(() => {});
    }
}

main().catch((err) => {
    console.error('[sync-invoices] Failed:', err instanceof Error ? err.message : err);
    process.exit(1);
});
