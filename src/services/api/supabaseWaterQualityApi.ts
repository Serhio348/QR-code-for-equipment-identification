/**
 * supabaseWaterQualityApi.ts
 * 
 * API функции для работы с измерениями качества воды через Supabase
 */

import { supabase } from '../../config/supabase';
import type {
  SamplingPoint,
  SamplingPointInput,
  WaterAnalysis,
  WaterAnalysisInput,
  AnalysisResult,
  AnalysisResultInput,
  WaterQualityNorm,
  WaterQualityNormInput,
  WaterAnalysisWithResults,
  PaginationOptions,
  PaginatedResponse,
  AnalysisResultsFilter,
  CacheOptions,
  WaterQualityAlert,
  WaterQualityIncident,
  WaterQualityIncidentInput,
  WaterQualityIncidentUpdate,
  ResultEvaluation,
  WaterQualityParameter,
  AlertStatus,
  AlertType,
  AlertPriority,
  IncidentStatus,
  IncidentSeverity,
  IncidentType,
} from '../../types/waterQuality';

// ============================================================================
// КЭШИРОВАНИЕ
// ============================================================================

/**
 * Структура записи в кэше
 */
interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
  staleWhileRevalidate: boolean;
}

/**
 * Кэш для хранения результатов запросов
 * Ключ: строка с параметрами запроса, значение: запись кэша
 */
const cache = new Map<string, CacheEntry>();

/**
 * Время жизни кэша по умолчанию в миллисекундах (5 минут)
 */
const DEFAULT_CACHE_TTL = 5 * 60 * 1000;

/**
 * Максимальное количество записей по умолчанию (защита от выгрузки всей таблицы)
 */
const DEFAULT_MAX_LIMIT = 1000;

/**
 * Максимальный лимит для исторических данных (можно увеличить при необходимости)
 */
const MAX_HISTORICAL_LIMIT = 10000;

/**
 * Проверка валидности кэша
 */
function isCacheValid(entry: CacheEntry): boolean {
  const age = Date.now() - entry.timestamp;
  return age < entry.ttl;
}

/**
 * Проверка, является ли кэш устаревшим (stale), но еще пригодным для stale-while-revalidate
 */
function isCacheStale(entry: CacheEntry): boolean {
  const age = Date.now() - entry.timestamp;
  return age >= entry.ttl && entry.staleWhileRevalidate;
}

/**
 * Генерация ключа кэша из параметров
 */
