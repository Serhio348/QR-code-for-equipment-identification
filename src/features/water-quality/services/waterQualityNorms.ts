/**
 * API для работы с нормативами качества воды
 *
 * Нормативы задают границы (оптимум/предупреждение/допуск) для конкретного параметра
 * и (опционально) для конкретной точки отбора проб или оборудования.
 */

import { supabase } from '../../../shared/config/supabase';
import type {
  CacheOptions,
  WaterQualityNorm,
  WaterQualityNormInput,
  WaterQualityNormUpdate,
} from '@/features/water-quality/types/waterQuality';

import {
  deduplicateRequest,
  generateCacheKey,
  getCacheEntry,
  getCacheOptions,
  isCacheStale,
  isCacheValid,
  setCacheEntry,
  clearWaterQualityCache,
} from './cache';
import { validateId } from './validators';
import { mapWaterQualityNormFromDb } from './mappers';
import { recheckResultsForParameter } from './compliance';

function validateNumber(
  value: number | undefined,
  fieldName: string,
  allowNegative: boolean = false
): void {
  if (value === undefined || value === null) return;
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`${fieldName} должно быть числом`);
  }
  if (!allowNegative && value < 0) {
    throw new Error(`${fieldName} не может быть отрицательным`);
  }
}

function normalizeOptionalId(value?: string): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Получить все нормативы (активные) с фильтрами
 *
 * @param filters - samplingPointId / equipmentId / parameterName
 * @param useCache - использовать кэш (по умолчанию true)
 * @param cacheOptions - опции кэширования
 */
export async function getAllWaterQualityNorms(
  filters?: {
    samplingPointId?: string;
    equipmentId?: string;
    parameterName?: string;
  },
  useCache: boolean = true,
  cacheOptions?: CacheOptions
): Promise<WaterQualityNorm[]> {
  try {
    const cacheOpts = getCacheOptions(cacheOptions);
    const cacheKey = generateCacheKey('water_quality_norms', { ...filters });

    let staleData: WaterQualityNorm[] | null = null;

    if (useCache) {
      const cached = getCacheEntry(cacheKey);
      if (cached) {
        if (isCacheValid(cached)) return cached.data;
        if (isCacheStale(cached)) staleData = cached.data;
      }
    }

    const fetchPromise = deduplicateRequest(cacheKey, async () => {
      let query = supabase
        .from('water_quality_norms')
        .select('*')
        .eq('is_active', true)
        .order('parameter_name', { ascending: true });

      if (filters?.samplingPointId !== undefined) {
        if (filters.samplingPointId === '' || filters.samplingPointId === null) {
          // Фильтр для общих нормативов (sampling_point_id IS NULL)
          query = query.is('sampling_point_id', null);
        } else {
          // Фильтр для конкретной точки отбора проб
          query = query.eq('sampling_point_id', filters.samplingPointId);
        }
      }
      if (filters?.equipmentId) {
        query = query.eq('equipment_id', filters.equipmentId);
      }
      if (filters?.parameterName) {
        query = query.eq('parameter_name', filters.parameterName);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[waterQualityNormsApi] Ошибка getAllWaterQualityNorms:', {
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint,
          },
          filters,
        });
        throw new Error(error.message || 'Ошибка при получении нормативов');
      }

      const result = (data || []).map(mapWaterQualityNormFromDb);
      if (useCache) setCacheEntry(cacheKey, result, cacheOpts);
      return result;
    });

    if (staleData !== null && cacheOpts.staleWhileRevalidate) {
      fetchPromise.catch(err => {
        console.error(
          '[waterQualityNormsApi] Ошибка обновления кэша (stale-while-revalidate):',
          err
        );
      });
      return staleData;
    }

    return await fetchPromise;
  } catch (error: any) {
    console.error('[waterQualityNormsApi] Исключение в getAllWaterQualityNorms:', error);
    throw error;
  }
}

/**
 * Получить норматив по ID
 *
 * @param id - ID норматива
 * @param useCache - использовать кэш (по умолчанию true)
 * @param cacheOptions - опции кэширования
 */
