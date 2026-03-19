/**
 * invoiceSyncService.ts
 *
 * Сервис синхронизации счетов bvod.by → Supabase.
 *
 * Алгоритм:
 *   1. Войти на портал (loginToPortal)
 *   2. Получить список всех файлов (getInvoicesList)
 *   3. Отфильтровать только PDF
 *   4. Проверить какие периоды уже есть в water_invoices
 *   5. Скачать только новые PDF
 *   6. Спарсить каждый (parseInvoiceText)
 *   7. Сохранить в Supabase + Storage
 *
 * Используется из:
 *   - routes/invoices.ts → POST /api/invoices/sync (новые)
 *   - routes/invoices.ts → POST /api/invoices/sync-all (все, включая уже сохранённые)
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { getInvoicesList, downloadInvoice, readInvoiceFile } from './browserService.js';
import { parseInvoiceText } from './invoiceParserService.js';
import { updateTariffFromInvoice } from './agentMemoryService.js';
import { checkAndNotify } from './notificationService.js';
import { config } from '../config/env.js';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

// ============================================
// Типы
// ============================================

export interface SyncResult {
    total: number;           // всего PDF на портале
    skipped: number;         // уже в БД, пропущено
    downloaded: number;      // скачано в этом запуске
    saved: number;           // успешно сохранено в БД
    errors: string[];        // ошибки (не прерывают процесс)
    details: SyncDetail[];   // детали по каждому файлу
}

export interface SyncDetail {
    fileName: string;
    period: string;
    account: string | undefined;
    status: 'saved' | 'skipped' | 'error';
    message: string;
}

// ============================================
// Вспомогательные функции
// ============================================

/**
 * Быстро извлекает period/account из имени файла, чтобы можно было
 * пропускать уже сохранённые счета ДО скачивания и парсинга PDF.
 *
 * Примеры:
 * - 107.00-2025-08.pdf -> { account: "107.00", period: "2025-08" }
 * - 2025-08_107.09.pdf -> { account: "107.09", period: "2025-08" }
 */
function extractPeriodAndAccountFromFileName(fileName: string): { period: string; account?: string } | null {
    const normalized = (fileName || '').trim();
    if (!normalized) return null;

    const periodMatch = normalized.match(/(20\d{2})[-_.](0[1-9]|1[0-2])/);
    if (!periodMatch) return null;
    const period = `${periodMatch[1]}-${periodMatch[2]}`;

    const accountMatch = normalized.match(/\b\d{3}\.\d{2}\b/);
    const account = accountMatch?.[0];
    return { period, account };
}

// ============================================
// Основная функция синхронизации
// ============================================

/**
 * Синхронизировать счета с портала в Supabase.
 *
 * @param forceAll - true = сохранить все, даже если уже есть в БД (для первичного импорта)
 */
