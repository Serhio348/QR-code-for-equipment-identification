/**
 * API клиент для работы с пользовательскими изменениями счетчиков Beliot через Supabase
 * 
 * Заменяет хранение в Google Sheets на Supabase для улучшения производительности.
 */

import { supabase } from '../../config/supabase';

export interface BeliotDeviceOverride {
  id?: string;
  device_id: string;
  name?: string;
  address?: string;
  serial_number?: string;
  device_group?: string;
  object_name?: string;
  // Паспортные данные
  manufacture_date?: string; // Дата выпуска (формат: YYYY-MM-DD)
  manufacturer?: string; // Производитель
  verification_date?: string; // Дата поверки (формат: YYYY-MM-DD)
  next_verification_date?: string; // Дата следующей поверки (формат: YYYY-MM-DD)
  // Служебные поля
  last_sync?: string;
  last_modified?: string;
  modified_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface BeliotDevicesOverrides {
  [deviceId: string]: BeliotDeviceOverride;
}

/**
 * Получить все пользовательские изменения счетчиков из Supabase
 * 
 * @returns {Promise<BeliotDevicesOverrides>} Объект с изменениями по deviceId
 */
export async function getBeliotDevicesOverrides(): Promise<BeliotDevicesOverrides> {
  try {
    const { data, error } = await supabase
      .from('beliot_device_overrides')
      .select('*')
      .order('last_modified', { ascending: false });

    if (error) {
      console.error('Ошибка получения изменений счетчиков из Supabase:', error);
      return {};
    }

    // Преобразуем массив в объект по device_id
    const overrides: BeliotDevicesOverrides = {};
    if (data) {
      data.forEach((override) => {
        overrides[override.device_id] = {
          id: override.id,
          device_id: override.device_id,
          name: override.name,
          address: override.address,
          serial_number: override.serial_number,
          device_group: override.device_group,
          object_name: override.object_name,
          manufacture_date: override.manufacture_date,
          manufacturer: override.manufacturer,
          verification_date: override.verification_date,
          next_verification_date: override.next_verification_date,
          last_sync: override.last_sync,
          last_modified: override.last_modified,
          modified_by: override.modified_by,
          created_at: override.created_at,
          updated_at: override.updated_at,
        };
      });
    }

    return overrides;
  } catch (error: any) {
    console.error('Ошибка получения изменений счетчиков из Supabase:', error);
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
    const { data, error } = await supabase
      .from('beliot_device_overrides')
      .select('*')
      .eq('device_id', deviceId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Запись не найдена - это нормально
        return null;
      }
      console.error(`Ошибка получения изменений для устройства ${deviceId}:`, error);
      return null;
    }

    return data as BeliotDeviceOverride;
  } catch (error: any) {
    console.error(`Ошибка получения изменений для устройства ${deviceId}:`, error);
    return null;
  }
}

/**
 * Сохранить изменения для устройства в Supabase
 * 
 * @param {string} deviceId - ID устройства из Beliot API
 * @param {Partial<BeliotDeviceOverride>} override - Данные для сохранения
 * @returns {Promise<BeliotDeviceOverride>} Сохраненные данные
 */
export async function saveBeliotDeviceOverride(
  deviceId: string,
  override: Partial<BeliotDeviceOverride>
): Promise<BeliotDeviceOverride> {
  try {
    // Получаем текущего пользователя для modified_by
    const { data: { user } } = await supabase.auth.getUser();
    const modifiedBy = user?.email || undefined;

    const overrideData = {
      device_id: deviceId,
      name: override.name,
      address: override.address,
      serial_number: override.serial_number,
      device_group: override.device_group,
      object_name: override.object_name,
      manufacture_date: override.manufacture_date || null,
      manufacturer: override.manufacturer || null,
      verification_date: override.verification_date || null,
      next_verification_date: override.next_verification_date || null,
      modified_by: modifiedBy || undefined, // Преобразуем null в undefined
      last_modified: new Date().toISOString(),
    };

    // Используем upsert (INSERT ... ON CONFLICT DO UPDATE)
    const { data, error } = await supabase
      .from('beliot_device_overrides')
      .upsert(overrideData, {
        onConflict: 'device_id',
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (error) {
      console.error(`Ошибка сохранения изменений для устройства ${deviceId}:`, error);
      throw new Error(`Не удалось сохранить изменения: ${error.message}`);
    }

    return data as BeliotDeviceOverride;
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
    // Получаем текущего пользователя для modified_by
    if (!modifiedBy) {
      const { data: { user } } = await supabase.auth.getUser();
      modifiedBy = user?.email || undefined;
    }

    const overrideArray = Object.entries(overrides).map(([deviceId, override]) => ({
      device_id: deviceId,
      name: override.name,
      address: override.address,
      serial_number: override.serial_number,
      device_group: override.device_group,
      object_name: override.object_name,
      manufacture_date: override.manufacture_date || null,
      manufacturer: override.manufacturer || null,
      verification_date: override.verification_date || null,
      next_verification_date: override.next_verification_date || null,
      modified_by: modifiedBy || undefined, // Преобразуем null в undefined
      last_modified: new Date().toISOString(),
    }));

    const { data, error } = await supabase
      .from('beliot_device_overrides')
      .upsert(overrideArray, {
        onConflict: 'device_id',
        ignoreDuplicates: false,
      })
      .select();

    if (error) {
      console.error('Ошибка массового сохранения изменений:', error);
      throw new Error(`Не удалось сохранить изменения: ${error.message}`);
    }

    return {
      success: true,
      saved: data?.length || 0,
    };
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
    const { error } = await supabase
      .from('beliot_device_overrides')
      .delete()
      .eq('device_id', deviceId);

    if (error) {
      console.error(`Ошибка удаления изменений для устройства ${deviceId}:`, error);
      return false;
    }

    return true;
  } catch (error: any) {
    console.error(`Ошибка удаления изменений для устройства ${deviceId}:`, error);
    return false;
  }
}

