/**
 * API клиент для синхронизации пользовательских изменений счетчиков Beliot
 * 
 * Работает с Google Sheets через Google Apps Script API
 * Хранит только пользовательские изменения (overrides), не полные данные счетчиков
 */

import { apiRequest } from './apiRequest';
import { API_CONFIG } from '../../config/api';

export interface BeliotDeviceOverride {
  name?: string;
  address?: string;
  serialNumber?: string;
  group?: string;
  lastSync?: number;
  lastModified?: number;
  modifiedBy?: string;
}

export interface BeliotDevicesOverrides {
  [deviceId: string]: BeliotDeviceOverride;
}

/**
 * Получить все пользовательские изменения счетчиков из Google Sheets
 * 
 * @returns {Promise<BeliotDevicesOverrides>} Объект с изменениями по deviceId
 */
export async function getBeliotDevicesOverrides(): Promise<BeliotDevicesOverrides> {
  try {
    const response = await apiRequest<BeliotDevicesOverrides>(
      'getBeliotDevicesOverrides',
      'GET'
    );

    if (response.success && response.data) {
      return response.data;
    }

    return {};
  } catch (error: any) {
    console.error('Ошибка получения изменений счетчиков из Google Sheets:', error);
    // Возвращаем пустой объект при ошибке, чтобы не блокировать работу приложения
    return {};
  }
}

/**
 * Получить изменения для конкретного устройства
 * 
 * @param {string} deviceId - ID устройства из Beliot API
 * @returns {Promise<BeliotDeviceOverride | null>} Изменения или null
 */
export async function getBeliotDeviceOverride(
  deviceId: string
): Promise<BeliotDeviceOverride | null> {
  try {
    const response = await apiRequest<BeliotDeviceOverride>(
      'getBeliotDeviceOverride',
      'GET',
      undefined,
      { deviceId }
    );

    if (response.success && response.data) {
      return response.data;
    }

    return null;
  } catch (error: any) {
    console.error(`Ошибка получения изменений для устройства ${deviceId}:`, error);
    return null;
  }
}

/**
 * Сохранить изменения для устройства в Google Sheets
 * 
 * @param {string} deviceId - ID устройства из Beliot API
 * @param {BeliotDeviceOverride} override - Данные для сохранения
 * @returns {Promise<BeliotDeviceOverride>} Сохраненные данные
 */
export async function saveBeliotDeviceOverride(
  deviceId: string,
  override: BeliotDeviceOverride
): Promise<BeliotDeviceOverride> {
  try {
    const response = await apiRequest<BeliotDeviceOverride>(
      'saveBeliotDeviceOverride',
      'POST',
      {
        deviceId,
        ...override,
      }
    );

    if (response.success && response.data) {
      return response.data;
    }

    throw new Error('Не удалось сохранить изменения');
  } catch (error: any) {
    console.error(`Ошибка сохранения изменений для устройства ${deviceId}:`, error);
    throw error;
  }
}

/**
 * Сохранить несколько изменений за раз
 * 
 * @param {BeliotDevicesOverrides} overrides - Объект с изменениями по deviceId
 * @param {string} modifiedBy - Email пользователя (опционально)
 * @returns {Promise<{ success: boolean; saved: number }>} Результат сохранения
 */
export async function saveBeliotDevicesOverrides(
  overrides: BeliotDevicesOverrides,
  modifiedBy?: string
): Promise<{ success: boolean; saved: number }> {
  try {
    const response = await apiRequest<{ success: boolean; saved: number; results: any }>(
      'saveBeliotDevicesOverrides',
      'POST',
      {
        overrides,
        modifiedBy,
      }
    );

    if (response.success && response.data) {
      return {
        success: response.data.success,
        saved: response.data.saved,
      };
    }

    throw new Error('Не удалось сохранить изменения');
  } catch (error: any) {
    console.error('Ошибка массового сохранения изменений:', error);
    throw error;
  }
}

/**
 * Удалить изменения для устройства
 * 
 * @param {string} deviceId - ID устройства
 * @returns {Promise<boolean>} true если удалено успешно
 */
export async function deleteBeliotDeviceOverride(deviceId: string): Promise<boolean> {
  try {
    const response = await apiRequest<boolean>(
      'deleteBeliotDeviceOverride',
      'POST',
      { deviceId }
    );

    return response.success && response.data === true;
  } catch (error: any) {
    console.error(`Ошибка удаления изменений для устройства ${deviceId}:`, error);
    return false;
  }
}

