/**
 * toolResultCache.ts
 *
 * Кэш ответов read-инструментов на 5 минут.
 *
 * Структура / что умеет:
 * 1. readCachedTool — чтение только своего userId, equipmentId и прав
 * 2. storeCachedTool — запись с тем же ключом и ограничением размера
 * 3. noteToolWrite — запись сбрасывает связанные чтения у всех пользователей
 *
 * Пример: save_invoice → следующий get_invoices идёт в базу, не в кэш.
 */

import { getToolContext } from '../services/ai/toolContext.js';
import type { UserAppAccess } from '../services/ai/userAppAccessService.js';

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;

const CACHEABLE_TOOLS = new Set([
    'get_all_equipment', 'get_equipment_details', 'get_maintenance_log',
    'search_files_in_folder', 'read_file_content',
    'get_maintenance_photos', 'search_maintenance_photos',
    'get_water_devices', 'get_water_readings', 'analyze_water_consumption',
    'get_water_quality_analyses', 'get_all_water_alerts', 'get_water_quality_alerts', 'get_water_meter_passport',
    'get_invoices', 'get_memory',
    'portal_list_invoices', 'portal_list_downloaded',
]);

const WRITE_INVALIDATES: Record<string, readonly string[]> = {
    add_maintenance_entry: ['get_maintenance_log', 'get_equipment_details', 'get_all_equipment'],
    attach_files_to_entry: ['get_maintenance_log', 'get_equipment_details'],
    upload_maintenance_photo: ['get_maintenance_photos', 'search_maintenance_photos'],
    ensure_drive_folder_path: ['search_files_in_folder'],
    upload_photos_to_folder: ['search_files_in_folder'],
    create_document: ['search_files_in_folder'],
    save_manual_meter_reading: ['get_water_readings', 'analyze_water_consumption', 'get_water_devices'],
    add_water_quality_analysis: ['get_water_quality_analyses', 'get_all_water_alerts', 'get_water_quality_alerts'],
    save_memory: ['get_memory'],
    delete_memory: ['get_memory'],
    save_invoice: ['get_invoices', 'portal_list_downloaded'],
    portal_download_invoice: ['portal_list_downloaded', 'get_invoices'],
};

interface CacheEntry {
    result: unknown;
    expiresAt: number;
    toolName: string;
}

const toolCache = new Map<string, CacheEntry>();

export type ToolCacheLookup = { hit: true; result: unknown } | { hit: false };

export function isCacheableTool(name: string): boolean {
    return CACHEABLE_TOOLS.has(name);
}

function accessKey(access: UserAppAccess | undefined): string {
    if (!access) return 'none';
    return `${access.equipment ? 1 : 0}${access.water ? 1 : 0}${access.isAdmin ? 1 : 0}`;
}

function currentKey(name: string, input: Record<string, unknown>): string {
    const ctx = getToolContext();
    const scope = `${ctx?.userId ?? ''}|${ctx?.equipmentId ?? ''}|${accessKey(ctx?.appAccess)}`;
    return `${scope}\n${name}:${JSON.stringify(input)}`;
}

function dropExpired(now: number): void {
    for (const [key, entry] of toolCache) {
        if (entry.expiresAt <= now) toolCache.delete(key);
    }
}

function trimToLimit(): void {
    while (toolCache.size > CACHE_MAX_ENTRIES) {
        const oldest = toolCache.keys().next().value;
        if (oldest === undefined) break;
        toolCache.delete(oldest);
    }
}

export function readCachedTool(
    name: string,
    input: Record<string, unknown>,
    now = Date.now(),
): ToolCacheLookup {
    dropExpired(now);
    const cached = toolCache.get(currentKey(name, input));
    if (!cached || cached.expiresAt <= now) return { hit: false };
    return { hit: true, result: cached.result };
}

export function storeCachedTool(
    name: string,
    input: Record<string, unknown>,
    result: unknown,
    now = Date.now(),
): void {
    const key = currentKey(name, input);
    toolCache.delete(key);
    dropExpired(now);
    toolCache.set(key, { result, expiresAt: now + CACHE_TTL_MS, toolName: name });
    trimToLimit();
}

/**
 * Сброс чтений, которые запись могла изменить. Чужие ключи того же чтения тоже сбрасываются:
 * журнал оборудования общий.
 */
export function noteToolWrite(name: string): void {
    const reads = WRITE_INVALIDATES[name];
    if (!reads || reads.length === 0) return;
    const drop = new Set(reads);
    for (const [key, entry] of toolCache) {
        if (drop.has(entry.toolName)) toolCache.delete(key);
    }
}

export function toolCacheSize(): number {
    return toolCache.size;
}

export function clearToolCache(): void {
    toolCache.clear();
}
