/**
 * Состояние отслеживания счётчика в реестре.
 */
export type DeviceTrackingStatus = 'discovered' | 'tracked' | 'ignored' | 'retired';
export type BeliotDeviceRole = 'source' | 'production' | 'domestic';

/**
 * Состояние серверного сканирования устройств Beliot.
 */
export type DeviceScanStatus = 'idle' | 'queued' | 'running' | 'completed' | 'failed';

/**
 * Данные пользователя, присоединённые сервером к счётчику.
 */
export interface BeliotDeviceUser {
  id: string;
  name: string | null;
  group: string | null;
  role: BeliotDeviceRole | null;
}

/**
 * Последнее известное показание счётчика.
 */
export interface BeliotDeviceReading {
  value: number;
  unit: string;
  recordedAt: string;
}

/**
 * Устройство Beliot из административного реестра.
 */
export interface BeliotRegistryDevice {
  id: string;
  provider: string;
  providerStatus: 'available' | 'missing';
  providerDeviceId: string;
  serialNumber: string | null;
  name: string | null;
  trackingStatus: DeviceTrackingStatus;
  user: BeliotDeviceUser | null;
  lastReading: BeliotDeviceReading | null;
}

/**
 * Сводные количества устройств по состояниям отслеживания.
 */
export interface BeliotRegistrySummary {
  total: number;
  discovered: number;
  tracked: number;
  ignored: number;
  retired: number;
  missing: number;
}

/**
 * Информация о последнем сканировании провайдера.
 */
export interface BeliotScanInfo {
  id: string | null;
  status: DeviceScanStatus;
  startedAt: string | null;
  finishedAt: string | null;
  discoveredCount: number;
  updatedCount: number;
  error: string | null;
}

/**
 * Параметры серверной фильтрации реестра.
 */
export interface BeliotDeviceFilters {
  search: string;
  status: DeviceTrackingStatus | 'all';
  page: number;
  pageSize: number;
}

/**
 * Постраничный ответ GET /api/water/beliot/devices.
 */
export interface BeliotDevicesResponse {
  devices: BeliotRegistryDevice[];
  summary: BeliotRegistrySummary;
  lastScan: BeliotScanInfo | null;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Ответ POST /api/water/beliot/scan и GET /api/water/beliot/scan/status.
 */
export interface BeliotScanResponse {
  scan: BeliotScanInfo;
}

/**
 * Ответ операций изменения одного или нескольких устройств.
 */
export interface BeliotTrackingUpdateResponse {
  updatedCount: number;
  devices: BeliotRegistryDevice[];
}
