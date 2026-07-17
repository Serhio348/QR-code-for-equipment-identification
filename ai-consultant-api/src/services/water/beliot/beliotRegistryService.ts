/**
 * beliotRegistryService.ts
 *
 * Управляет реестром Beliot, сканированием и статусами отслеживания.
 *
 * Структура / что умеет:
 * 1. scanBeliotDevices — безопасный upsert полного каталога
 * 2. listBeliotDevices — административный список с overrides и показаниями
 * 3. updateTrackingStatus — контролируемая смена жизненного цикла
 */

import { createClient } from '@supabase/supabase-js';
import { config } from '../../../config/env.js';
import { fetchAllDevices } from './beliotClient.js';
import type {
  BeliotRegistryDevice,
  BeliotScanResult,
  BeliotTrackingStatus,
} from './beliotTypes.js';

// ============================================
// Клиент и типы
// ============================================

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let scanInProgress = false;

export interface ListBeliotDevicesOptions {
  search?: string;
  trackingStatus?: string;
  providerStatus?: string;
  page: number;
  pageSize: number;
}

export interface ListBeliotDevicesResult {
  devices: BeliotRegistryDevice[];
  total: number;
  page: number;
  pageSize: number;
  summary: {
    total: number;
    tracked: number;
    discovered: number;
    ignored: number;
    retired: number;
    missing: number;
  };
}

// ============================================
// Сканирование
// ============================================

export function isBeliotScanInProgress(): boolean {
  return scanInProgress;
}

export async function scanBeliotDevices(
  userId: string | null,
  userEmail: string | null,
): Promise<BeliotScanResult> {
  if (scanInProgress) throw new Error('SCAN_ALREADY_RUNNING');
  scanInProgress = true;
  const startedAt = new Date().toISOString();
  let scanId: string | null = null;

  try {
    const runningSince = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    await supabase
      .from('beliot_scan_runs')
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        error: 'Сканирование прервано по таймауту',
      })
      .eq('status', 'running')
      .lt('started_at', runningSince);
    const { data: activeRun } = await supabase
      .from('beliot_scan_runs')
      .select('id')
      .eq('status', 'running')
      .gte('started_at', runningSince)
      .limit(1)
      .maybeSingle();
    if (activeRun) throw new Error('SCAN_ALREADY_RUNNING');

    const { data: run, error: runError } = await supabase
      .from('beliot_scan_runs')
      .insert({
        status: 'running',
        source: userId ? 'manual' : 'scheduled',
        started_by: userId,
      })
      .select('id')
      .single();
    if (runError || !run) throw new Error(`Не удалось создать запуск сканирования: ${runError?.message}`);
    scanId = String(run.id);

    const devices = await fetchAllDevices();
    const ids = devices.map(device => device.deviceId);
    const { data: existingRows, error: existingError } = await supabase
      .from('beliot_devices')
      .select('device_id');
    if (existingError) throw new Error(existingError.message);
    const existingIds = new Set((existingRows ?? []).map(row => String(row.device_id)));
    const now = new Date().toISOString();

    if (devices.length > 0) {
      const rows = devices.map(device => ({
        device_id: device.deviceId,
        provider_name: device.name,
        provider_serial_number: device.serialNumber,
        provider_address: device.address,
        provider_object_name: device.objectName,
        provider_data: device.providerData,
        provider_status: 'available',
        consecutive_misses: 0,
        last_seen_at: now,
      }));
      const { error } = await supabase.from('beliot_devices').upsert(rows, {
        onConflict: 'device_id',
        ignoreDuplicates: false,
      });
      if (error) throw new Error(error.message);
    }

    let missing = 0;
    const absentRows = (existingRows ?? []).filter(row => !ids.includes(String(row.device_id)));
    for (const row of absentRows) {
      const deviceId = String(row.device_id);
      const { data: current } = await supabase
        .from('beliot_devices')
        .select('consecutive_misses')
        .eq('device_id', deviceId)
        .single();
      const misses = Number(current?.consecutive_misses ?? 0) + 1;
      const { error } = await supabase
        .from('beliot_devices')
        .update({
          consecutive_misses: misses,
          ...(misses >= 3 ? { provider_status: 'missing' } : {}),
        })
        .eq('device_id', deviceId);
      if (error) throw new Error(error.message);
      if (misses >= 3) missing += 1;
    }

    const created = ids.filter(id => !existingIds.has(id)).length;
    const updated = devices.length - created;
    const completedAt = new Date().toISOString();
    await supabase.from('beliot_scan_runs').update({
      status: 'completed',
      finished_at: completedAt,
      found_count: devices.length,
      new_count: created,
      updated_count: updated,
      missing_count: missing,
    }).eq('id', scanId);
    if (userId) {
      await supabase.from('user_activity_logs').insert({
        user_id: userId,
        user_email: userEmail,
        activity_type: 'other',
        activity_description: 'Сканирование устройств Beliot',
        entity_type: 'other',
        entity_id: scanId,
        metadata: { found: devices.length, new: created, updated, missing },
      });
    }

    return {
      scanId,
      found: devices.length,
      new: created,
      updated,
      missing,
      scannedAt: completedAt,
    };
  } catch (error) {
    if (scanId) {
      const message = error instanceof Error ? error.message : String(error);
      await supabase.from('beliot_scan_runs').update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        error: message,
      }).eq('id', scanId);
    }
    throw error;
  } finally {
    scanInProgress = false;
    console.info(`[Beliot scan] ${startedAt} завершён`);
  }
}