export async function getWaterQualityNormById(
  id: string,
  useCache: boolean = true,
  cacheOptions?: CacheOptions
): Promise<WaterQualityNorm> {
  try {
    validateId(id, 'ID норматива');

    const cacheOpts = getCacheOptions(cacheOptions);
    const cacheKey = generateCacheKey('water_quality_norm', { id: id.trim() });

    if (useCache) {
      const cached = getCacheEntry(cacheKey);
      if (cached && isCacheValid(cached)) return cached.data;
    }

    const { data, error } = await supabase
      .from('water_quality_norms')
      .select('*')
      .eq('id', id.trim())
      .single();

    if (error) {
      console.error('[waterQualityNormsApi] Ошибка getWaterQualityNormById:', {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        id: id.trim(),
      });
      throw new Error(error.message || 'Ошибка при получении норматива');
    }

    if (!data) throw new Error('Норматив не найден');

    const result = mapWaterQualityNormFromDb(data);
    if (useCache) setCacheEntry(cacheKey, result, cacheOpts);
    return result;
  } catch (error: any) {
    if (error?.message && (error.message.includes('обязателен') || error.message.includes('не найден'))) {
      throw error;
    }

    console.error('[waterQualityNormsApi] Исключение в getWaterQualityNormById:', {
      error: error?.message || error,
      stack: error?.stack,
      id,
    });
    throw error;
  }
}

/**
 * Создать норматив
 */
export async function createWaterQualityNorm(input: WaterQualityNormInput): Promise<WaterQualityNorm> {
  try {
    if (!input?.parameterName) {
      throw new Error('Параметр норматива обязателен');
    }
    if (!input?.unit || !input.unit.trim()) {
      throw new Error('Единица измерения обязательна');
    }

    // Валидация числовых значений (неотрицательные)
    validateNumber(input.optimalMin, 'Оптимальное минимальное значение');
    validateNumber(input.optimalMax, 'Оптимальное максимальное значение');
    validateNumber(input.minAllowed, 'Минимальное допустимое значение');
    validateNumber(input.maxAllowed, 'Максимальное допустимое значение');
    validateNumber(input.warningMin, 'Минимальное значение предупреждения');
    validateNumber(input.warningMax, 'Максимальное значение предупреждения');
    validateNumber(input.warningThresholdPercent, 'Порог предупреждения (%)');
    validateNumber(input.alarmThresholdPercent, 'Порог тревоги (%)');

    // Валидация диапазонов (если обе границы заданы)
    if (input.optimalMin !== undefined && input.optimalMax !== undefined && input.optimalMin > input.optimalMax) {
      throw new Error('Оптимальное минимальное значение не может быть больше максимального');
    }
    if (input.minAllowed !== undefined && input.maxAllowed !== undefined && input.minAllowed > input.maxAllowed) {
      throw new Error('Минимальное допустимое значение не может быть больше максимального');
    }
    if (input.warningMin !== undefined && input.warningMax !== undefined && input.warningMin > input.warningMax) {
      throw new Error('Порог предупреждения: min не может быть больше max');
    }

    const { data: authData } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('water_quality_norms')
      .insert({
        sampling_point_id: normalizeOptionalId(input.samplingPointId),
        equipment_id: normalizeOptionalId(input.equipmentId),
        parameter_name: input.parameterName,
        optimal_min: input.optimalMin ?? null,
        optimal_max: input.optimalMax ?? null,
        min_allowed: input.minAllowed ?? null,
        max_allowed: input.maxAllowed ?? null,
        warning_min: input.warningMin ?? null,
        warning_max: input.warningMax ?? null,
        unit: input.unit.trim(),
        regulation_reference: input.regulationReference?.trim() || null,
        regulation_document_url: input.regulationDocumentUrl?.trim() || null,
        enable_notifications: input.enableNotifications !== undefined ? input.enableNotifications : true,
        warning_threshold_percent: input.warningThresholdPercent ?? 10.0,
        alarm_threshold_percent: input.alarmThresholdPercent ?? 5.0,
        is_active: input.isActive !== undefined ? input.isActive : true,
        created_by: authData?.user?.email || null,
      })
      .select('*')
      .single();

    if (error) {
      console.error('[waterQualityNormsApi] Ошибка createWaterQualityNorm:', {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        input: {
          parameterName: input.parameterName,
          unit: input.unit,
          samplingPointId: input.samplingPointId,
          equipmentId: input.equipmentId,
          isActive: input.isActive,
        },
      });

      if (error.code === '23505') {
        throw new Error('Норматив для этого параметра уже существует');
      }

      throw new Error(error.message || 'Ошибка при создании норматива');
    }

    if (!data) throw new Error('Не удалось создать норматив');

    // Кэш нормативов теперь неактуален
    clearWaterQualityCache('water_quality_norms');

    // Перепроверяем результаты для этого параметра (RPC)
    try {
      await recheckResultsForParameter(data.parameter_name);
    } catch (recheckError: any) {
      console.warn('[waterQualityNormsApi] Предупреждение при перепроверке результатов:', recheckError);
    }

    return mapWaterQualityNormFromDb(data);
  } catch (error: any) {
    if (
      error?.message &&
      (error.message.includes('обязател') ||
        error.message.includes('не может быть') ||
        error.message.includes('уже существует') ||
        error.message.includes('Не удалось создать'))
    ) {
      throw error;
    }

    console.error('[waterQualityNormsApi] Исключение в createWaterQualityNorm:', {
      error: error?.message || error,
      stack: error?.stack,
    });
    throw error;
  }
}

