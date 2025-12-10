/**
 * React hook для управления хранением данных счетчиков Beliot
 * 
 * Предоставляет удобный интерфейс для работы с пользовательскими изменениями
 * (имя, место расположения, серийный номер)
 */

import { useState, useEffect, useCallback } from 'react';
import {
  loadDeviceOverrides,
  saveDeviceOverrides,
  updateDeviceOverride,
  removeDeviceOverride,
  clearAllOverrides,
  getDeviceOverride,
  hasDeviceOverride,
  DeviceOverrides,
} from '../utils/beliotStorage';

export interface UseBeliotDevicesStorageReturn {
  overrides: DeviceOverrides;
  updateOverride: (deviceId: string, field: 'name' | 'address' | 'serialNumber', value: string) => void;
  removeOverride: (deviceId: string) => void;
  clearOverrides: () => void;
  getOverride: (deviceId: string) => DeviceOverrides[string] | undefined;
  hasOverride: (deviceId: string) => boolean;
  reload: () => void;
}

/**
 * Hook для работы с хранилищем данных счетчиков Beliot
 * 
 * @returns {UseBeliotDevicesStorageReturn} Объект с методами и данными
 */
export function useBeliotDevicesStorage(): UseBeliotDevicesStorageReturn {
  const [overrides, setOverrides] = useState<DeviceOverrides>(() => loadDeviceOverrides());

  // Загружаем данные при монтировании
  useEffect(() => {
    const loaded = loadDeviceOverrides();
    setOverrides(loaded);
  }, []);

  // Обновление изменения для устройства
  const updateOverride = useCallback((
    deviceId: string,
    field: 'name' | 'address' | 'serialNumber',
    value: string
  ) => {
    updateDeviceOverride(deviceId, { [field]: value });
    setOverrides(loadDeviceOverrides());
  }, []);

  // Удаление изменения для устройства
  const removeOverride = useCallback((deviceId: string) => {
    removeDeviceOverride(deviceId);
    setOverrides(loadDeviceOverrides());
  }, []);

  // Очистка всех изменений
  const clearOverrides = useCallback(() => {
    clearAllOverrides();
    setOverrides({});
  }, []);

  // Получение изменения для устройства
  const getOverride = useCallback((deviceId: string) => {
    return getDeviceOverride(deviceId);
  }, []);

  // Проверка наличия изменения
  const hasOverride = useCallback((deviceId: string) => {
    return hasDeviceOverride(deviceId);
  }, []);

  // Перезагрузка данных
  const reload = useCallback(() => {
    const loaded = loadDeviceOverrides();
    setOverrides(loaded);
  }, []);

  return {
    overrides,
    updateOverride,
    removeOverride,
    clearOverrides,
    getOverride,
    hasOverride,
    reload,
  };
}