// ============================================
// Чтение реестра
// ============================================

export async function listBeliotDevices(
  options: ListBeliotDevicesOptions,
): Promise<ListBeliotDevicesResult> {
  const { data: registry, error } = await supabase
    .from('beliot_devices')
    .select('*')
    .order('device_id');
  if (error) throw new Error(error.message);

  const { data: overrides } = await supabase.from('beliot_device_overrides').select('*');
  const overrideMap = new Map((overrides ?? []).map(row => [String(row.device_id), row]));

  const allDevices: BeliotRegistryDevice[] = (registry ?? []).map(row => {
    const id = String(row.device_id);
    const override = overrideMap.get(id);
    return {
      device_id: id,
      provider_name: row.provider_name ?? null,
      provider_serial_number: row.provider_serial_number ?? null,
      provider_address: row.provider_address ?? null,
      provider_object_name: row.provider_object_name ?? null,
      bootstrap_group_name: row.bootstrap_group_name ?? null,
      tracking_status: row.tracking_status,
      provider_status: row.provider_status,
      consecutive_misses: Number(row.consecutive_misses ?? 0),
      discovered_at: String(row.discovered_at),
      last_seen_at: row.last_seen_at ? String(row.last_seen_at) : null,
      updated_at: String(row.updated_at),
      override_name: override?.name ?? null,
      serial_number: override?.serial_number ?? null,
      address: override?.address ?? null,
      object_name: override?.object_name ?? null,
      device_group: override?.device_group ?? null,
      device_role: override?.device_role ?? null,
      last_reading_at: null,
      last_reading_value: null,
    };
  });

  const normalizedSearch = options.search?.trim().toLowerCase();
  const filtered = allDevices.filter(device => {
    if (options.trackingStatus && device.tracking_status !== options.trackingStatus) return false;
    if (options.providerStatus && device.provider_status !== options.providerStatus) return false;
    if (!normalizedSearch) return true;
    return [
      device.device_id,
      device.override_name,
      device.provider_name,
      device.serial_number,
      device.provider_serial_number,
      device.object_name,
      device.provider_object_name,
      device.address,
      device.provider_address,
    ].some(value => value?.toLowerCase().includes(normalizedSearch));
  });
  const start = (options.page - 1) * options.pageSize;
  const pageDevices = filtered.slice(start, start + options.pageSize);
  await Promise.all(pageDevices.map(async device => {
    const { data } = await supabase.rpc('get_last_beliot_reading', {
      p_device_id: device.device_id,
      p_reading_type: 'hourly',
    });
    const reading = Array.isArray(data) ? data[0] : null;
    if (reading) {
      device.last_reading_at = String(reading.reading_date);
      device.last_reading_value = Number(reading.reading_value);
    }
  }));

  return {
    devices: pageDevices,
    total: filtered.length,
    page: options.page,
    pageSize: options.pageSize,
    summary: {
      total: allDevices.length,
      tracked: allDevices.filter(row => row.tracking_status === 'tracked').length,
      discovered: allDevices.filter(row => row.tracking_status === 'discovered').length,
      ignored: allDevices.filter(row => row.tracking_status === 'ignored').length,
      retired: allDevices.filter(row => row.tracking_status === 'retired').length,
      missing: allDevices.filter(row => row.provider_status === 'missing').length,
    },
  };
}

export async function getLastBeliotScan(): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('beliot_scan_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Record<string, unknown> | null;
}

// ============================================
// Изменение статусов
// ============================================

export async function updateTrackingStatus(
  deviceIds: string[],
  status: BeliotTrackingStatus,
  userId: string,
  userEmail: string,
): Promise<number> {
  if (status === 'tracked') {
    const { data: overrides, error } = await supabase
      .from('beliot_device_overrides')
      .select('device_id, device_role')
      .in('device_id', deviceIds);
    if (error) throw new Error(error.message);
    const roles = new Map((overrides ?? []).map(row => [String(row.device_id), row.device_role]));
    const missingRoles = deviceIds.filter(id => !roles.get(id));
    if (missingRoles.length > 0) {
      throw new Error(`Для счётчиков не назначена роль: ${missingRoles.join(', ')}`);
    }
  }

  const { data, error } = await supabase
    .from('beliot_devices')
    .update({ tracking_status: status })
    .in('device_id', deviceIds)
    .select('device_id');
  if (error) throw new Error(error.message);
  await supabase.from('user_activity_logs').insert({
    user_id: userId,
    user_email: userEmail,
    activity_type: 'other',
    activity_description: `Статус счётчиков Beliot изменён на ${status}`,
    entity_type: 'other',
    metadata: { device_ids: deviceIds, tracking_status: status },
  });
  return data?.length ?? 0;
}

export interface BeliotDeviceConfiguration {
  name?: string | null;
  group?: string | null;
  role?: 'source' | 'production' | 'domestic' | null;
}

export async function updateDeviceConfiguration(
  deviceId: string,
  configuration: BeliotDeviceConfiguration,
  userEmail: string,
): Promise<void> {
  const { error } = await supabase.from('beliot_device_overrides').upsert({
    device_id: deviceId,
    name: configuration.name?.trim() || null,
    device_group: configuration.group?.trim() || null,
    device_role: configuration.role ?? null,
    modified_by: userEmail,
    last_modified: new Date().toISOString(),
  }, { onConflict: 'device_id' });
  if (error) throw new Error(error.message);
}
