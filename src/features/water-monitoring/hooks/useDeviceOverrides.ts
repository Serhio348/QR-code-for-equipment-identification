/**
 * useDeviceOverrides
 *
 * Управляет переопределениями (имена, адреса, серийные номера, объекты) для счётчиков.
 * Двухуровневое хранение: localStorage (быстро) + Supabase (постоянно).
 */

import { useState, useRef, useCallback } from 'react';
import { useBeliotDevicesStorage } from './useBeliotDevicesStorage';
import {
  getBeliotDevicesOverrides,
  saveBeliotDeviceOverride,
  type BeliotDeviceOverride,
} from '@/shared/services/api/supabaseBeliotOverridesApi';

export type OverrideField = 'name' | 'address' | 'serialNumber' | 'object';

export function useDeviceOverrides() {
  const [syncedOverrides, setSyncedOverrides] = useState<Record<string, BeliotDeviceOverride>>({});
  const [syncing, setSyncing] = useState(false);

  const {
    updateOverride: updateLocalOverride,
    getOverride: getLocalOverride,
  } = useBeliotDevicesStorage();

  // Защита от параллельных вызовов sync для одного и того же поля/устройства
  const syncingRef = useRef<Set<string>>(new Set());

  // ─── Синхронизация с Supabase ─────────────────────────────────────────────

  const syncOverridesFromServer = useCallback(async () => {
    try {
      setSyncing(true);
      console.log('🔄 Синхронизация изменений счетчиков с Supabase...');
      const serverOverrides = await getBeliotDevicesOverrides();
      setSyncedOverrides(serverOverrides);
      console.log('✅ Синхронизация завершена:', Object.keys(serverOverrides).length, 'устройств');
    } catch (error: any) {
      console.error('❌ Ошибка синхронизации с Supabase:', error);
    } finally {
      setSyncing(false);
    }
  }, []);

  // ─── Быстрое сохранение в localStorage ───────────────────────────────────

  const updateLocalValue = useCallback((
    deviceId: string,
    field: OverrideField,
    value: string,
  ) => {
    if (!deviceId) {
      console.error('❌ updateLocalValue: deviceId не указан!', { deviceId, field, value });
      return;
    }
    updateLocalOverride(deviceId, field, value);
  }, [updateLocalOverride]);

  // ─── Синхронизация с Supabase (при onBlur / Enter) ────────────────────────

  const syncOverrideToSupabase = useCallback(async (
    deviceId: string,
    field: OverrideField,
  ) => {
    if (!deviceId) {
      console.error('❌ syncOverrideToSupabase: deviceId не указан!', { deviceId, field });
      return;
    }

    const syncKey = `${deviceId}_${field}`;
    if (syncingRef.current.has(syncKey)) {
      console.log('⏸️ Синхронизация уже выполняется для', syncKey);
      return;
    }

    syncingRef.current.add(syncKey);

    try {
      const currentOverride = getLocalOverride(deviceId);
      const overrideData: Partial<BeliotDeviceOverride> = {};

      if (currentOverride) {
        if (currentOverride.name !== undefined) overrideData.name = currentOverride.name;
        if (currentOverride.address !== undefined) overrideData.address = currentOverride.address;
        if (currentOverride.serialNumber !== undefined) overrideData.serial_number = currentOverride.serialNumber;
        if (currentOverride.object !== undefined) overrideData.object_name = currentOverride.object;
      }

      console.log('💾 Отправка данных в Supabase:', { deviceId, overrideData });
      await saveBeliotDeviceOverride(deviceId, overrideData);
      console.log(`✅ Изменения для устройства ${deviceId} синхронизированы с Supabase`);

      const updated = await getBeliotDevicesOverrides();
      setSyncedOverrides(updated);
    } catch (error: any) {
      console.error(`❌ Ошибка синхронизации для устройства ${deviceId}:`, error);
    } finally {
      syncingRef.current.delete(syncKey);
    }
  }, [getLocalOverride]);

  // ─── Чтение с приоритетом localStorage > Supabase > default ──────────────

  const getEditableValue = useCallback((
    deviceId: string,
    field: OverrideField,
    defaultValue: string,
  ): string => {
    const id = String(deviceId);

    const localOverride = getLocalOverride(id);
    if (localOverride && localOverride[field] !== undefined) {
      return localOverride[field]!;
    }

    const syncedOverride = syncedOverrides[id];
    if (syncedOverride) {
      if (field === 'serialNumber' && syncedOverride.serial_number !== undefined) return syncedOverride.serial_number;
      if (field === 'object' && syncedOverride.object_name !== undefined) return syncedOverride.object_name;
      if (field === 'name' && syncedOverride.name !== undefined) return syncedOverride.name;
      if (field === 'address' && syncedOverride.address !== undefined) return syncedOverride.address;
    }

    return defaultValue;
  }, [getLocalOverride, syncedOverrides]);

  return {
    syncedOverrides, setSyncedOverrides,
    syncing,
    syncOverridesFromServer,
    updateLocalValue,
    syncOverrideToSupabase,
    getEditableValue,
  };
}