/**
 * Обновить норматив
 */
export async function updateWaterQualityNorm(id: string, input: WaterQualityNormUpdate): Promise<WaterQualityNorm> {
  try {
    validateId(id, 'ID норматива');

    if (input.unit !== undefined && !input.unit.trim()) {
      throw new Error('Единица измерения не может быть пустой');
    }

    validateNumber(input.optimalMin, 'Оптимальное минимальное значение');
    validateNumber(input.optimalMax, 'Оптимальное максимальное значение');
    validateNumber(input.minAllowed, 'Минимальное допустимое значение');
    validateNumber(input.maxAllowed, 'Максимальное допустимое значение');
    validateNumber(input.warningMin, 'Минимальное значение предупреждения');
    validateNumber(input.warningMax, 'Максимальное значение предупреждения');
    validateNumber(input.warningThresholdPercent, 'Порог предупреждения (%)');
    validateNumber(input.alarmThresholdPercent, 'Порог тревоги (%)');

    // Валидация диапазонов (если обе границы заданы)
    if (input.optimalMin !== undefined && input.optimalMax !== undefined && input.optimalMin > input.optimalMax) {
      throw new Error('Оптимальное минимальное значение не может быть больше максимального');
    }
    if (input.minAllowed !== undefined && input.maxAllowed !== undefined && input.minAllowed > input.maxAllowed) {
      throw new Error('Минимальное допустимое значение не может быть больше максимального');
    }
    if (input.warningMin !== undefined && input.warningMax !== undefined && input.warningMin > input.warningMax) {
      throw new Error('Порог предупреждения: min не может быть больше max');
    }

    const updateData: any = {};

    // Примечание: 
    // - updated_at обновляется автоматически триггером update_water_quality_norms_updated_at
    // - колонка updated_by отсутствует в таблице water_quality_norms
    // - используется только created_by для отслеживания создателя

    if (input.samplingPointId !== undefined) updateData.sampling_point_id = normalizeOptionalId(input.samplingPointId);
    if (input.equipmentId !== undefined) updateData.equipment_id = normalizeOptionalId(input.equipmentId);
    if (input.parameterName !== undefined) updateData.parameter_name = input.parameterName;
    if (input.optimalMin !== undefined) updateData.optimal_min = input.optimalMin ?? null;
    if (input.optimalMax !== undefined) updateData.optimal_max = input.optimalMax ?? null;
    if (input.minAllowed !== undefined) updateData.min_allowed = input.minAllowed ?? null;
    if (input.maxAllowed !== undefined) updateData.max_allowed = input.maxAllowed ?? null;
    if (input.warningMin !== undefined) updateData.warning_min = input.warningMin ?? null;
    if (input.warningMax !== undefined) updateData.warning_max = input.warningMax ?? null;
    if (input.unit !== undefined) updateData.unit = input.unit.trim();
    if (input.regulationReference !== undefined) {
      updateData.regulation_reference = input.regulationReference?.trim() || null;
    }
    if (input.regulationDocumentUrl !== undefined) {
      updateData.regulation_document_url = input.regulationDocumentUrl?.trim() || null;
    }
    if (input.enableNotifications !== undefined) updateData.enable_notifications = input.enableNotifications;
    if (input.warningThresholdPercent !== undefined) {
      updateData.warning_threshold_percent = input.warningThresholdPercent;
    }
    if (input.alarmThresholdPercent !== undefined) {
      updateData.alarm_threshold_percent = input.alarmThresholdPercent;
    }
    if (input.isActive !== undefined) updateData.is_active = input.isActive;

    // Проверяем, что есть хотя бы одно поле для обновления
    if (Object.keys(updateData).length === 0) {
      throw new Error('Не указаны поля для обновления');
    }

    const { data, error } = await supabase
      .from('water_quality_norms')
      .update(updateData)
      .eq('id', id.trim())
      .select('*')
      .maybeSingle();

    if (error) {
      console.error('[waterQualityNormsApi] Ошибка updateWaterQualityNorm:', {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        id: id.trim(),
        updateFields: Object.keys(updateData),
      });

      if (error.code === '23505') {
        throw new Error('Норматив для этого параметра уже существует');
      }

      throw new Error(error.message || 'Ошибка при обновлении норматива');
    }

    if (!data) {
      throw new Error('Норматив не найден или нет прав для просмотра');
    }

    clearWaterQualityCache('water_quality_norms');
    clearWaterQualityCache(`water_quality_norm_${id.trim()}`);

    // Перепроверяем результаты для параметра норматива
    try {
      await recheckResultsForParameter(data.parameter_name);
    } catch (recheckError: any) {
      console.warn('[waterQualityNormsApi] Предупреждение при перепроверке результатов:', recheckError);
    }

    return mapWaterQualityNormFromDb(data);
  } catch (error: any) {
    if (
      error?.message &&
      (error.message.includes('обязателен') ||
        error.message.includes('не может быть') ||
        error.message.includes('должно быть') ||
        error.message.includes('не указаны поля') ||
        error.message.includes('уже существует') ||
        error.message.includes('не найден'))
    ) {
      throw error;
    }

    console.error('[waterQualityNormsApi] Исключение в updateWaterQualityNorm:', {
      error: error?.message || error,
      stack: error?.stack,
      id,
    });
    throw error;
  }
}

