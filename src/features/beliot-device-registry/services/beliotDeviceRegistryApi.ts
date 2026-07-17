import { supabase } from '@/shared/config/supabase';
import type {
  BeliotDeviceFilters,
  BeliotDevicesResponse,
  BeliotScanResponse,
  BeliotTrackingUpdateResponse,
  BeliotDeviceRole,
  DeviceTrackingStatus,
} from '../types/beliotDeviceRegistry';

const API_URL = import.meta.env.VITE_AI_CONSULTANT_API_URL || '';
const BELIOT_API_PATH = '/api/water/beliot';

async function authenticatedRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    throw new Error('Сессия истекла. Войдите в систему повторно.');
  }

  const response = await fetch(`${API_URL}${BELIOT_API_PATH}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let message = `Ошибка сервера (${response.status})`;

    try {
      const body = await response.json() as { error?: string; message?: string };
      message = body.message ?? body.error ?? message;
    } catch {
      // Ответ сервера может не содержать JSON.
    }

    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export async function getBeliotDevices(filters: BeliotDeviceFilters): Promise<BeliotDevicesResponse> {
  const query = new URLSearchParams({
    page: String(filters.page),
    pageSize: String(filters.pageSize),
  });

  if (filters.search.trim()) {
    query.set('search', filters.search.trim());
  }
  if (filters.status !== 'all') {
    query.set('status', filters.status);
  }

  return authenticatedRequest<BeliotDevicesResponse>(`/devices?${query.toString()}`);
}

export async function startBeliotScan(): Promise<BeliotScanResponse> {
  return authenticatedRequest<BeliotScanResponse>('/scan', { method: 'POST' });
}

export async function getBeliotScanStatus(): Promise<BeliotScanResponse> {
  return authenticatedRequest<BeliotScanResponse>('/scan/status');
}

export async function updateBeliotDeviceTracking(
  deviceId: string,
  trackingStatus: DeviceTrackingStatus,
): Promise<BeliotTrackingUpdateResponse> {
  return authenticatedRequest<BeliotTrackingUpdateResponse>(
    `/devices/${encodeURIComponent(deviceId)}/tracking`,
    {
      method: 'PATCH',
      body: JSON.stringify({ trackingStatus }),
    },
  );
}

export async function updateBeliotDevicesTracking(
  deviceIds: string[],
  trackingStatus: DeviceTrackingStatus,
): Promise<BeliotTrackingUpdateResponse> {
  return authenticatedRequest<BeliotTrackingUpdateResponse>('/devices/bulk-tracking', {
    method: 'POST',
    body: JSON.stringify({ deviceIds, trackingStatus }),
  });
}

export async function updateBeliotDeviceConfiguration(
  deviceId: string,
  configuration: {
    name: string;
    group: string;
    role: BeliotDeviceRole | null;
  },
): Promise<void> {
  await authenticatedRequest<{ updated: boolean }>(
    `/devices/${encodeURIComponent(deviceId)}/config`,
    {
      method: 'PATCH',
      body: JSON.stringify(configuration),
    },
  );
}
