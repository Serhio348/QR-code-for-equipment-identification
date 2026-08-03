/**
 * meterReplacementService.ts
 *
 * Управляет очередью подтверждения замен физических счётчиков Beliot.
 *
 * Структура / что умеет:
 * 1. listMeterReplacementEvents — возвращает события с данными реестра
 * 2. confirmMeterReplacement — атомарно применяет подтверждённую замену
 * 3. dismissMeterReplacement — отклоняет ложное срабатывание
 */

import { createClient } from '@supabase/supabase-js';
import { config } from '../../../config/env.js';
import type {
  BeliotMeterReplacementEvent,
  BeliotReplacementStatus,
} from './beliotTypes.js';

// ============================================
// Клиент и типы
// ============================================

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export interface ConfirmMeterReplacementInput {
  replacementDay: string;
  newSerialNumber: string;
  firstDayVolumeM3: number | null;
  reason: string | null;
}

type ReplacementRow = Record<string, unknown>;

// ============================================
// Преобразование данных
// ============================================

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function mapReplacementEvent(
  row: ReplacementRow,
  providerNames: Map<string, string | null>,
  overrideNames: Map<string, string | null>,
): BeliotMeterReplacementEvent {
  const deviceId = String(row.device_id);
  return {
    id: String(row.id),
    device_id: deviceId,
    status: row.status as BeliotReplacementStatus,
    detection_source: row.detection_source as BeliotMeterReplacementEvent['detection_source'],
    old_reading_value: nullableNumber(row.old_reading_value),
    old_reading_at: nullableString(row.old_reading_at),
    new_reading_value: nullableNumber(row.new_reading_value),
    new_reading_at: nullableString(row.new_reading_at),
    drop_m3: nullableNumber(row.drop_m3),
    drop_ratio: nullableNumber(row.drop_ratio),
    suggested_replacement_day: nullableString(row.suggested_replacement_day),
    old_serial_number: nullableString(row.old_serial_number),
    provider_serial_number: nullableString(row.provider_serial_number),
    confirmed_serial_number: nullableString(row.confirmed_serial_number),
    first_day_volume_m3: nullableNumber(row.first_day_volume_m3),
    reason: nullableString(row.reason),
    detected_at: String(row.detected_at),
    provider_name: providerNames.get(deviceId) ?? null,
    override_name: overrideNames.get(deviceId) ?? null,
  };
}

async function enrichRows(rows: ReplacementRow[]): Promise<BeliotMeterReplacementEvent[]> {
  const deviceIds = [...new Set(rows.map(row => String(row.device_id)))];
  if (deviceIds.length === 0) return [];

  const [{ data: devices }, { data: overrides }] = await Promise.all([
    supabase.from('beliot_devices').select('device_id, provider_name').in('device_id', deviceIds),
    supabase.from('beliot_device_overrides').select('device_id, name').in('device_id', deviceIds),
  ]);
  const providerNames = new Map(
    (devices ?? []).map(row => [String(row.device_id), nullableString(row.provider_name)]),
  );
  const overrideNames = new Map(
    (overrides ?? []).map(row => [String(row.device_id), nullableString(row.name)]),
  );
  return rows.map(row => mapReplacementEvent(row, providerNames, overrideNames));
}

// ============================================
// Публичный API
// ============================================

export async function listMeterReplacementEvents(
  status: BeliotReplacementStatus = 'pending_review',
): Promise<BeliotMeterReplacementEvent[]> {
  const { data, error } = await supabase
    .from('beliot_meter_replacement_events')
    .select('*')
    .eq('status', status)
    .order('detected_at', { ascending: false });
  if (error) throw new Error(error.message);
  return enrichRows((data ?? []) as ReplacementRow[]);
}

export async function getPendingReplacementCount(): Promise<number> {
  const { count, error } = await supabase
    .from('beliot_meter_replacement_events')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending_review');
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function confirmMeterReplacement(
  eventId: string,
  input: ConfirmMeterReplacementInput,
  userId: string,
  userEmail: string,
): Promise<BeliotMeterReplacementEvent> {
  const { error } = await supabase.rpc('confirm_beliot_meter_replacement', {
    p_event_id: eventId,
    p_replacement_day: input.replacementDay,
    p_new_serial_number: input.newSerialNumber,
    p_first_day_volume_m3: input.firstDayVolumeM3,
    p_reason: input.reason,
    p_confirmed_by: userId,
  });
  if (error) throw new Error(error.message);

  await supabase.from('user_activity_logs').insert({
    user_id: userId,
    user_email: userEmail,
    activity_type: 'other',
    activity_description: 'Подтверждена замена счётчика Beliot',
    entity_type: 'other',
    entity_id: eventId,
    metadata: {
      replacement_day: input.replacementDay,
      new_serial_number: input.newSerialNumber,
    },
  });

  const { data, error: reloadError } = await supabase
    .from('beliot_meter_replacement_events')
    .select('*')
    .eq('id', eventId)
    .single();
  if (reloadError) throw new Error(reloadError.message);
  const [event] = await enrichRows([data as ReplacementRow]);
  return event;
}

export async function dismissMeterReplacement(
  eventId: string,
  reason: string | null,
  userId: string,
  userEmail: string,
): Promise<BeliotMeterReplacementEvent> {
  const { data, error } = await supabase
    .from('beliot_meter_replacement_events')
    .update({
      status: 'dismissed',
      reason,
      dismissed_by: userId,
      dismissed_at: new Date().toISOString(),
    })
    .eq('id', eventId)
    .in('status', ['suspected', 'pending_review'])
    .select('*')
    .single();
  if (error) throw new Error(error.message);

  await supabase.from('user_activity_logs').insert({
    user_id: userId,
    user_email: userEmail,
    activity_type: 'other',
    activity_description: 'Отклонено предположение о замене счётчика Beliot',
    entity_type: 'other',
    entity_id: eventId,
    metadata: { reason },
  });

  const [event] = await enrichRows([data as ReplacementRow]);
  return event;
}
