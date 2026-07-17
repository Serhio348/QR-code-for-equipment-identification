/**
 * beliotTypes.ts
 *
 * Типы серверной интеграции с Beliot и реестра счётчиков.
 *
 * Структура / что умеет:
 * 1. BeliotProviderDevice — нормализованное устройство провайдера
 * 2. BeliotRegistryDevice — строка административного реестра
 * 3. BeliotScanResult — итог полного сканирования
 */

// ============================================
// Типы провайдера и реестра
// ============================================

export type BeliotTrackingStatus = 'discovered' | 'tracked' | 'ignored' | 'retired';
export type BeliotProviderStatus = 'available' | 'missing';

export interface BeliotProviderDevice {
  deviceId: string;
  name: string | null;
  serialNumber: string | null;
  address: string | null;
  objectName: string | null;
  providerData: Record<string, unknown>;
}

export interface BeliotRegistryDevice {
  device_id: string;
  provider_name: string | null;
  provider_serial_number: string | null;
  provider_address: string | null;
  provider_object_name: string | null;
  bootstrap_group_name: string | null;
  tracking_status: BeliotTrackingStatus;
  provider_status: BeliotProviderStatus;
  consecutive_misses: number;
  discovered_at: string;
  last_seen_at: string | null;
  updated_at: string;
  override_name: string | null;
  serial_number: string | null;
  address: string | null;
  object_name: string | null;
  device_group: string | null;
  device_role: 'source' | 'production' | 'domestic' | null;
  last_reading_at: string | null;
  last_reading_value: number | null;
}

export interface BeliotScanResult {
  scanId: string;
  found: number;
  new: number;
  updated: number;
  missing: number;
  scannedAt: string;
}
