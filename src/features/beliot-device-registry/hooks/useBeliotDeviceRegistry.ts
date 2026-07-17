import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getBeliotDevices,
  getBeliotScanStatus,
  startBeliotScan,
  updateBeliotDeviceConfiguration,
  updateBeliotDevicesTracking,
  updateBeliotDeviceTracking,
} from '../services/beliotDeviceRegistryApi';
import type {
  BeliotDeviceFilters,
  BeliotDevicesResponse,
  BeliotScanInfo,
  BeliotDeviceRole,
  DeviceTrackingStatus,
} from '../types/beliotDeviceRegistry';

const DEFAULT_FILTERS: BeliotDeviceFilters = {
  search: '',
  status: 'all',
  page: 1,
  pageSize: 20,
};

interface UseBeliotDeviceRegistryResult {
  data: BeliotDevicesResponse | null;
  scan: BeliotScanInfo | null;
  filters: BeliotDeviceFilters;
  loading: boolean;
  actionLoading: boolean;
  error: string | null;
  setSearch: (search: string) => void;
  setStatus: (status: BeliotDeviceFilters['status']) => void;
  setPage: (page: number) => void;
  reload: () => Promise<void>;
  startScan: () => Promise<void>;
  updateTracking: (deviceId: string, status: DeviceTrackingStatus) => Promise<boolean>;
  updateBulkTracking: (deviceIds: string[], status: DeviceTrackingStatus) => Promise<boolean>;
  updateConfiguration: (
    deviceId: string,
    configuration: { name: string; group: string; role: BeliotDeviceRole | null },
  ) => Promise<boolean>;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Не удалось выполнить запрос';
}

export function useBeliotDeviceRegistry(): UseBeliotDeviceRegistryResult {
  const [data, setData] = useState<BeliotDevicesResponse | null>(null);
  const [scan, setScan] = useState<BeliotScanInfo | null>(null);
  const [filters, setFilters] = useState<BeliotDeviceFilters>(DEFAULT_FILTERS);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef<number>(0);

  const loadDevices = useCallback(async (): Promise<void> => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const response = await getBeliotDevices(filters);
      if (requestId === requestIdRef.current) {
        setData(response);
        setScan(response.lastScan);
      }
    } catch (requestError: unknown) {
      if (requestId === requestIdRef.current) {
        setError(getErrorMessage(requestError));
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [filters]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadDevices();
    }, filters.search ? 300 : 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadDevices, filters.search]);

  useEffect(() => {
    if (scan?.status !== 'queued' && scan?.status !== 'running') {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      void getBeliotScanStatus()
        .then(({ scan: nextScan }) => {
          setScan(nextScan);
          if (nextScan.status === 'completed' || nextScan.status === 'failed') {
            void loadDevices();
          }
        })
        .catch((requestError: unknown) => setError(getErrorMessage(requestError)));
    }, 2000);

    return () => window.clearInterval(intervalId);
  }, [loadDevices, scan?.status]);

  const handleStartScan = useCallback(async (): Promise<void> => {
    setActionLoading(true);
    setError(null);
    try {
      const response = await startBeliotScan();
      setScan(response.scan);
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError));
    } finally {
      setActionLoading(false);
    }
  }, []);

  const handleUpdateTracking = useCallback(async (
    deviceId: string,
    status: DeviceTrackingStatus,
  ): Promise<boolean> => {
    setActionLoading(true);
    setError(null);
    try {
      await updateBeliotDeviceTracking(deviceId, status);
      await loadDevices();
      return true;
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError));
      return false;
    } finally {
      setActionLoading(false);
    }
  }, [loadDevices]);

  const handleUpdateBulkTracking = useCallback(async (
    deviceIds: string[],
    status: DeviceTrackingStatus,
  ): Promise<boolean> => {
    setActionLoading(true);
    setError(null);
    try {
      await updateBeliotDevicesTracking(deviceIds, status);
      await loadDevices();
      return true;
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError));
      return false;
    } finally {
      setActionLoading(false);
    }
  }, [loadDevices]);

  const handleUpdateConfiguration = useCallback(async (
    deviceId: string,
    configuration: { name: string; group: string; role: BeliotDeviceRole | null },
  ): Promise<boolean> => {
    setActionLoading(true);
    setError(null);
    try {
      await updateBeliotDeviceConfiguration(deviceId, configuration);
      await loadDevices();
      return true;
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError));
      return false;
    } finally {
      setActionLoading(false);
    }
  }, [loadDevices]);

  return {
    data,
    scan,
    filters,
    loading,
    actionLoading,
    error,
    setSearch: (search: string) => setFilters((current) => ({ ...current, search, page: 1 })),
    setStatus: (status: BeliotDeviceFilters['status']) => (
      setFilters((current) => ({ ...current, status, page: 1 }))
    ),
    setPage: (page: number) => setFilters((current) => ({ ...current, page })),
    reload: loadDevices,
    startScan: handleStartScan,
    updateTracking: handleUpdateTracking,
    updateBulkTracking: handleUpdateBulkTracking,
    updateConfiguration: handleUpdateConfiguration,
  };
}
