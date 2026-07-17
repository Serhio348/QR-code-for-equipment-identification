/**
 * Клиент реестра отслеживаемых устройств Beliot.
 *
 * Возвращает DB-реестр, а при его недоступности — legacy-конфигурацию,
 * чтобы переход не останавливал существующий интерфейс.
 */

import { supabase } from '@/shared/config/supabase';
import {
  BELOT_DEVICE_GROUPS,
  configureBeliotRuntimeRules,
  getBeliotUiDeviceIds,
} from '../constants/beliotDeviceRegistry';

export interface TrackedBeliotRegistryDevice {
  deviceId: string;
  groupName: string;
}

export interface TrackedBeliotRegistryResult {
  devices: TrackedBeliotRegistryDevice[];
  usedFallback: boolean;
}

/**
 * Загрузить отслеживаемые устройства и пользовательские группы.
 */
export async function getTrackedBeliotRegistry(): Promise<TrackedBeliotRegistryResult> {
  const { data, error } = await supabase
    .from('beliot_devices')
    .select('device_id, bootstrap_group_name')
    .eq('tracking_status', 'tracked')
    .order('device_id');

  if (!error && data) {
    const ids = data.map(row => String(row.device_id));
    const [overridesResult, rulesResult, correctionsResult] = await Promise.all([
      supabase
        .from('beliot_device_overrides')
        .select('device_id, device_group')
        .in('device_id', ids),
      supabase
        .from('beliot_device_rules')
        .select('device_id, is_hvo_aggregate, combine_group_key, combine_group_label, meter_replacement_day'),
      supabase
        .from('beliot_reading_day_corrections')
        .select('device_id, correction_day, volume_m3'),
    ]);
    const { data: overrideRows, error: overridesError } = overridesResult;
    if (overridesError) {
      console.warn('[Beliot registry] Не удалось загрузить группы:', overridesError.message);
    }
    if (!rulesResult.error && !correctionsResult.error) {
      const ruleRows = rulesResult.data ?? [];
      configureBeliotRuntimeRules({
        hvoAggregateIds: ruleRows
          .filter(row => row.is_hvo_aggregate)
          .map(row => String(row.device_id)),
        combinedGroups: ruleRows
          .filter(row => row.combine_group_key && row.combine_group_label)
          .map(row => ({
            deviceId: String(row.device_id),
            key: String(row.combine_group_key),
            label: String(row.combine_group_label),
          })),
        replacements: ruleRows
          .filter(row => row.meter_replacement_day)
          .map(row => ({
            deviceId: String(row.device_id),
            day: String(row.meter_replacement_day),
          })),
        corrections: (correctionsResult.data ?? []).map(row => ({
          deviceId: String(row.device_id),
          day: String(row.correction_day),
          volumeM3: Number(row.volume_m3),
        })),
      });
    }
    const groups = new Map(
      (overrideRows ?? []).map(row => [String(row.device_id), row.device_group as string | null]),
    );
    const devices = data.map((row) => {
      return {
        deviceId: String(row.device_id),
        groupName: groups.get(String(row.device_id))
          || row.bootstrap_group_name
          || 'Без группы',
      };
    });
    return { devices, usedFallback: false };
  }

  console.warn('[Beliot registry] Используется legacy fallback:', error?.message);
  const groupById = new Map<string, string>();
  for (const group of BELOT_DEVICE_GROUPS) {
    for (const id of group.deviceIds) groupById.set(id, group.name);
  }
  return {
    devices: getBeliotUiDeviceIds().map(deviceId => ({
      deviceId,
      groupName: groupById.get(deviceId) || 'Без группы',
    })),
    usedFallback: true,
  };
}