/**
 * Удалить норматив
 */
export async function deleteWaterQualityNorm(id: string): Promise<void> {
  try {
    validateId(id, 'ID норматива');

    const { data, error } = await supabase
      .from('water_quality_norms')
      .delete()
      .eq('id', id.trim())
      .select();

    if (error) {
      console.error('[waterQualityNormsApi] Ошибка deleteWaterQualityNorm:', {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        id: id.trim(),
      });
      
      // Специальная обработка ошибки RLS (Row Level Security)
      if (error.code === '42501' || error.message?.includes('permission') || error.message?.includes('policy')) {
        throw new Error('Недостаточно прав для удаления норматива');
      }
      
      throw new Error(error.message || 'Ошибка при удалении норматива');
    }

    // Проверяем, что запись действительно была удалена
    if (!data || data.length === 0) {
      console.warn('[waterQualityNormsApi] Норматив не найден или уже удален:', id.trim());
      // Не считаем это ошибкой - возможно, норматив уже был удален
    }

    // Очищаем весь кэш нормативов (включая все варианты с фильтрами)
    clearWaterQualityCache('water_quality_norms');
    clearWaterQualityCache(`water_quality_norm_${id.trim()}`);
  } catch (error: any) {
    if (error?.message && error.message.includes('обязателен')) {
      throw error;
    }

    console.error('[waterQualityNormsApi] Исключение в deleteWaterQualityNorm:', {
      error: error?.message || error,
      stack: error?.stack,
      id,
    });
    throw error;
  }
}