function generateCacheKey(prefix: string, params: Record<string, any>): string {
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}:${JSON.stringify(params[key])}`)
    .join('|');
  return `${prefix}_${sortedParams}`;
}

/**
 * Получить опции кэша с значениями по умолчанию
 */
function getCacheOptions(options?: CacheOptions): Required<CacheOptions> {
  return {
    ttl: options?.ttl ?? DEFAULT_CACHE_TTL,
    staleWhileRevalidate: options?.staleWhileRevalidate ?? false,
  };
}

/**
 * Очистка кэша (для использования при обновлении/удалении данных)
 */
export function clearWaterQualityCache(pattern?: string): void {
  if (pattern) {
    // Удаляем только записи, соответствующие паттерну
    for (const key of cache.keys()) {
      if (key.startsWith(pattern)) {
        cache.delete(key);
      }
    }
  } else {
    // Очищаем весь кэш
    cache.clear();
  }
}

/**
 * Активные запросы для дедупликации параллельных вызовов
 * Ключ: ключ кэша, значение: Promise запроса
 */
const activeRequests = new Map<string, Promise<any>>();

/**
 * Выполнить запрос с дедупликацией параллельных вызовов
 */
async function deduplicateRequest<T>(
  cacheKey: string,
  requestFn: () => Promise<T>
): Promise<T> {
  // Если запрос уже выполняется, возвращаем существующий Promise
  const existingRequest = activeRequests.get(cacheKey);
  if (existingRequest) {
    return existingRequest as Promise<T>;
  }

  // Создаем новый запрос
  const requestPromise = requestFn()
    .finally(() => {
      // Удаляем из активных запросов после завершения
      activeRequests.delete(cacheKey);
    });

  // Сохраняем в активных запросах
  activeRequests.set(cacheKey, requestPromise);

  return requestPromise;
}

/**
 * Валидация ISO строки даты
 */
function validateISODate(dateString: string, fieldName: string): void {
  if (!dateString || typeof dateString !== 'string') {
    throw new Error(`${fieldName} должна быть строкой`);
  }

  // Проверяем формат ISO 8601 (YYYY-MM-DD или YYYY-MM-DDTHH:mm:ss.sssZ)
  // Используем конструктор RegExp для избежания проблем с экранированием в шаблонных строках
  const isoDatePattern = '^\\d{4}-\\d{2}-\\d{2}(T\\d{2}:\\d{2}:\\d{2}(\\.\\d{3})?(Z|[+-]\\d{2}:\\d{2}))?)?$';
  const isoDateRegex = new RegExp(isoDatePattern);
  
  if (!isoDateRegex.test(dateString.trim())) {
    throw new Error(`${fieldName} должна быть в формате ISO 8601: YYYY-MM-DD или YYYY-MM-DDTHH:mm:ss.sssZ`);
  }

  // Проверяем, что дата валидна
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    throw new Error(`${fieldName} содержит невалидную дату`);
  }
}

// ============================================================================
// ПУНКТЫ ОТБОРА ПРОБ (SAMPLING POINTS)
// ============================================================================

/**
 * Получить все пункты отбора проб
 * 
 * @param limit - Максимальное количество записей (по умолчанию 1000, максимум 10000)
 * @param useCache - Использовать кэш (по умолчанию true)
 * @param cacheOptions - Опции кэширования
 */
export async function getAllSamplingPoints(
  limit: number = DEFAULT_MAX_LIMIT,
  useCache: boolean = true,
  cacheOptions?: CacheOptions
): Promise<SamplingPoint[]> {
  try {
    // Валидация лимита (увеличен максимум для исторических данных)
    const validLimit = Math.min(Math.max(1, limit), MAX_HISTORICAL_LIMIT);

    // Получаем опции кэша
    const cacheOpts = getCacheOptions(cacheOptions);

    // Проверка кэша
    const cacheKey = generateCacheKey('sampling_points', { limit: validLimit });
    let staleData: SamplingPoint[] | null = null;
    
    if (useCache) {
      const cached = cache.get(cacheKey);
      if (cached) {
        if (isCacheValid(cached)) {
          return cached.data;
        }
        // Если кэш устарел, но включен stale-while-revalidate, сохраняем для возврата
        if (isCacheStale(cached)) {
          staleData = cached.data;
        }
      }
    }

    // Выполняем запрос с дедупликацией (в фоне, если есть stale данные)
    const fetchPromise = deduplicateRequest(cacheKey, async () => {
      const { data, error } = await supabase
        .from('sampling_points')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true })
        .limit(validLimit);

      if (error) {
        console.error('[supabaseWaterQualityApi] Ошибка getAllSamplingPoints:', {
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint,
          },
          limit: validLimit,
        });
        throw new Error(error.message || 'Ошибка при получении пунктов отбора проб');
      }

      const result = (data || []).map(mapSamplingPointFromDb);

      // Сохраняем в кэш
      if (useCache) {
        cache.set(cacheKey, {
          data: result,
          timestamp: Date.now(),
          ttl: cacheOpts.ttl,
          staleWhileRevalidate: cacheOpts.staleWhileRevalidate,
        });
      }

      return result;
    });

    // Если есть stale данные, возвращаем их немедленно, затем обновляем
    if (staleData !== null && cacheOpts.staleWhileRevalidate) {
      // Обновляем кэш в фоне (не ждем)
      fetchPromise.catch(err => {
        console.error('[supabaseWaterQualityApi] Ошибка обновления кэша (stale-while-revalidate):', err);
      });
      return staleData;
    }

    // Иначе ждем результат запроса
    return await fetchPromise;
  } catch (error: any) {
    console.error('[supabaseWaterQualityApi] Исключение в getAllSamplingPoints:', error);
    throw error;
  }
}

/**
 * Получить пункт отбора проб по ID
 */
export async function getSamplingPointById(id: string): Promise<SamplingPoint> {
  try {
    const { data, error } = await supabase
      .from('sampling_points')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('[supabaseWaterQualityApi] Ошибка getSamplingPointById:', error);
      throw new Error(error.message || 'Ошибка при получении пункта отбора проб');
    }

    if (!data) {
      throw new Error('Пункт отбора проб не найден');
    }

    return mapSamplingPointFromDb(data);
  } catch (error: any) {
    console.error('[supabaseWaterQualityApi] Ошибка getSamplingPointById:', error);
    throw error;
  }
}

/**
 * Создать новый пункт отбора проб
 */
export async function createSamplingPoint(input: SamplingPointInput): Promise<SamplingPoint> {
  try {
    // Валидация входных данных
    if (!input.code || !input.name) {
      throw new Error('Код и название обязательны для заполнения');
    }

    const trimmedCode = input.code.trim();
    const trimmedName = input.name.trim();

    // Проверка длины кода
    if (trimmedCode.length < 2) {
      throw new Error('Код должен содержать минимум 2 символа');
    }

    if (trimmedCode.length > 50) {
      throw new Error('Код не должен превышать 50 символов');
    }

    // Проверка длины названия
    if (trimmedName.length < 2) {
      throw new Error('Название должно содержать минимум 2 символа');
    }

    if (trimmedName.length > 200) {
      throw new Error('Название не должно превышать 200 символов');
    }

    const { data: { user } } = await supabase.auth.getUser();
    
    const { data, error } = await supabase
      .from('sampling_points')
      .insert({
        code: trimmedCode,
        name: trimmedName,
        description: input.description?.trim() || null,
        equipment_id: input.equipmentId || null,
        location: input.location?.trim() || null,
        sampling_frequency: input.samplingFrequency || null,
        sampling_schedule: input.samplingSchedule || null,
        responsible_person: input.responsiblePerson?.trim() || null,
        is_active: input.isActive !== undefined ? input.isActive : true,
        created_by: user?.email || null,
      })
      .select('*')
      .single();

    if (error) {
      console.error('[supabaseWaterQualityApi] Ошибка createSamplingPoint:', {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        input: {
          code: trimmedCode,
          name: trimmedName,
          hasDescription: !!input.description,
          hasEquipmentId: !!input.equipmentId,
          hasLocation: !!input.location,
          samplingFrequency: input.samplingFrequency,
          isActive: input.isActive,
        },
      });
      
      if (error.code === '23505') {
        throw new Error('Пункт отбора проб с таким кодом уже существует');
      }
      
      throw new Error(error.message || 'Ошибка при создании пункта отбора проб');
    }

    if (!data) {
      throw new Error('Не удалось создать пункт отбора проб');
    }

    return mapSamplingPointFromDb(data);
  } catch (error: any) {
    // Если ошибка уже обработана выше, просто пробрасываем
    if (error.message && (
      error.message.includes('обязательны') ||
      error.message.includes('должен содержать') ||
      error.message.includes('не должен превышать') ||
      error.message.includes('уже существует')
    )) {
      throw error;
    }
    
    console.error('[supabaseWaterQualityApi] Исключение в createSamplingPoint:', {
      error: error.message || error,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Обновить пункт отбора проб
 */
export async function updateSamplingPoint(
  id: string,
  input: Partial<SamplingPointInput>
): Promise<SamplingPoint> {
  try {
    // Валидация ID
    if (!id || !id.trim()) {
      throw new Error('ID пункта отбора проб обязателен');
    }

    // Валидация входных данных
    if (input.code !== undefined) {
      const trimmedCode = input.code.trim();
      if (!trimmedCode) {
        throw new Error('Код не может быть пустым');
      }
      if (trimmedCode.length < 2) {
        throw new Error('Код должен содержать минимум 2 символа');
      }
      if (trimmedCode.length > 50) {
        throw new Error('Код не должен превышать 50 символов');
      }
    }

    if (input.name !== undefined) {
      const trimmedName = input.name.trim();
      if (!trimmedName) {
        throw new Error('Название не может быть пустым');
      }
      if (trimmedName.length < 2) {
        throw new Error('Название должно содержать минимум 2 символа');
      }
      if (trimmedName.length > 200) {
        throw new Error('Название не должно превышать 200 символов');
      }
    }

    // Получаем текущего пользователя для updated_by
    const { data: { user } } = await supabase.auth.getUser();

    const updateData: any = {
      updated_at: new Date().toISOString(), // Явно обновляем updated_at
    };

    // Добавляем updated_by, если пользователь авторизован
    if (user?.email) {
      updateData.updated_by = user.email;
    }

    if (input.code !== undefined) updateData.code = input.code.trim();
    if (input.name !== undefined) updateData.name = input.name.trim();
    if (input.description !== undefined) updateData.description = input.description?.trim() || null;
    if (input.equipmentId !== undefined) updateData.equipment_id = input.equipmentId || null;
    if (input.location !== undefined) updateData.location = input.location?.trim() || null;
    if (input.samplingFrequency !== undefined) updateData.sampling_frequency = input.samplingFrequency || null;
    if (input.samplingSchedule !== undefined) updateData.sampling_schedule = input.samplingSchedule || null;
    if (input.responsiblePerson !== undefined) updateData.responsible_person = input.responsiblePerson?.trim() || null;
    if (input.isActive !== undefined) updateData.is_active = input.isActive;

    // Проверка, что есть хотя бы одно поле для обновления (кроме updated_at и updated_by)
    const userFields = Object.keys(updateData).filter(key => key !== 'updated_at' && key !== 'updated_by');
    if (userFields.length === 0) {
      throw new Error('Не указаны поля для обновления');
    }

    const { data, error } = await supabase
      .from('sampling_points')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error('[supabaseWaterQualityApi] Ошибка updateSamplingPoint:', {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        id,
        updateFields: Object.keys(updateData),
        input: {
          hasCode: input.code !== undefined,
          hasName: input.name !== undefined,
          hasDescription: input.description !== undefined,
          hasEquipmentId: input.equipmentId !== undefined,
          hasLocation: input.location !== undefined,
          samplingFrequency: input.samplingFrequency,
          isActive: input.isActive,
        },
      });
      
      if (error.code === '23505') {
        throw new Error('Пункт отбора проб с таким кодом уже существует');
      }
      
      throw new Error(error.message || 'Ошибка при обновлении пункта отбора проб');
    }

    if (!data) {
      throw new Error('Пункт отбора проб не найден');
    }

    // Очищаем кэш списка и конкретного пункта
    clearWaterQualityCache('sampling_points');
    clearWaterQualityCache(`sampling_point_${id}`);

    return mapSamplingPointFromDb(data);
  } catch (error: any) {
    // Если ошибка уже обработана выше, просто пробрасываем
    if (error.message && (
      error.message.includes('обязателен') ||
      error.message.includes('не может быть пустым') ||
      error.message.includes('должен содержать') ||
      error.message.includes('не должен превышать') ||
      error.message.includes('уже существует') ||
      error.message.includes('не найден') ||
      error.message.includes('поля для обновления')
    )) {
      throw error;
    }
    
    console.error('[supabaseWaterQualityApi] Исключение в updateSamplingPoint:', {
      error: error.message || error,
      stack: error.stack,
      id,
    });
    throw error;
  }
}

/**
 * Удалить пункт отбора проб
 */
export async function deleteSamplingPoint(id: string): Promise<void> {
  try {
    // Валидация ID
    if (!id || !id.trim()) {
      throw new Error('ID пункта отбора проб обязателен');
    }

    const { error } = await supabase
      .from('sampling_points')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[supabaseWaterQualityApi] Ошибка deleteSamplingPoint:', {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        id,
      });
      
      if (error.code === '23503') {
        throw new Error('Невозможно удалить пункт отбора проб: он используется в анализах');
      }
      
      throw new Error(error.message || 'Ошибка при удалении пункта отбора проб');
    }

    // Очищаем кэш списка и конкретного пункта
    clearWaterQualityCache('sampling_points');
    clearWaterQualityCache(`sampling_point_${id}`);
  } catch (error: any) {
    // Если ошибка уже обработана выше, просто пробрасываем
    if (error.message && (
      error.message.includes('обязателен') ||
      error.message.includes('используется в анализах')
    )) {
      throw error;
    }
    
    console.error('[supabaseWaterQualityApi] Исключение в deleteSamplingPoint:', {
      error: error.message || error,
      stack: error.stack,
      id,
    });
    throw error;
  }
}

// ============================================================================
// ЛАБОРАТОРНЫЕ АНАЛИЗЫ (WATER ANALYSIS)
// ============================================================================

/**
 * Получить все анализы
 * 
 * @param filters - Фильтры для выборки
 * @param limit - Максимальное количество записей (по умолчанию 1000, максимум 10000)
 * @param useCache - Использовать кэш (по умолчанию true)
 * @param cacheOptions - Опции кэширования
 */
export async function getAllWaterAnalyses(
  filters?: {
    samplingPointId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  },
  limit: number = DEFAULT_MAX_LIMIT,
  useCache: boolean = true,
  cacheOptions?: CacheOptions
): Promise<WaterAnalysis[]> {
  try {
    // Валидация дат в фильтрах
    if (filters?.startDate) {
      validateISODate(filters.startDate, 'Начальная дата фильтра');
    }
    if (filters?.endDate) {
      validateISODate(filters.endDate, 'Конечная дата фильтра');
    }

    // Валидация лимита (увеличен максимум для исторических данных)
    const validLimit = Math.min(Math.max(1, limit), MAX_HISTORICAL_LIMIT);

    // Получаем опции кэша
    const cacheOpts = getCacheOptions(cacheOptions);

    // Проверка кэша
    const cacheKey = generateCacheKey('water_analyses', { ...filters, limit: validLimit });
    let staleData: WaterAnalysis[] | null = null;
    
    if (useCache) {
      const cached = cache.get(cacheKey);
      if (cached) {
        if (isCacheValid(cached)) {
          return cached.data;
        }
        // Если кэш устарел, но включен stale-while-revalidate, сохраняем для возврата
        if (isCacheStale(cached)) {
          staleData = cached.data;
        }
      }
    }

    let query = supabase
      .from('water_analysis')
      .select('*')
      .order('sample_date', { ascending: false })
      .limit(validLimit);

    if (filters?.samplingPointId) {
      query = query.eq('sampling_point_id', filters.samplingPointId);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.startDate) {
      query = query.gte('sample_date', filters.startDate);
    }
    if (filters?.endDate) {
      query = query.lte('sample_date', filters.endDate);
    }

    // Выполняем запрос с дедупликацией (в фоне, если есть stale данные)
    const fetchPromise = deduplicateRequest(cacheKey, async () => {
      const { data, error } = await query;

      if (error) {
        console.error('[supabaseWaterQualityApi] Ошибка getAllWaterAnalyses:', {
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint,
          },
          filters,
          limit: validLimit,
        });
        throw new Error(error.message || 'Ошибка при получении анализов');
      }

      const result = (data || []).map(mapWaterAnalysisFromDb);

      // Сохраняем в кэш
      if (useCache) {
        cache.set(cacheKey, {
          data: result,
          timestamp: Date.now(),
          ttl: cacheOpts.ttl,
          staleWhileRevalidate: cacheOpts.staleWhileRevalidate,
        });
      }

      return result;
    });

    // Если есть stale данные, возвращаем их немедленно, затем обновляем
    if (staleData !== null && cacheOpts.staleWhileRevalidate) {
      // Обновляем кэш в фоне (не ждем)
      fetchPromise.catch(err => {
        console.error('[supabaseWaterQualityApi] Ошибка обновления кэша (stale-while-revalidate):', err);
      });
      return staleData;
    }

    // Иначе ждем результат запроса
    return await fetchPromise;
  } catch (error: any) {
    console.error('[supabaseWaterQualityApi] Исключение в getAllWaterAnalyses:', error);
    throw error;
  }
}

/**
 * Получить анализ по ID
 */
export async function getWaterAnalysisById(id: string): Promise<WaterAnalysisWithResults> {
  try {
    // Валидация ID
    if (!id || !id.trim()) {
      throw new Error('ID анализа обязателен');
    }

    const { data: analysis, error: analysisError } = await supabase
      .from('water_analysis')
      .select('*')
      .eq('id', id.trim())
      .single();

    if (analysisError) {
      console.error('[supabaseWaterQualityApi] Ошибка getWaterAnalysisById:', {
        error: {
          code: analysisError.code,
          message: analysisError.message,
          details: analysisError.details,
          hint: analysisError.hint,
        },
        id,
      });
      throw new Error(analysisError.message || 'Ошибка при получении анализа');
    }

    if (!analysis) {
      throw new Error('Анализ не найден');
    }

    // Получаем результаты анализа с пагинацией (получаем все результаты)
    // Проверка существования analysisId уже выполнена выше
    let results: AnalysisResult[] = [];
    try {
      const resultsResponse = await getAnalysisResults(id.trim(), { limit: 1000, offset: 0 });
      results = resultsResponse.data;
    } catch (resultsError: any) {
      console.error('[supabaseWaterQualityApi] Ошибка получения результатов:', {
        error: resultsError.message || resultsError,
        analysisId: id,
      });
      // Не бросаем ошибку, просто возвращаем анализ без результатов
    }

    const { data: samplingPoint, error: pointError } = await supabase
      .from('sampling_points')
      .select('*')
      .eq('id', analysis.sampling_point_id)
      .single();

    if (pointError) {
      console.debug('[supabaseWaterQualityApi] Пункт отбора проб не найден:', pointError);
    }

    return {
      ...mapWaterAnalysisFromDb(analysis),
      results: results,
      samplingPoint: samplingPoint ? mapSamplingPointFromDb(samplingPoint) : undefined,
    };
  } catch (error: any) {
    console.error('[supabaseWaterQualityApi] Ошибка getWaterAnalysisById:', error);
    throw error;
  }
}

/**
 * Создать новый анализ
 */
export async function createWaterAnalysis(input: WaterAnalysisInput): Promise<WaterAnalysis> {
  try {
    // Валидация входных данных
    if (!input.samplingPointId || !input.samplingPointId.trim()) {
      throw new Error('Пункт отбора проб обязателен для заполнения');
    }

    if (!input.sampleDate) {
      throw new Error('Дата отбора пробы обязательна для заполнения');
    }

    // Валидация формата дат ISO
    validateISODate(input.sampleDate, 'Дата отбора пробы');
    if (input.analysisDate) {
      validateISODate(input.analysisDate, 'Дата анализа');
    }
    if (input.receivedDate) {
      validateISODate(input.receivedDate, 'Дата получения результатов');
    }

    // Валидация логики дат (если указаны)
    if (input.analysisDate && new Date(input.analysisDate) < new Date(input.sampleDate)) {
      throw new Error('Дата анализа не может быть раньше даты отбора пробы');
    }

    if (input.receivedDate && input.analysisDate && new Date(input.receivedDate) < new Date(input.analysisDate)) {
      throw new Error('Дата получения результатов не может быть раньше даты анализа');
    }

    // Валидация внешней лаборатории
    if (input.externalLab && !input.externalLabName?.trim()) {
      throw new Error('Название внешней лаборатории обязательно, если анализ выполнен внешней лабораторией');
    }

    const { data: { user } } = await supabase.auth.getUser();
    
    const { data, error } = await supabase
      .from('water_analysis')
      .insert({
        sampling_point_id: input.samplingPointId.trim(),
        equipment_id: input.equipmentId || null,
        sample_date: input.sampleDate,
        analysis_date: input.analysisDate || null,
        received_date: input.receivedDate || null,
        sampled_by: input.sampledBy?.trim() || null,
        analyzed_by: input.analyzedBy?.trim() || null,
        responsible_person: input.responsiblePerson?.trim() || null,
        status: input.status || 'in_progress',
        notes: input.notes?.trim() || null,
        sample_condition: input.sampleCondition || null,
        external_lab: input.externalLab || false,
        external_lab_name: input.externalLabName?.trim() || null,
        certificate_number: input.certificateNumber?.trim() || null,
        attachment_urls: input.attachmentUrls || null,
        created_by: user?.email || null,
      })
      .select('*')
      .single();

    if (error) {
      console.error('[supabaseWaterQualityApi] Ошибка createWaterAnalysis:', {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        input: {
          samplingPointId: input.samplingPointId,
          hasEquipmentId: !!input.equipmentId,
          sampleDate: input.sampleDate,
          hasAnalysisDate: !!input.analysisDate,
          hasReceivedDate: !!input.receivedDate,
          status: input.status || 'in_progress',
          externalLab: input.externalLab || false,
          hasExternalLabName: !!input.externalLabName,
        },
      });
      throw new Error(error.message || 'Ошибка при создании анализа');
    }

    if (!data) {
      throw new Error('Не удалось создать анализ');
    }

    // Очищаем кэш списка анализов
    clearWaterQualityCache('water_analyses');
    clearWaterQualityCache(`water_analysis_${data.id}`);

    return mapWaterAnalysisFromDb(data);
  } catch (error: any) {
    // Если ошибка уже обработана выше, просто пробрасываем
    if (error.message && (
      error.message.includes('обязателен') ||
      error.message.includes('обязательна') ||
      error.message.includes('не может быть') ||
      error.message.includes('не удалось создать')
    )) {
      throw error;
    }
    
    console.error('[supabaseWaterQualityApi] Исключение в createWaterAnalysis:', {
      error: error.message || error,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Обновить анализ
 */
export async function updateWaterAnalysis(
  id: string,
  input: Partial<WaterAnalysisInput>
): Promise<WaterAnalysis> {
  try {
    // Валидация ID
    if (!id || !id.trim()) {
      throw new Error('ID анализа обязателен');
    }

    // Валидация формата дат ISO (если указаны)
    if (input.sampleDate) {
      validateISODate(input.sampleDate, 'Дата отбора пробы');
    }
    if (input.analysisDate) {
      validateISODate(input.analysisDate, 'Дата анализа');
    }
    if (input.receivedDate) {
      validateISODate(input.receivedDate, 'Дата получения результатов');
    }

    // Валидация логики дат (если указаны)
    if (input.sampleDate && input.analysisDate && new Date(input.analysisDate) < new Date(input.sampleDate)) {
      throw new Error('Дата анализа не может быть раньше даты отбора пробы');
    }

    if (input.receivedDate && input.analysisDate && new Date(input.receivedDate) < new Date(input.analysisDate)) {
      throw new Error('Дата получения результатов не может быть раньше даты анализа');
    }

    // Валидация внешней лаборатории
    if (input.externalLab && !input.externalLabName?.trim()) {
      throw new Error('Название внешней лаборатории обязательно, если анализ выполнен внешней лабораторией');
    }

    // Получаем текущего пользователя для updated_by
    const { data: { user } } = await supabase.auth.getUser();

    const updateData: any = {
      updated_at: new Date().toISOString(), // Явно обновляем updated_at
    };

    // Добавляем updated_by, если пользователь авторизован
    if (user?.email) {
      updateData.updated_by = user.email;
    }

    if (input.samplingPointId !== undefined) updateData.sampling_point_id = input.samplingPointId.trim();
    if (input.equipmentId !== undefined) updateData.equipment_id = input.equipmentId || null;
    if (input.sampleDate !== undefined) updateData.sample_date = input.sampleDate;
    if (input.analysisDate !== undefined) updateData.analysis_date = input.analysisDate || null;
    if (input.receivedDate !== undefined) updateData.received_date = input.receivedDate || null;
    if (input.sampledBy !== undefined) updateData.sampled_by = input.sampledBy?.trim() || null;
    if (input.analyzedBy !== undefined) updateData.analyzed_by = input.analyzedBy?.trim() || null;
    if (input.responsiblePerson !== undefined) updateData.responsible_person = input.responsiblePerson?.trim() || null;
    if (input.status !== undefined) updateData.status = input.status;
    if (input.notes !== undefined) updateData.notes = input.notes?.trim() || null;
    if (input.sampleCondition !== undefined) updateData.sample_condition = input.sampleCondition || null;
    if (input.externalLab !== undefined) updateData.external_lab = input.externalLab;
    if (input.externalLabName !== undefined) updateData.external_lab_name = input.externalLabName?.trim() || null;
    if (input.certificateNumber !== undefined) updateData.certificate_number = input.certificateNumber?.trim() || null;
    if (input.attachmentUrls !== undefined) updateData.attachment_urls = input.attachmentUrls || null;

    // Проверка, что есть хотя бы одно поле для обновления (кроме updated_at и updated_by)
    const userFields = Object.keys(updateData).filter(key => key !== 'updated_at' && key !== 'updated_by');
    if (userFields.length === 0) {
      throw new Error('Не указаны поля для обновления');
    }

    const { data, error } = await supabase
      .from('water_analysis')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error('[supabaseWaterQualityApi] Ошибка updateWaterAnalysis:', {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        id,
        updateFields: Object.keys(updateData).filter(key => key !== 'updated_at' && key !== 'updated_by'),
        input: {
          hasSamplingPointId: input.samplingPointId !== undefined,
          hasEquipmentId: input.equipmentId !== undefined,
          hasSampleDate: input.sampleDate !== undefined,
          hasAnalysisDate: input.analysisDate !== undefined,
          hasReceivedDate: input.receivedDate !== undefined,
          status: input.status,
          externalLab: input.externalLab,
        },
      });
      throw new Error(error.message || 'Ошибка при обновлении анализа');
    }

    if (!data) {
      throw new Error('Анализ не найден');
    }

    return mapWaterAnalysisFromDb(data);
  } catch (error: any) {
    // Если ошибка уже обработана выше, просто пробрасываем
    if (error.message && (
      error.message.includes('обязателен') ||
      error.message.includes('не может быть') ||
      error.message.includes('не указаны поля') ||
      error.message.includes('не найден')
    )) {
      throw error;
    }
    
    console.error('[supabaseWaterQualityApi] Исключение в updateWaterAnalysis:', {
      error: error.message || error,
      stack: error.stack,
      id,
    });
    throw error;
  }
}

/**
 * Удалить анализ
 */
export async function deleteWaterAnalysis(id: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('water_analysis')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[supabaseWaterQualityApi] Ошибка deleteWaterAnalysis:', error);
      throw new Error(error.message || 'Ошибка при удалении анализа');
    }

    // Очищаем кэш списка анализов, конкретного анализа и результатов
    clearWaterQualityCache('water_analyses');
    clearWaterQualityCache(`water_analysis_${id}`);
    clearWaterQualityCache('analysis_results');
  } catch (error: any) {
    console.error('[supabaseWaterQualityApi] Ошибка deleteWaterAnalysis:', error);
    throw error;
  }
}

// ============================================================================
// РЕЗУЛЬТАТЫ ИЗМЕРЕНИЙ (ANALYSIS RESULTS)
// ============================================================================

/**
 * Получить результаты анализа
 * 
 * @param analysisId - ID анализа (обязателен, валидируется)
 * @param options - Опции пагинации и фильтрации
 * @param options.limit - Максимальное количество записей (по умолчанию 100, максимум 1000)
 * @param options.offset - Смещение для пагинации (по умолчанию 0)
 * @param options.filter - Фильтры для результатов
 * @param options.filter.parameterName - Фильтр по типу параметра
 * @param options.filter.minValue - Минимальное значение
 * @param options.filter.maxValue - Максимальное значение
 * @returns Результаты измерений с метаданными пагинации
 * 
 * @example
 * // Получить все результаты анализа
 * const result = await getAnalysisResults('analysis-id');
 * 
 * // Получить результаты с пагинацией
 * const result = await getAnalysisResults('analysis-id', { limit: 10, offset: 0 });
 * 
 * // Получить результаты с фильтрацией по параметру
 * const result = await getAnalysisResults('analysis-id', {
 *   filter: { parameterName: 'iron', minValue: 0.1 }
 * });
 * 
 * @note Для получения связанных данных (метаданные параметров) можно использовать JOIN,
 * но это требует создания отдельной таблицы параметров в БД. Сейчас метаданные
 * хранятся в константе PARAMETER_METADATA в types/waterQuality.ts
 */
export async function getAnalysisResults(
  analysisId: string,
  options?: PaginationOptions & { filter?: AnalysisResultsFilter }
): Promise<PaginatedResponse<AnalysisResult>> {
  try {
    // Валидация ID
    if (!analysisId || !analysisId.trim()) {
      throw new Error('ID анализа обязателен');
    }

    const {
      limit = 100,
      offset = 0,
      filter,
    } = options || {};

    // Валидация параметров пагинации
    if (limit < 1 || limit > 1000) {
      throw new Error('Лимит должен быть от 1 до 1000');
    }

    if (offset < 0) {
      throw new Error('Смещение не может быть отрицательным');
    }

    // Строим запрос с подсчетом общего количества
    let query = supabase
      .from('analysis_results')
      .select('*', { count: 'exact' })
      .eq('analysis_id', analysisId.trim())
      .order('parameter_name', { ascending: true })
      .range(offset, offset + limit - 1);

    // Применяем фильтры
    if (filter?.parameterName) {
      query = query.eq('parameter_name', filter.parameterName);
    }

    if (filter?.minValue !== undefined) {
      query = query.gte('value', filter.minValue);
    }

    if (filter?.maxValue !== undefined) {
      query = query.lte('value', filter.maxValue);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[supabaseWaterQualityApi] Ошибка getAnalysisResults:', {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        analysisId,
        options,
      });
      throw new Error(error.message || 'Ошибка при получении результатов');
    }

    return {
      data: (data || []).map(mapAnalysisResultFromDb),
      total: count || 0,
      limit,
      offset,
      hasMore: (count || 0) > offset + limit,
    };
  } catch (error: any) {
    // Если ошибка уже обработана выше, просто пробрасываем
    if (error.message && (
      error.message.includes('обязателен') ||
      error.message.includes('должен быть') ||
      error.message.includes('не может быть')
    )) {
      throw error;
    }
    
    console.error('[supabaseWaterQualityApi] Исключение в getAnalysisResults:', {
      error: error.message || error,
      stack: error.stack,
      analysisId,
    });
    throw error;
  }
}

/**
 * Получить все результаты анализа (без пагинации, для обратной совместимости)
 * 
 * @deprecated Используйте getAnalysisResults с пагинацией
 */
export async function getAllAnalysisResults(analysisId: string): Promise<AnalysisResult[]> {
  try {
    const result = await getAnalysisResults(analysisId, { limit: 1000, offset: 0 });
    return result.data;
  } catch (error: any) {
    console.error('[supabaseWaterQualityApi] Ошибка getAllAnalysisResults:', error);
    throw error;
  }
}

/**
 * Создать результат измерения
 */
export async function createAnalysisResult(input: AnalysisResultInput): Promise<AnalysisResult> {
  try {
    // Валидация входных данных
    if (!input.analysisId || !input.analysisId.trim()) {
      throw new Error('ID анализа обязателен для заполнения');
    }

    if (!input.parameterName) {
      throw new Error('Параметр измерения обязателен для заполнения');
    }

    if (!input.parameterLabel || !input.parameterLabel.trim()) {
      throw new Error('Название параметра обязательно для заполнения');
    }

    if (input.parameterLabel.trim().length < 2) {
      throw new Error('Название параметра должно содержать минимум 2 символа');
    }

    if (input.value === undefined || input.value === null) {
      throw new Error('Значение измерения обязательно для заполнения');
    }

    if (typeof input.value !== 'number' || isNaN(input.value)) {
      throw new Error('Значение измерения должно быть числом');
    }

    if (input.value < 0) {
      throw new Error('Значение измерения не может быть отрицательным');
    }

    if (!input.unit || !input.unit.trim()) {
      throw new Error('Единица измерения обязательна для заполнения');
    }

    // Валидация detectionLimit, если указан
    if (input.detectionLimit !== undefined && input.detectionLimit !== null) {
      if (typeof input.detectionLimit !== 'number' || isNaN(input.detectionLimit)) {
        throw new Error('Предел обнаружения должен быть числом');
      }
      if (input.detectionLimit < 0) {
        throw new Error('Предел обнаружения не может быть отрицательным');
      }
    }

    const { data, error } = await supabase
      .from('analysis_results')
      .insert({
        analysis_id: input.analysisId.trim(),
        parameter_name: input.parameterName,
        parameter_label: input.parameterLabel.trim(),
        value: input.value,
        unit: input.unit.trim(),
        method: input.method?.trim() || null,
        detection_limit: input.detectionLimit || null,
      })
      .select('*')
      .single();

    if (error) {
      console.error('[supabaseWaterQualityApi] Ошибка createAnalysisResult:', {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        input: {
          analysisId: input.analysisId,
          parameterName: input.parameterName,
          parameterLabel: input.parameterLabel,
          value: input.value,
          unit: input.unit,
          hasMethod: !!input.method,
          detectionLimit: input.detectionLimit,
        },
      });
      
      if (error.code === '23505') {
        throw new Error('Результат для этого параметра уже существует');
      }
      
      throw new Error(error.message || 'Ошибка при создании результата');
    }

    if (!data) {
      throw new Error('Не удалось создать результат');
    }

    // Очищаем кэш результатов для этого анализа
    clearWaterQualityCache('analysis_results');
    clearWaterQualityCache(`analysis_results_${input.analysisId}`);

    return mapAnalysisResultFromDb(data);
  } catch (error: any) {
    // Если ошибка уже обработана выше, просто пробрасываем
    if (error.message && (
      error.message.includes('обязателен') ||
      error.message.includes('обязательна') ||
      error.message.includes('обязательно') ||
      error.message.includes('должно быть') ||
      error.message.includes('не может быть') ||
      error.message.includes('уже существует') ||
      error.message.includes('не удалось создать')
    )) {
      throw error;
    }
    
    console.error('[supabaseWaterQualityApi] Исключение в createAnalysisResult:', {
      error: error.message || error,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Обновить результат измерения
 */
export async function updateAnalysisResult(
  id: string,
  input: Partial<Omit<AnalysisResultInput, 'analysisId' | 'parameterName'>>
): Promise<AnalysisResult> {
  try {
    // Валидация ID
    if (!id || !id.trim()) {
      throw new Error('ID результата обязателен');
    }

    // Валидация входных данных
    if (input.parameterLabel !== undefined) {
      const trimmedLabel = input.parameterLabel.trim();
      if (!trimmedLabel) {
        throw new Error('Название параметра не может быть пустым');
      }
      if (trimmedLabel.length < 2) {
        throw new Error('Название параметра должно содержать минимум 2 символа');
      }
    }

    if (input.value !== undefined) {
      if (typeof input.value !== 'number' || isNaN(input.value)) {
        throw new Error('Значение измерения должно быть числом');
      }
      if (input.value < 0) {
        throw new Error('Значение измерения не может быть отрицательным');
      }
    }

    if (input.unit !== undefined && !input.unit.trim()) {
      throw new Error('Единица измерения не может быть пустой');
    }

    if (input.detectionLimit !== undefined && input.detectionLimit !== null) {
      if (typeof input.detectionLimit !== 'number' || isNaN(input.detectionLimit)) {
        throw new Error('Предел обнаружения должен быть числом');
      }
      if (input.detectionLimit < 0) {
        throw new Error('Предел обнаружения не может быть отрицательным');
      }
    }

    const updateData: any = {};

    // Примечание: analysis_results не имеет updated_at/updated_by в схеме БД.
    // Если эти поля будут добавлены позже, можно добавить:
    // updateData.updated_at = new Date().toISOString();
    // const { data: { user } } = await supabase.auth.getUser();
    // if (user?.email) updateData.updated_by = user.email;

    if (input.parameterLabel !== undefined) updateData.parameter_label = input.parameterLabel.trim();
    if (input.value !== undefined) updateData.value = input.value;
    if (input.unit !== undefined) updateData.unit = input.unit.trim();
    if (input.method !== undefined) updateData.method = input.method?.trim() || null;
    if (input.detectionLimit !== undefined) updateData.detection_limit = input.detectionLimit || null;

    // Проверка, что есть хотя бы одно поле для обновления
    if (Object.keys(updateData).length === 0) {
      throw new Error('Не указаны поля для обновления');
    }

    const { data, error } = await supabase
      .from('analysis_results')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error('[supabaseWaterQualityApi] Ошибка updateAnalysisResult:', error);
      throw new Error(error.message || 'Ошибка при обновлении результата');
    }

    if (!data) {
      throw new Error('Результат не найден');
    }

    return mapAnalysisResultFromDb(data);
  } catch (error: any) {
    console.error('[supabaseWaterQualityApi] Ошибка updateAnalysisResult:', error);
    throw error;
  }
}

/**
 * Удалить результат измерения
 */
export async function deleteAnalysisResult(id: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('analysis_results')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[supabaseWaterQualityApi] Ошибка deleteAnalysisResult:', error);
      throw new Error(error.message || 'Ошибка при удалении результата');
    }
  } catch (error: any) {
    console.error('[supabaseWaterQualityApi] Ошибка deleteAnalysisResult:', error);
    throw error;
  }
}

/**
 * Создать несколько результатов измерения за раз
 */
export async function createAnalysisResults(inputs: AnalysisResultInput[]): Promise<AnalysisResult[]> {
  try {
    const { data, error } = await supabase
      .from('analysis_results')
      .insert(
        inputs.map(input => ({
          analysis_id: input.analysisId,
          parameter_name: input.parameterName,
          parameter_label: input.parameterLabel,
          value: input.value,
          unit: input.unit,
          method: input.method?.trim() || null,
          detection_limit: input.detectionLimit || null,
        }))
      )
      .select('*');

    if (error) {
      console.error('[supabaseWaterQualityApi] Ошибка createAnalysisResults:', error);
      throw new Error(error.message || 'Ошибка при создании результатов');
    }

    return (data || []).map(mapAnalysisResultFromDb);
  } catch (error: any) {
    console.error('[supabaseWaterQualityApi] Ошибка createAnalysisResults:', error);
    throw error;
  }
}

// ============================================================================
// НОРМАТИВЫ (WATER QUALITY NORMS)
// ============================================================================

/**
 * Получить все нормативы
 */
export async function getAllWaterQualityNorms(filters?: {
  samplingPointId?: string;
  equipmentId?: string;
  parameterName?: string;
}): Promise<WaterQualityNorm[]> {
  try {
    let query = supabase
      .from('water_quality_norms')
      .select('*')
      .eq('is_active', true)
      .order('parameter_name', { ascending: true });

    if (filters?.samplingPointId) {
      query = query.eq('sampling_point_id', filters.samplingPointId);
    }
    if (filters?.equipmentId) {
      query = query.eq('equipment_id', filters.equipmentId);
    }
    if (filters?.parameterName) {
      query = query.eq('parameter_name', filters.parameterName);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[supabaseWaterQualityApi] Ошибка getAllWaterQualityNorms:', error);
      throw new Error(error.message || 'Ошибка при получении нормативов');
    }

    return (data || []).map(mapWaterQualityNormFromDb);
  } catch (error: any) {
    console.error('[supabaseWaterQualityApi] Исключение в getAllWaterQualityNorms:', error);
    throw error;
  }
}

/**
 * Получить норматив по ID
 */
export async function getWaterQualityNormById(id: string): Promise<WaterQualityNorm> {
  try {
    const { data, error } = await supabase
      .from('water_quality_norms')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('[supabaseWaterQualityApi] Ошибка getWaterQualityNormById:', error);
      throw new Error(error.message || 'Ошибка при получении норматива');
    }

    if (!data) {
      throw new Error('Норматив не найден');
    }

    return mapWaterQualityNormFromDb(data);
  } catch (error: any) {
    console.error('[supabaseWaterQualityApi] Ошибка getWaterQualityNormById:', error);
    throw error;
  }
}

/**
 * Создать норматив
 */
export async function createWaterQualityNorm(input: WaterQualityNormInput): Promise<WaterQualityNorm> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    const { data, error } = await supabase
      .from('water_quality_norms')
      .insert({
        sampling_point_id: input.samplingPointId || null,
        equipment_id: input.equipmentId || null,
        parameter_name: input.parameterName,
        optimal_min: input.optimalMin || null,
        optimal_max: input.optimalMax || null,
        min_allowed: input.minAllowed || null,
        max_allowed: input.maxAllowed || null,
        warning_min: input.warningMin || null,
        warning_max: input.warningMax || null,
        unit: input.unit,
        regulation_reference: input.regulationReference?.trim() || null,
        regulation_document_url: input.regulationDocumentUrl?.trim() || null,
        enable_notifications: input.enableNotifications !== undefined ? input.enableNotifications : true,
        warning_threshold_percent: input.warningThresholdPercent || 10.0,
        alarm_threshold_percent: input.alarmThresholdPercent || 5.0,
        is_active: input.isActive !== undefined ? input.isActive : true,
        created_by: user?.email || null,
      })
      .select('*')
      .single();

    if (error) {
      console.error('[supabaseWaterQualityApi] Ошибка createWaterQualityNorm:', error);
      
      if (error.code === '23505') {
        throw new Error('Норматив для этого параметра уже существует');
      }
      
      throw new Error(error.message || 'Ошибка при создании норматива');
    }

    if (!data) {
      throw new Error('Не удалось создать норматив');
    }

    // Очищаем кэш нормативов
    clearWaterQualityCache('water_quality_norms');

    // Перепроверяем все результаты для этого параметра (триггер сделает это автоматически)
    // Но для надежности вызываем явно
    try {
      await recheckResultsForParameter(data.parameter_name);
    } catch (recheckError: any) {
      // Логируем, но не прерываем выполнение
      console.warn('[supabaseWaterQualityApi] Предупреждение при перепроверке результатов:', recheckError);
    }

    return mapWaterQualityNormFromDb(data);
  } catch (error: any) {
    console.error('[supabaseWaterQualityApi] Ошибка createWaterQualityNorm:', error);
    throw error;
  }
}

/**
 * Обновить норматив
 */
export async function updateWaterQualityNorm(
  id: string,
  input: Partial<WaterQualityNormInput>
): Promise<WaterQualityNorm> {
  try {
    // Валидация ID
    if (!id || !id.trim()) {
      throw new Error('ID норматива обязателен');
    }

    // Валидация входных данных
    if (input.unit !== undefined && !input.unit.trim()) {
      throw new Error('Единица измерения не может быть пустой');
    }

    // Валидация числовых значений
    const validateNumber = (value: number | undefined, fieldName: string, allowNegative: boolean = false) => {
      if (value !== undefined && value !== null) {
        if (typeof value !== 'number' || isNaN(value)) {
          throw new Error(`${fieldName} должно быть числом`);
        }
        if (!allowNegative && value < 0) {
          throw new Error(`${fieldName} не может быть отрицательным`);
        }
      }
    };

    validateNumber(input.optimalMin, 'Оптимальное минимальное значение');
    validateNumber(input.optimalMax, 'Оптимальное максимальное значение');
    validateNumber(input.minAllowed, 'Минимальное допустимое значение');
    validateNumber(input.maxAllowed, 'Максимальное допустимое значение');
    validateNumber(input.warningMin, 'Минимальное значение предупреждения');
    validateNumber(input.warningMax, 'Максимальное значение предупреждения');
    validateNumber(input.warningThresholdPercent, 'Порог предупреждения (%)');
    validateNumber(input.alarmThresholdPercent, 'Порог тревоги (%)');

    // Валидация диапазонов
    if (input.optimalMin !== undefined && input.optimalMax !== undefined && input.optimalMin > input.optimalMax) {
      throw new Error('Оптимальное минимальное значение не может быть больше максимального');
    }

    if (input.minAllowed !== undefined && input.maxAllowed !== undefined && input.minAllowed > input.maxAllowed) {
      throw new Error('Минимальное допустимое значение не может быть больше максимального');
    }

    // Получаем текущего пользователя для updated_by
    const { data: { user } } = await supabase.auth.getUser();

    const updateData: any = {
      updated_at: new Date().toISOString(), // Явно обновляем updated_at
    };

    // Добавляем updated_by, если пользователь авторизован
    if (user?.email) {
      updateData.updated_by = user.email;
    }

    if (input.samplingPointId !== undefined) updateData.sampling_point_id = input.samplingPointId || null;
    if (input.equipmentId !== undefined) updateData.equipment_id = input.equipmentId || null;
    if (input.parameterName !== undefined) updateData.parameter_name = input.parameterName;
    if (input.optimalMin !== undefined) updateData.optimal_min = input.optimalMin || null;
    if (input.optimalMax !== undefined) updateData.optimal_max = input.optimalMax || null;
    if (input.minAllowed !== undefined) updateData.min_allowed = input.minAllowed || null;
    if (input.maxAllowed !== undefined) updateData.max_allowed = input.maxAllowed || null;
    if (input.warningMin !== undefined) updateData.warning_min = input.warningMin || null;
    if (input.warningMax !== undefined) updateData.warning_max = input.warningMax || null;
    if (input.unit !== undefined) updateData.unit = input.unit.trim();
    if (input.regulationReference !== undefined) updateData.regulation_reference = input.regulationReference?.trim() || null;
    if (input.regulationDocumentUrl !== undefined) updateData.regulation_document_url = input.regulationDocumentUrl?.trim() || null;
    if (input.enableNotifications !== undefined) updateData.enable_notifications = input.enableNotifications;
    if (input.warningThresholdPercent !== undefined) updateData.warning_threshold_percent = input.warningThresholdPercent;
    if (input.alarmThresholdPercent !== undefined) updateData.alarm_threshold_percent = input.alarmThresholdPercent;
    if (input.isActive !== undefined) updateData.is_active = input.isActive;

    // Проверка, что есть хотя бы одно поле для обновления (кроме updated_at и updated_by)
    const userFields = Object.keys(updateData).filter(key => key !== 'updated_at' && key !== 'updated_by');
    if (userFields.length === 0) {
      throw new Error('Не указаны поля для обновления');
    }

    const { data, error } = await supabase
      .from('water_quality_norms')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error('[supabaseWaterQualityApi] Ошибка updateWaterQualityNorm:', {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        id,
        updateFields: Object.keys(updateData).filter(key => key !== 'updated_at' && key !== 'updated_by'),
        input: {
          hasSamplingPointId: input.samplingPointId !== undefined,
          hasEquipmentId: input.equipmentId !== undefined,
          hasParameterName: input.parameterName !== undefined,
          hasUnit: input.unit !== undefined,
          hasOptimalMin: input.optimalMin !== undefined,
          hasOptimalMax: input.optimalMax !== undefined,
          hasMinAllowed: input.minAllowed !== undefined,
          hasMaxAllowed: input.maxAllowed !== undefined,
          enableNotifications: input.enableNotifications,
          isActive: input.isActive,
        },
      });
      
      if (error.code === '23505') {
        throw new Error('Норматив для этого параметра уже существует');
      }
      
      throw new Error(error.message || 'Ошибка при обновлении норматива');
    }

    if (!data) {
      throw new Error('Норматив не найден');
    }

    // Очищаем кэш нормативов
    clearWaterQualityCache('water_quality_norms');
    clearWaterQualityCache(`water_quality_norm_${id}`);

    // Перепроверяем все результаты для этого параметра (триггер сделает это автоматически)
    // Но для надежности вызываем явно
    try {
      const parameterName = data.parameter_name;
      await recheckResultsForParameter(parameterName);
    } catch (recheckError: any) {
      // Логируем, но не прерываем выполнение
      console.warn('[supabaseWaterQualityApi] Предупреждение при перепроверке результатов:', recheckError);
    }

    return mapWaterQualityNormFromDb(data);
  } catch (error: any) {
    // Если ошибка уже обработана выше, просто пробрасываем
    if (error.message && (
      error.message.includes('обязателен') ||
      error.message.includes('не может быть') ||
      error.message.includes('должно быть') ||
      error.message.includes('не указаны поля') ||
      error.message.includes('уже существует') ||
      error.message.includes('не найден')
    )) {
      throw error;
    }
    
    console.error('[supabaseWaterQualityApi] Исключение в updateWaterQualityNorm:', {
      error: error.message || error,
      stack: error.stack,
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
    const { error } = await supabase
      .from('water_quality_norms')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[supabaseWaterQualityApi] Ошибка deleteWaterQualityNorm:', error);
      throw new Error(error.message || 'Ошибка при удалении норматива');
    }

    // Очищаем кэш нормативов
    clearWaterQualityCache('water_quality_norms');
    clearWaterQualityCache(`water_quality_norm_${id}`);
  } catch (error: any) {
    console.error('[supabaseWaterQualityApi] Ошибка deleteWaterQualityNorm:', error);
    throw error;
  }
}

// ============================================================================
// ПРОВЕРКА СООТВЕТСТВИЯ НОРМАТИВАМ
// ============================================================================

/**
 * Перепроверить все результаты для указанного параметра
 * (используется при изменении нормативов)
 * 
 * @param parameterName - Название параметра
 * @returns Количество перепроверенных результатов
 */
export async function recheckResultsForParameter(parameterName: string): Promise<number> {
  try {
    // Валидация параметра
    if (!parameterName || !parameterName.trim()) {
      throw new Error('Название параметра обязательно');
    }

    // Вызываем функцию БД для перепроверки
    const { data, error } = await supabase
      .rpc('recheck_all_results_for_parameter', {
        p_parameter_name: parameterName.trim(),
      });

    if (error) {
      console.error('[supabaseWaterQualityApi] Ошибка recheckResultsForParameter:', {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        parameterName,
      });
      throw new Error(error.message || 'Ошибка при перепроверке результатов');
    }

    // Очищаем кэш результатов
    clearWaterQualityCache('analysis_results');

    return data || 0;
  } catch (error: any) {
    console.error('[supabaseWaterQualityApi] Исключение в recheckResultsForParameter:', error);
    throw error;
  }
}

/**
 * Проверить соответствие результата измерения нормативам
 * 
 * @param resultId - ID результата измерения
 * @returns Результат проверки с деталями
 */
export async function checkResultCompliance(resultId: string): Promise<{
  status: string;
  normId: string | null;
  deviationPercent: number | null;
  details: any;
}> {
  try {
    // Валидация ID
    if (!resultId || !resultId.trim()) {
      throw new Error('ID результата измерения обязателен');
    }

    // Получаем результат измерения
    const { data: result, error: resultError } = await supabase
      .from('analysis_results')
      .select('id, analysis_id, value, unit, parameter_name')
      .eq('id', resultId.trim())
      .single();

    if (resultError || !result) {
      throw new Error('Результат измерения не найден');
    }

    // Получаем информацию об анализе
    const { data: analysis, error: analysisError } = await supabase
      .from('water_analysis')
      .select('sampling_point_id, equipment_id')
      .eq('id', result.analysis_id)
      .single();

    if (analysisError || !analysis) {
      throw new Error('Анализ не найден');
    }

    // Вызываем функцию БД для проверки соответствия
    const { data: complianceResult, error: complianceError } = await supabase
      .rpc('check_norm_compliance', {
        p_result_id: resultId.trim(),
        p_value: result.value,
        p_unit: result.unit,
        p_sampling_point_id: analysis.sampling_point_id || null,
        p_equipment_id: analysis.equipment_id || null,
        p_parameter_name: result.parameter_name,
      });

    if (complianceError) {
      console.error('[supabaseWaterQualityApi] Ошибка checkResultCompliance:', {
        error: {
          code: complianceError.code,
          message: complianceError.message,
          details: complianceError.details,
          hint: complianceError.hint,
        },
        resultId,
      });
      throw new Error(complianceError.message || 'Ошибка при проверке соответствия нормативам');
    }

    return complianceResult || {
      status: 'unknown',
      normId: null,
      deviationPercent: null,
      details: {},
    };
  } catch (error: any) {
    console.error('[supabaseWaterQualityApi] Исключение в checkResultCompliance:', error);
    throw error;
  }
}

/**
 * Получить применимый норматив для проверки результата
 * 
 * @param parameterName - Название параметра
 * @param samplingPointId - ID пункта отбора проб (опционально)
 * @param equipmentId - ID оборудования (опционально)
 * @returns Норматив или null, если не найден
 */
export async function getApplicableNorm(
  parameterName: string,
  samplingPointId?: string,
  equipmentId?: string
): Promise<WaterQualityNorm | null> {
  try {
    // Валидация параметра
    if (!parameterName || !parameterName.trim()) {
      throw new Error('Название параметра обязательно');
    }

    // Вызываем функцию БД для получения норматива
    const { data, error } = await supabase
      .rpc('get_applicable_norm', {
        p_sampling_point_id: samplingPointId || null,
        p_equipment_id: equipmentId || null,
        p_parameter_name: parameterName.trim(),
      });

    if (error) {
      console.error('[supabaseWaterQualityApi] Ошибка getApplicableNorm:', {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        parameterName,
        samplingPointId,
        equipmentId,
      });
      throw new Error(error.message || 'Ошибка при получении норматива');
    }

    if (!data || data.length === 0) {
      return null;
    }

    // Маппим результат из БД
    const normData = data[0];
    return {
      id: normData.id,
      samplingPointId: normData.sampling_point_id || undefined,
      equipmentId: normData.equipment_id || undefined,
      parameterName: normData.parameter_name,
      optimalMin: normData.optimal_min ? parseFloat(normData.optimal_min) : undefined,
      optimalMax: normData.optimal_max ? parseFloat(normData.optimal_max) : undefined,
      minAllowed: normData.min_allowed ? parseFloat(normData.min_allowed) : undefined,
      maxAllowed: normData.max_allowed ? parseFloat(normData.max_allowed) : undefined,
      warningMin: normData.warning_min ? parseFloat(normData.warning_min) : undefined,
      warningMax: normData.warning_max ? parseFloat(normData.warning_max) : undefined,
      unit: normData.unit,
      regulationReference: undefined, // Эти поля не возвращаются функцией
      regulationDocumentUrl: undefined,
      enableNotifications: true,
      warningThresholdPercent: 10.0,
      alarmThresholdPercent: 5.0,
      isActive: true,
      createdAt: '',
      updatedAt: '',
      createdBy: undefined,
    };
  } catch (error: any) {
    console.error('[supabaseWaterQualityApi] Исключение в getApplicableNorm:', error);
    throw error;
  }
}

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ МАППИНГА (для предупреждений и инцидентов)
// ============================================================================

function mapAlertFromDb(data: any): WaterQualityAlert {
  return {
    id: data.id,
    resultId: data.result_id,
    analysisId: data.analysis_id,
    normId: data.norm_id || undefined,
    alertType: data.alert_type,
    parameterName: data.parameter_name,
    parameterLabel: data.parameter_label,
    value: parseFloat(data.value),
    unit: data.unit,
    deviationPercent: data.deviation_percent ? parseFloat(data.deviation_percent) : undefined,
    thresholdValue: data.threshold_value ? parseFloat(data.threshold_value) : undefined,
    thresholdType: data.threshold_type || undefined,
    status: data.status,
    priority: data.priority,
    message: data.message,
    createdAt: data.created_at,
    acknowledgedAt: data.acknowledged_at || undefined,
    acknowledgedBy: data.acknowledged_by || undefined,
    resolvedAt: data.resolved_at || undefined,
    resolvedBy: data.resolved_by || undefined,
    resolvedNotes: data.resolved_notes || undefined,
    details: data.details || undefined,
  };
}

function mapIncidentFromDb(data: any): WaterQualityIncident {
  return {
    id: data.id,
    analysisId: data.analysis_id,
    samplingPointId: data.sampling_point_id || undefined,
    equipmentId: data.equipment_id || undefined,
    incidentType: data.incident_type,
    title: data.title,
    description: data.description,
    affectedParameters: data.affected_parameters || [],
    status: data.status,
    severity: data.severity,
    assignedTo: data.assigned_to || undefined,
    reportedBy: data.reported_by || undefined,
    occurredAt: data.occurred_at,
    detectedAt: data.detected_at,
    resolvedAt: data.resolved_at || undefined,
    closedAt: data.closed_at || undefined,
    resolutionNotes: data.resolution_notes || undefined,
    resolutionActions: data.resolution_actions || [],
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    createdBy: data.created_by || undefined,
    attachments: data.attachments || [],
    tags: data.tags || [],
    relatedIncidents: data.related_incidents || [],
  };
}

// ============================================================================
// ОЦЕНКА РЕЗУЛЬТАТОВ И ГЕНЕРАЦИЯ ПРЕДУПРЕЖДЕНИЙ
// ============================================================================

/**
 * Оценить результат измерения по нормативу
 * 
 * @param resultId - ID результата измерения
 * @returns Детальная оценка результата
 */
export async function evaluateResultAgainstNorm(resultId: string): Promise<ResultEvaluation> {
  try {
    // Валидация ID
    if (!resultId || !resultId.trim()) {
      throw new Error('ID результата измерения обязателен');
    }

    // Вызываем функцию БД для оценки
    const { data, error } = await supabase
      .rpc('evaluate_result_against_norm', {
        p_result_id: resultId.trim(),
      });

    if (error) {
      console.error('[supabaseWaterQualityApi] Ошибка evaluateResultAgainstNorm:', {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        resultId,
      });
      throw new Error(error.message || 'Ошибка при оценке результата по нормативу');
    }

    if (!data) {
      return {
        success: false,
        hasNorm: false,
        status: 'unknown',
        message: 'Не удалось оценить результат',
        result: {
          id: resultId,
          value: 0,
          unit: '',
          parameterName: 'iron',
        },
        isExceeded: false,
        isWarning: false,
        isOptimal: false,
        isNormal: false,
        error: 'Результат не найден',
      };
    }

    return data as ResultEvaluation;
  } catch (error: any) {
    console.error('[supabaseWaterQualityApi] Исключение в evaluateResultAgainstNorm:', error);
    throw error;
  }
}

/**
 * Сгенерировать предупреждение для результата измерения
 * 
 * @param resultId - ID результата измерения
 * @param alertType - Тип предупреждения (опционально, определяется автоматически)
 * @returns ID созданного предупреждения или null, если предупреждение не требуется
 */
export async function generateAlertForResult(
  resultId: string,
  alertType?: 'warning' | 'exceeded' | 'deviation'
): Promise<string | null> {
  try {
    // Валидация ID
    if (!resultId || !resultId.trim()) {
      throw new Error('ID результата измерения обязателен');
    }

    // Вызываем функцию БД для генерации предупреждения
    const { data, error } = await supabase
      .rpc('generate_alert_for_result', {
        p_result_id: resultId.trim(),
        p_alert_type: alertType || null,
      });

    if (error) {
      console.error('[supabaseWaterQualityApi] Ошибка generateAlertForResult:', {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        resultId,
        alertType,
      });
      throw new Error(error.message || 'Ошибка при генерации предупреждения');
    }

    // Очищаем кэш предупреждений
    clearWaterQualityCache('water_quality_alerts');

    return data || null;
  } catch (error: any) {
    console.error('[supabaseWaterQualityApi] Исключение в generateAlertForResult:', error);
    throw error;
  }
}

/**
 * Получить все предупреждения
 * 
 * @param filters - Фильтры для выборки
 * @param options - Опции пагинации
 * @returns Предупреждения с метаданными пагинации
 */
export async function getAllAlerts(
  filters?: {
    status?: AlertStatus;
    alertType?: AlertType;
    priority?: AlertPriority;
    parameterName?: WaterQualityParameter;
    analysisId?: string;
  },
  options?: PaginationOptions
): Promise<PaginatedResponse<WaterQualityAlert>> {
  try {
    const {
      limit = 100,
      offset = 0,
    } = options || {};

    // Валидация параметров пагинации
    const validLimit = Math.min(Math.max(1, limit), MAX_HISTORICAL_LIMIT);
    if (offset < 0) {
      throw new Error('Смещение не может быть отрицательным');
    }

    // Строим запрос с подсчетом общего количества
    let query = supabase
      .from('water_quality_alerts')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + validLimit - 1);

    // Применяем фильтры
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.alertType) {
      query = query.eq('alert_type', filters.alertType);
    }
    if (filters?.priority) {
      query = query.eq('priority', filters.priority);
    }
    if (filters?.parameterName) {
      query = query.eq('parameter_name', filters.parameterName);
    }
    if (filters?.analysisId) {
      query = query.eq('analysis_id', filters.analysisId);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[supabaseWaterQualityApi] Ошибка getAllAlerts:', {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        filters,
        options,
      });
      throw new Error(error.message || 'Ошибка при получении предупреждений');
    }

    return {
      data: (data || []).map(mapAlertFromDb),
      total: count || 0,
      limit: validLimit,
      offset,
      hasMore: (count || 0) > offset + validLimit,
    };
  } catch (error: any) {
    console.error('[supabaseWaterQualityApi] Исключение в getAllAlerts:', error);
    throw error;
  }
}

/**
 * Обновить статус предупреждения
 * 
 * @param alertId - ID предупреждения
 * @param status - Новый статус
 * @param resolvedNotes - Заметки о решении (если статус = 'resolved')
 * @returns Обновленное предупреждение
 */
export async function updateAlertStatus(
  alertId: string,
  status: AlertStatus,
  resolvedNotes?: string
): Promise<WaterQualityAlert> {
  try {
    // Валидация ID
    if (!alertId || !alertId.trim()) {
      throw new Error('ID предупреждения обязателен');
    }

    // Получаем текущего пользователя
    const { data: { user } } = await supabase.auth.getUser();

    const updateData: any = {
      status,
    };

    // Устанавливаем время и пользователя в зависимости от статуса
    if (status === 'acknowledged') {
      updateData.acknowledged_at = new Date().toISOString();
      if (user?.email) {
        updateData.acknowledged_by = user.email;
      }
    } else if (status === 'resolved') {
      updateData.resolved_at = new Date().toISOString();
      if (user?.email) {
        updateData.resolved_by = user.email;
      }
      if (resolvedNotes) {
        updateData.resolved_notes = resolvedNotes.trim();
      }
    }

    const { data, error } = await supabase
      .from('water_quality_alerts')
      .update(updateData)
      .eq('id', alertId.trim())
      .select('*')
      .single();

    if (error) {
      console.error('[supabaseWaterQualityApi] Ошибка updateAlertStatus:', {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        alertId,
        status,
      });
      throw new Error(error.message || 'Ошибка при обновлении статуса предупреждения');
    }

    if (!data) {
      throw new Error('Предупреждение не найдено');
    }

    // Очищаем кэш предупреждений
    clearWaterQualityCache('water_quality_alerts');

    return mapAlertFromDb(data);
  } catch (error: any) {
    console.error('[supabaseWaterQualityApi] Исключение в updateAlertStatus:', error);
    throw error;
  }
}

// ============================================================================
// ИНЦИДЕНТЫ
// ============================================================================

/**
 * Создать инцидент для анализа с превышениями
 * 
 * @param analysisId - ID анализа
 * @param input - Дополнительные данные для инцидента
 * @returns ID созданного инцидента или null, если превышений нет
 */
export async function createIncidentForAnalysis(
  analysisId: string,
  input?: WaterQualityIncidentInput
): Promise<string | null> {
  try {
    // Валидация ID
    if (!analysisId || !analysisId.trim()) {
      throw new Error('ID анализа обязателен');
    }

    // Вызываем функцию БД для создания инцидента
    const { data, error } = await supabase
      .rpc('create_incident_for_analysis', {
        p_analysis_id: analysisId.trim(),
        p_incident_type: input?.incidentType || null,
        p_title: input?.title || null,
        p_description: input?.description || null,
        p_severity: input?.severity || null,
      });

    if (error) {
      console.error('[supabaseWaterQualityApi] Ошибка createIncidentForAnalysis:', {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        analysisId,
        input,
      });
      throw new Error(error.message || 'Ошибка при создании инцидента');
    }

    // Очищаем кэш инцидентов
    clearWaterQualityCache('water_quality_incidents');

    return data || null;
  } catch (error: any) {
    console.error('[supabaseWaterQualityApi] Исключение в createIncidentForAnalysis:', error);
    throw error;
  }
}

/**
 * Получить все инциденты
 * 
 * @param filters - Фильтры для выборки
 * @param options - Опции пагинации
 * @returns Инциденты с метаданными пагинации
 */
export async function getAllIncidents(
  filters?: {
    status?: IncidentStatus;
    severity?: IncidentSeverity;
    incidentType?: IncidentType;
    samplingPointId?: string;
    equipmentId?: string;
  },
  options?: PaginationOptions
): Promise<PaginatedResponse<WaterQualityIncident>> {
  try {
    const {
      limit = 100,
      offset = 0,
    } = options || {};

    // Валидация параметров пагинации
    const validLimit = Math.min(Math.max(1, limit), MAX_HISTORICAL_LIMIT);
    if (offset < 0) {
      throw new Error('Смещение не может быть отрицательным');
    }

    // Строим запрос с подсчетом общего количества
    let query = supabase
      .from('water_quality_incidents')
      .select('*', { count: 'exact' })
      .order('occurred_at', { ascending: false })
      .range(offset, offset + validLimit - 1);

    // Применяем фильтры
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.severity) {
      query = query.eq('severity', filters.severity);
    }
    if (filters?.incidentType) {
      query = query.eq('incident_type', filters.incidentType);
    }
    if (filters?.samplingPointId) {
      query = query.eq('sampling_point_id', filters.samplingPointId);
    }
    if (filters?.equipmentId) {
      query = query.eq('equipment_id', filters.equipmentId);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[supabaseWaterQualityApi] Ошибка getAllIncidents:', {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        filters,
        options,
      });
      throw new Error(error.message || 'Ошибка при получении инцидентов');
    }

    return {
      data: (data || []).map(mapIncidentFromDb),
      total: count || 0,
      limit: validLimit,
      offset,
      hasMore: (count || 0) > offset + validLimit,
    };
  } catch (error: any) {
    console.error('[supabaseWaterQualityApi] Исключение в getAllIncidents:', error);
    throw error;
  }
}

/**
 * Обновить инцидент
 * 
 * @param incidentId - ID инцидента
 * @param input - Данные для обновления
 * @returns Обновленный инцидент
 */
export async function updateIncident(
  incidentId: string,
  input: WaterQualityIncidentUpdate
): Promise<WaterQualityIncident> {
  try {
    // Валидация ID
    if (!incidentId || !incidentId.trim()) {
      throw new Error('ID инцидента обязателен');
    }

    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    // Обновляем поля
    if (input.status !== undefined) {
      updateData.status = input.status;
      if (input.status === 'resolved' && !updateData.resolved_at) {
        updateData.resolved_at = new Date().toISOString();
      }
      if (input.status === 'closed' && !updateData.closed_at) {
        updateData.closed_at = new Date().toISOString();
      }
    }
    if (input.severity !== undefined) {
      updateData.severity = input.severity;
    }
    if (input.assignedTo !== undefined) {
      updateData.assigned_to = input.assignedTo.trim() || null;
    }
    if (input.resolutionNotes !== undefined) {
      updateData.resolution_notes = input.resolutionNotes.trim() || null;
    }
    if (input.resolutionActions !== undefined) {
      updateData.resolution_actions = input.resolutionActions;
    }
    if (input.tags !== undefined) {
      updateData.tags = input.tags;
    }
    if (input.relatedIncidents !== undefined) {
      updateData.related_incidents = input.relatedIncidents;
    }

    // Проверка, что есть хотя бы одно поле для обновления
    const userFields = Object.keys(updateData).filter(key => key !== 'updated_at');
    if (userFields.length === 0) {
      throw new Error('Не указаны поля для обновления');
    }

    const { data, error } = await supabase
      .from('water_quality_incidents')
      .update(updateData)
      .eq('id', incidentId.trim())
      .select('*')
      .single();

    if (error) {
      console.error('[supabaseWaterQualityApi] Ошибка updateIncident:', {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        incidentId,
        input,
      });
      throw new Error(error.message || 'Ошибка при обновлении инцидента');
    }

    if (!data) {
      throw new Error('Инцидент не найден');
    }

    // Очищаем кэш инцидентов
    clearWaterQualityCache('water_quality_incidents');

    return mapIncidentFromDb(data);
  } catch (error: any) {
    console.error('[supabaseWaterQualityApi] Исключение в updateIncident:', error);
    throw error;
  }
}

/**
 * Получить инцидент по ID
 * 
 * @param incidentId - ID инцидента
 * @returns Инцидент
 */
export async function getIncidentById(incidentId: string): Promise<WaterQualityIncident> {
  try {
    // Валидация ID
    if (!incidentId || !incidentId.trim()) {
      throw new Error('ID инцидента обязателен');
    }

    const { data, error } = await supabase
      .from('water_quality_incidents')
      .select('*')
      .eq('id', incidentId.trim())
      .single();

    if (error) {
      console.error('[supabaseWaterQualityApi] Ошибка getIncidentById:', {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        incidentId,
      });
      throw new Error(error.message || 'Ошибка при получении инцидента');
    }

    if (!data) {
      throw new Error('Инцидент не найден');
    }

    return mapIncidentFromDb(data);
  } catch (error: any) {
    console.error('[supabaseWaterQualityApi] Исключение в getIncidentById:', error);
    throw error;
  }
}

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ МАППИНГА
// ============================================================================

function mapSamplingPointFromDb(data: any): SamplingPoint {
  return {
    id: data.id,
    code: data.code,
    name: data.name,
    description: data.description || undefined,
    equipmentId: data.equipment_id || undefined,
    location: data.location || undefined,
    samplingFrequency: data.sampling_frequency || undefined,
    samplingSchedule: data.sampling_schedule || undefined,
    responsiblePerson: data.responsible_person || undefined,
    isActive: data.is_active !== undefined ? data.is_active : true,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    createdBy: data.created_by || undefined,
  };
}

function mapWaterAnalysisFromDb(data: any): WaterAnalysis {
  return {
    id: data.id,
    samplingPointId: data.sampling_point_id,
    equipmentId: data.equipment_id || undefined,
    sampleDate: data.sample_date,
    analysisDate: data.analysis_date || undefined,
    receivedDate: data.received_date || undefined,
    sampledBy: data.sampled_by || undefined,
    analyzedBy: data.analyzed_by || undefined,
    responsiblePerson: data.responsible_person || undefined,
    status: data.status,
    notes: data.notes || undefined,
    sampleCondition: data.sample_condition || undefined,
    externalLab: data.external_lab || false,
    externalLabName: data.external_lab_name || undefined,
    certificateNumber: data.certificate_number || undefined,
    attachmentUrls: data.attachment_urls || undefined,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    createdBy: data.created_by || undefined,
    changeLog: data.change_log || undefined,
  };
}

function mapAnalysisResultFromDb(data: any): AnalysisResult {
  return {
    id: data.id,
    analysisId: data.analysis_id,
    parameterName: data.parameter_name,
    parameterLabel: data.parameter_label,
    value: parseFloat(data.value),
    unit: data.unit,
    method: data.method || undefined,
    detectionLimit: data.detection_limit ? parseFloat(data.detection_limit) : undefined,
    createdAt: data.created_at,
    // Поля соответствия нормативам
    complianceStatus: data.compliance_status || undefined,
    normId: data.norm_id || undefined,
    deviationPercent: data.deviation_percent ? parseFloat(data.deviation_percent) : undefined,
    checkedAt: data.checked_at || undefined,
    complianceDetails: data.compliance_details || undefined,
  };
}

function mapWaterQualityNormFromDb(data: any): WaterQualityNorm {
  return {
    id: data.id,
    samplingPointId: data.sampling_point_id || undefined,
    equipmentId: data.equipment_id || undefined,
    parameterName: data.parameter_name,
    optimalMin: data.optimal_min ? parseFloat(data.optimal_min) : undefined,
    optimalMax: data.optimal_max ? parseFloat(data.optimal_max) : undefined,
    minAllowed: data.min_allowed ? parseFloat(data.min_allowed) : undefined,
    maxAllowed: data.max_allowed ? parseFloat(data.max_allowed) : undefined,
    warningMin: data.warning_min ? parseFloat(data.warning_min) : undefined,
    warningMax: data.warning_max ? parseFloat(data.warning_max) : undefined,
    unit: data.unit,
    regulationReference: data.regulation_reference || undefined,
    regulationDocumentUrl: data.regulation_document_url || undefined,
    enableNotifications: data.enable_notifications !== undefined ? data.enable_notifications : true,
    warningThresholdPercent: parseFloat(data.warning_threshold_percent || '10.0'),
    alarmThresholdPercent: parseFloat(data.alarm_threshold_percent || '5.0'),
    isActive: data.is_active !== undefined ? data.is_active : true,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    createdBy: data.created_by || undefined,
  };
}