export async function syncInvoices(forceAll = false): Promise<SyncResult> {
    const result: SyncResult = {
        total: 0,
        skipped: 0,
        downloaded: 0,
        saved: 0,
        errors: [],
        details: [],
    };

    // 1–2. Получить список счетов (внутри getInvoicesList уже есть login/close контекста)
    console.log('[invoiceSync] Fetching invoice list...');
    const listResult = await getInvoicesList();
    const invoices = listResult.invoices;

    // 3. Отфильтровать только PDF
    const pdfInvoices = invoices.filter(inv => inv.fileType === 'pdf');
    result.total = pdfInvoices.length;
    console.log(`[invoiceSync] Found ${pdfInvoices.length} PDF invoices on portal`);

    if (pdfInvoices.length === 0) {
        return result;
    }

    // 4. Получить список уже сохранённых периодов из БД
    let existingKeys = new Set<string>(); // "period|account_number"
    if (!forceAll) {
        const { data: existing } = await supabase
            .from('water_invoices')
            .select('period, account_number');
        if (existing) {
            for (const row of existing) {
                existingKeys.add(`${row.period}|${row.account_number ?? ''}`);
            }
        }
        console.log(`[invoiceSync] Already in DB: ${existingKeys.size} records`);
    }

    // Для автообновления тарифов — запоминаем самый свежий сохранённый счёт
    let latestSaved: Awaited<ReturnType<typeof parseInvoiceText>> | null = null;

    // 5–7. Скачать новые, спарсить, сохранить
    for (const inv of pdfInvoices) {
        const fileName = inv.title || `invoice_${Date.now()}.pdf`;
        console.log(`[invoiceSync] Processing: ${fileName}`);

        let filePath: string | null = null;
        try {
            // Быстрый skip до скачивания PDF: если период/счёт уже есть в БД.
            const fastMeta = extractPeriodAndAccountFromFileName(fileName);
            if (!forceAll && fastMeta) {
                const fastKey = `${fastMeta.period}|${fastMeta.account ?? ''}`;
                if (existingKeys.has(fastKey)) {
                    result.skipped++;
                    result.details.push({
                        fileName,
                        period: fastMeta.period,
                        account: fastMeta.account,
                        status: 'skipped',
                        message: 'Already in DB (fast skip by filename)',
                    });
                    console.log(`[invoiceSync] Fast skipped (already saved): ${fileName}`);
                    continue;
                }
            }

            // 5. Скачать PDF
            filePath = await downloadInvoice(inv.downloadUrl, fileName.replace(/\.pdf$/i, ''));
            result.downloaded++;

            // 6. Прочитать и спарсить
            const rawText = await readInvoiceFile(filePath);
            const parsed = parseInvoiceText(rawText, fileName);

            // Проверка: уже в БД?
            const key = `${parsed.period}|${parsed.account_number ?? ''}`;
            if (!forceAll && existingKeys.has(key)) {
                result.skipped++;
                result.details.push({
                    fileName,
                    period: parsed.period,
                    account: parsed.account_number,
                    status: 'skipped',
                    message: 'Already in DB',
                });
                console.log(`[invoiceSync] Skipped (already saved): ${fileName}`);
                continue;
            }

            // 7a. Загрузить PDF в Supabase Storage
            let storagePath: string | null = null;
            try {
                const fileBuffer = fs.readFileSync(filePath);
                const storageKey = `invoices/${parsed.account_number ?? 'unknown'}/${parsed.period}.pdf`;
                const { error: uploadError } = await supabase.storage
                    .from('invoices')
                    .upload(storageKey, fileBuffer, {
                        contentType: 'application/pdf',
                        upsert: true,
                    });
                if (!uploadError) storagePath = storageKey;
            } catch (storageErr) {
                console.warn(`[invoiceSync] Storage upload failed for ${fileName}:`, storageErr);
                // Продолжаем — сохранение данных важнее файла
            }

            // 7b. Сохранить данные в water_invoices
            const { error: dbError } = await supabase
                .from('water_invoices')
                .upsert({
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

            if (dbError) {
                throw new Error(`DB error: ${dbError.message}`);
            }

            result.saved++;
            existingKeys.add(key);
            // Запоминаем самый свежий сохранённый счёт для обновления тарифов
            if (!latestSaved || parsed.period > latestSaved.period) {
                latestSaved = parsed;
            }
            result.details.push({
                fileName,
                period: parsed.period,
                account: parsed.account_number,
                status: 'saved',
                message: `вода: ${parsed.volume_m3 ?? '—'} м³, канализация: ${parsed.sewage_volume_m3 ?? '—'} м³, сумма: ${parsed.amount_byn ?? '—'} BYN`,
            });
            console.log(`[invoiceSync] Saved: ${fileName} (${parsed.period})`);

        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            result.errors.push(`${fileName}: ${errMsg}`);
            result.details.push({
                fileName,
                period: 'unknown',
                account: undefined,
                status: 'error',
                message: errMsg,
            });
            console.error(`[invoiceSync] Error processing ${fileName}:`, err);
        }
    }

    // Проверяем и создаём уведомления ПЕРЕД обновлением тарифов в памяти,
    // чтобы checkTariffChange увидел старый тариф и мог сравнить с новым
    const savedDetailsRaw = result.details.filter(d => d.status === 'saved');
    const savedDetails = await Promise.all(
        savedDetailsRaw.map(async (d) => {
            const { data: row } = await supabase
                .from('water_invoices')
                .select('amount_byn, volume_m3, storage_path')
                .eq('period', d.period)
                .limit(1)
                .single();
            return {
                period: d.period,
                amount_byn: (row?.amount_byn as number | null) ?? null,
                volume_m3: (row?.volume_m3 as number | null) ?? null,
                storage_path: (row?.storage_path as string | null) ?? null,
            };
        })
    );

    await checkAndNotify(savedDetails, latestSaved).catch(err =>
        console.warn('[invoiceSync] Notification check failed:', err)
    );

    // Автообновление тарифов в памяти агента из самого свежего счёта
    if (latestSaved) {
        await updateTariffFromInvoice(latestSaved).catch(err =>
            console.warn('[invoiceSync] Tariff memory update failed:', err)
        );
        console.log(`[invoiceSync] Tariff memory updated from period ${latestSaved.period}`);
    }

    console.log(`[invoiceSync] Done. saved=${result.saved}, skipped=${result.skipped}, errors=${result.errors.length}`);
    return result;
}
