/**
 * invoiceSyncService.ts
 *
 * Сервис синхронизации счетов bvod.by -> Supabase.
 */
import * as fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { getInvoicesList, downloadInvoice, readInvoiceFile } from '../browserService.js';
import { parseInvoiceText } from '../invoiceParserService.js';
import { updateTariffFromInvoice } from '../ai/agentMemoryService.js';
import { checkAndNotify } from './notificationService.js';
import { config } from '../../config/env.js';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

export interface SyncResult {
    total: number;
    skipped: number;
    downloaded: number;
    saved: number;
    errors: string[];
    details: SyncDetail[];
}
export interface SyncDetail {
    fileName: string;
    period: string;
    account: string | undefined;
    status: 'saved' | 'skipped' | 'error';
    message: string;
}

function extractPeriodAndAccountFromFileName(fileName: string): { period: string; account?: string } | null {
    const normalized = (fileName || '').trim();
    if (!normalized) return null;
    const periodMatch = normalized.match(/(20\d{2})[-_.](0[1-9]|1[0-2])/);
    if (!periodMatch) return null;
    const period = `${periodMatch[1]}-${periodMatch[2]}`;
    const accountMatch = normalized.match(/\b\d{3}\.\d{2}\b/);
    return { period, account: accountMatch?.[0] };
}

export async function syncInvoices(forceAll = false): Promise<SyncResult> {
    const result: SyncResult = { total: 0, skipped: 0, downloaded: 0, saved: 0, errors: [], details: [] };
    const listResult = await getInvoicesList();
    const pdfInvoices = listResult.invoices.filter(inv => inv.fileType === 'pdf');
    result.total = pdfInvoices.length;
    if (pdfInvoices.length === 0) return result;

    let existingKeys = new Set<string>();
    if (!forceAll) {
        const { data: existing } = await supabase.from('water_invoices').select('period, account_number');
        if (existing) for (const row of existing) existingKeys.add(`${row.period}|${row.account_number ?? ''}`);
    }

    let latestSaved: Awaited<ReturnType<typeof parseInvoiceText>> | null = null;

    for (const inv of pdfInvoices) {
        const fileName = inv.title || `invoice_${Date.now()}.pdf`;
        let filePath: string | null = null;
        try {
            const fastMeta = extractPeriodAndAccountFromFileName(fileName);
            if (!forceAll && fastMeta && existingKeys.has(`${fastMeta.period}|${fastMeta.account ?? ''}`)) {
                result.skipped++;
                result.details.push({ fileName, period: fastMeta.period, account: fastMeta.account, status: 'skipped', message: 'Already in DB (fast skip by filename)' });
                continue;
            }

            filePath = await downloadInvoice(inv.downloadUrl, fileName.replace(/\.pdf$/i, ''));
            result.downloaded++;
            const rawText = await readInvoiceFile(filePath);
            const parsed = parseInvoiceText(rawText, fileName);
            const key = `${parsed.period}|${parsed.account_number ?? ''}`;
            if (!forceAll && existingKeys.has(key)) {
                result.skipped++;
                result.details.push({ fileName, period: parsed.period, account: parsed.account_number, status: 'skipped', message: 'Already in DB' });
                continue;
            }

            let storagePath: string | null = null;
            try {
                const fileBuffer = fs.readFileSync(filePath);
                const storageKey = `invoices/${parsed.account_number ?? 'unknown'}/${parsed.period}.pdf`;
                const { error: uploadError } = await supabase.storage.from('invoices').upload(storageKey, fileBuffer, { contentType: 'application/pdf', upsert: true });
                if (!uploadError) storagePath = storageKey;
            } catch {
                // noop
            }

            const { error: dbError } = await supabase.from('water_invoices').upsert({
                period: parsed.period,
                period_date: `${parsed.period}-01`,
                account_number: parsed.account_number,
                volume_m3: parsed.volume_m3,
                tariff_per_m3: parsed.tariff_per_m3,
                sewage_volume_m3: parsed.sewage_volume_m3,
                sewage_tariff_per_m3: parsed.sewage_tariff_per_m3,
                amount_byn: parsed.amount_byn,
                sections: parsed.sections ?? null,
                file_name: fileName,
                storage_path: storagePath,
                raw_text: rawText.slice(0, 50000),
            }, { onConflict: 'period,account_number' });
            if (dbError) throw new Error(`DB error: ${dbError.message}`);

            result.saved++;
            existingKeys.add(key);
            if (!latestSaved || parsed.period > latestSaved.period) latestSaved = parsed;
            result.details.push({
                fileName,
                period: parsed.period,
                account: parsed.account_number,
                status: 'saved',
                message: `вода: ${parsed.volume_m3 ?? '—'} м³, канализация: ${parsed.sewage_volume_m3 ?? '—'} м³, сумма: ${parsed.amount_byn ?? '—'} BYN`,
            });
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            result.errors.push(`${fileName}: ${errMsg}`);
            result.details.push({ fileName, period: 'unknown', account: undefined, status: 'error', message: errMsg });
        }
    }

    const savedDetailsRaw = result.details.filter(d => d.status === 'saved');
    const savedDetails = await Promise.all(
        savedDetailsRaw.map(async (d) => {
            const { data: row } = await supabase.from('water_invoices').select('amount_byn, volume_m3, storage_path').eq('period', d.period).limit(1).single();
            return {
                period: d.period,
                amount_byn: (row?.amount_byn as number | null) ?? null,
                volume_m3: (row?.volume_m3 as number | null) ?? null,
                storage_path: (row?.storage_path as string | null) ?? null,
            };
        })
    );

    await checkAndNotify(savedDetails, latestSaved).catch(() => {});
    if (latestSaved) await updateTariffFromInvoice(latestSaved).catch(() => {});
    return result;
}
