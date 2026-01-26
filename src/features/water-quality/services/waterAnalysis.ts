/**
 * API для работы с анализами качества воды
 * 
 * Этот модуль содержит CRUD операции для управления анализами качества воды.
 * Использует модули cache, validators и mappers для переиспользования кода.
 */

import { supabase } from '@/shared/config/supabase';
import type {
  WaterAnalysis,
  WaterAnalysisInput,
  WaterAnalysisWithResults,
  CacheOptions,
} from '@/features/water-quality/types/waterQuality';

// Импортируем функции из модулей
import {
  DEFAULT_MAX_LIMIT,
  MAX_HISTORICAL_LIMIT,
  generateCacheKey,
  getCacheOptions,
  getCacheEntry,
  setCacheEntry,
  isCacheValid,
  isCacheStale,
  deduplicateRequest,
  clearWaterQualityCache,
} from './cache';
import { validateLimit, validateId, validateISODate } from './validators';
import { mapWaterAnalysisFromDb, mapSamplingPointFromDb } from './mappers';
import { getAnalysisResults } from './analysisResults';

/**
 * Получить все анализы с фильтрами и кэшированием
 * 
 * @param filters - Фильтры для выборки анализов
 * @param limit - Максимальное количество записей (по умолчанию 1000, максимум 10000)
 * @param useCache - Использовать кэш (по умолчанию true)
 * @param cacheOptions - Опции кэширования
 * @returns Массив анализов
 * 
 * Логика работы:
 * 1. Валидация дат в фильтрах (если указаны)
 * 2. Валидация лимита
 * 3. Проверка кэша (stale-while-revalidate)
 * 4. Построение запроса с фильтрами
 * 5. Выполнение запроса с дедупликацией
 * 6. Сохранение в кэш и возврат результата
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
    // Шаг 1: Валидация дат в фильтрах
    if (filters?.startDate) {
      validateISODate(filters.startDate, 'Начальная дата фильтра');
    }
    if (filters?.endDate) {
      validateISODate(filters.endDate, 'Конечная дата фильтра');
    }

    // Шаг 2: Валидация лимита
    const validLimit = validateLimit(limit, MAX_HISTORICAL_LIMIT);

    // Шаг 3: Получаем опции кэша
    const cacheOpts = getCacheOptions(cacheOptions);

    // Шаг 4: Генерируем ключ кэша на основе фильтров и лимита
    const cacheKey = generateCacheKey('water_analyses', { ...filters, limit: validLimit });
    
    // Переменная для хранения устаревших данных (stale-while-revalidate)
    let staleData: WaterAnalysis[] | null = null;
    
    // Шаг 5: Проверяем кэш
    if (useCache) {
      const cached = getCacheEntry(cacheKey);
      if (cached) {
        // Если кэш валиден, возвращаем данные сразу
        if (isCacheValid(cached)) {
          return cached.data;
        }
        // Если кэш устарел, но включен stale-while-revalidate, сохраняем для возврата
        if (isCacheStale(cached)) {
          staleData = cached.data;
        }
      }
    }

    // Шаг 6: Построение запроса с фильтрами
    let query = supabase
      .from('water_analysis')
      .select('*')
      .order('sample_date', { ascending: false })  // Сначала новые анализы
      .limit(validLimit);

    // Применяем фильтры
    if (filters?.samplingPointId) {
      query = query.eq('sampling_point_id', filters.samplingPointId);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.startDate) {
      query = query.gte('sample_date', filters.startDate);  // >= startDate
    }
    if (filters?.endDate) {
      query = query.lte('sample_date', filters.endDate);  // <= endDate
    }

    // Шаг 7: Выполняем запрос с дедупликацией
    const fetchPromise = deduplicateRequest(cacheKey, async () => {
      const { data, error } = await query;

      if (error) {
        console.error('[waterAnalysisApi] Ошибка getAllWaterAnalyses:', {
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
        setCacheEntry(cacheKey, result, cacheOpts);
      }

      return result;
    });

    // Шаг 8: Если есть stale данные, возвращаем их немедленно, обновление в фоне
    if (staleData !== null && cacheOpts.staleWhileRevalidate) {
      // Обновляем кэш в фоне (не ждем)
      fetchPromise.catch(err => {
        console.error('[waterAnalysisApi] Ошибка обновления кэша (stale-while-revalidate):', err);
      });
      return staleData;
    }

    // Иначе ждем результат запроса
    return await fetchPromise;
  } catch (error: any) {
    console.error('[waterAnalysisApi] Исключение в getAllWaterAnalyses:', error);
    throw error;
  }
}

/**
 * Получить анализ по ID с результатами и пунктом отбора проб
 * 
 * @param id - Уникальный идентификатор анализа
 * @returns Анализ с результатами измерений и пунктом отбора проб
 * 
 * Логика работы:
 * 1. Валидация ID
 * 2. Получение анализа из БД
 * 3. Получение результатов анализа (через модуль analysisResults)
 * 4. Получение пункта отбора проб (если существует)
 * 5. Объединение данных и возврат
 * 
 * Примечание: Эта функция возвращает расширенный тип WaterAnalysisWithResults,
 * который включает результаты измерений и информацию о пункте отбора проб.
 */
export async function getWaterAnalysisById(id: string): Promise<WaterAnalysisWithResults> {
  try {
    // Шаг 1: Валидация ID
    validateId(id, 'ID анализа');

    // Шаг 2: Получение анализа из БД с JOIN к пункту отбора проб
    // Используем JOIN для получения пункта отбора проб за один запрос
    // Supabase автоматически делает JOIN по foreign key (sampling_point_id -> sampling_points.id)
    const { data: analysisData, error: analysisError } = await supabase
      .from('water_analysis')
      .select(`
        *,
        sampling_points (*)
      `)
      .eq('id', id.trim())
      .single();

    if (analysisError) {
      console.error('[waterAnalysisApi] Ошибка getWaterAnalysisById:', {
        error: {
          code: analysisError.code,
          message: analysisError.message,
          details: analysisError.details,
          hint: analysisError.hint,
        },
        id: id.trim(),
      });
      throw new Error(analysisError.message || 'Ошибка при получении анализа');
    }

    if (!analysisData) {
      throw new Error('Анализ не найден');
    }

    // Извлекаем данные анализа и пункта отбора проб
    // Supabase возвращает связанные данные в формате объекта с ключом имени таблицы
    let samplingPoint = undefined;
    
    // Извлекаем пункт отбора проб из результата JOIN
    // Supabase возвращает связанные данные в формате: { sampling_points: {...} }
    // Это может быть объект или массив (если связь один-ко-многим, но у нас один-к-одному)
    if (analysisData.sampling_points) {
      // Если это массив (один элемент), берем первый
      const pointData = Array.isArray(analysisData.sampling_points) 
        ? analysisData.sampling_points[0] 
        : analysisData.sampling_points;
      
      if (pointData && pointData.id) {
        samplingPoint = mapSamplingPointFromDb(pointData);
      }
    }
    
    // Fallback: если JOIN не вернул данные, делаем отдельный запрос
    // Это может произойти, если foreign key relationship не настроен в Supabase
    if (!samplingPoint && analysisData.sampling_point_id) {
      const { data: pointData, error: pointError } = await supabase
        .from('sampling_points')
        .select('*')
        .eq('id', analysisData.sampling_point_id)
        .single();

      if (!pointError && pointData) {
        samplingPoint = mapSamplingPointFromDb(pointData);
      } else {
        console.debug('[waterAnalysisApi] Пункт отбора проб не найден (fallback):', pointError);
      }
    }
    
    // Удаляем связанные данные из объекта анализа перед маппингом
    // чтобы mapper не пытался обработать их
    const { sampling_points, ...analysis } = analysisData;

    // Шаг 3: Получение результатов анализа
    // Используем модуль analysisResults для получения всех результатов
    let results: any[] = [];
    try {
      const resultsResponse = await getAnalysisResults(id.trim(), { limit: 1000, offset: 0 });
      results = resultsResponse.data;
    } catch (resultsError: any) {
      // Не бросаем ошибку, просто логируем и возвращаем анализ без результатов
      console.error('[waterAnalysisApi] Ошибка получения результатов:', {
        error: resultsError.message || resultsError,
        analysisId: id.trim(),
      });
    }

    // Шаг 5: Объединение данных и возврат
    return {
      ...mapWaterAnalysisFromDb(analysis),
      results: results,
      samplingPoint: samplingPoint,
    };
  } catch (error: any) {
    // Если ошибка уже обработана выше, просто пробрасываем
    if (error.message && (
      error.message.includes('обязателен') ||
      error.message.includes('не найден')
    )) {
      throw error;
    }
    
    console.error('[waterAnalysisApi] Исключение в getWaterAnalysisById:', {
      error: error.message || error,
      stack: error.stack,
      id,
    });
    throw error;
  }
}

/**
 * Создать новый анализ
 * 
 * @param input - Данные для создания анализа
 * @returns Созданный анализ
 * 
 * Логика работы:
 * 1. Валидация обязательных полей (samplingPointId, sampleDate)
 * 2. Валидация формата дат ISO
 * 3. Валидация логики дат (analysisDate >= sampleDate, receivedDate >= analysisDate)
 * 4. Валидация внешней лаборатории (если externalLab=true, то externalLabName обязателен)
 * 5. Получение текущего пользователя для created_by
 * 6. Вставка данных в БД
 * 7. Обработка ошибок
 * 8. Очистка кэша
 * 9. Преобразование и возврат результата
 */
export async function createWaterAnalysis(input: WaterAnalysisInput): Promise<WaterAnalysis> {
  try {
    // Шаг 1: Валидация обязательных полей
    validateId(input.samplingPointId, 'Пункт отбора проб');

    if (!input.sampleDate) {
      throw new Error('Дата отбора пробы обязательна для заполнения');
    }

    // Шаг 2: Валидация формата дат ISO
    validateISODate(input.sampleDate, 'Дата отбора пробы');
    if (input.analysisDate) {
      validateISODate(input.analysisDate, 'Дата анализа');
    }
    if (input.receivedDate) {
      validateISODate(input.receivedDate, 'Дата получения результатов');
    }

    // Шаг 3: Валидация логики дат
    // Дата анализа не может быть раньше даты отбора пробы
    if (input.analysisDate && new Date(input.analysisDate) < new Date(input.sampleDate)) {
      throw new Error('Дата анализа не может быть раньше даты отбора пробы');
    }

    // Дата получения результатов не может быть раньше даты анализа
    if (input.receivedDate && input.analysisDate && new Date(input.receivedDate) < new Date(input.analysisDate)) {
      throw new Error('Дата получения результатов не может быть раньше даты анализа');
    }

    // Шаг 4: Валидация внешней лаборатории
    if (input.externalLab && !input.externalLabName?.trim()) {
      throw new Error('Название внешней лаборатории обязательно, если анализ выполнен внешней лабораторией');
    }

    // Шаг 5: Получение текущего пользователя для аудита
    const { data: { user } } = await supabase.auth.getUser();
    
    // Шаг 6: Вставка данных в БД
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

    // Шаг 7: Обработка ошибок
    if (error) {
      console.error('[waterAnalysisApi] Ошибка createWaterAnalysis:', {
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

    // Шаг 8: Проверка результата
    if (!data) {
      throw new Error('Не удалось создать анализ');
    }

    // Шаг 9: Очистка кэша
    clearWaterQualityCache('water_analyses');
    clearWaterQualityCache(`water_analysis_${data.id}`);

    // Шаг 10: Преобразование и возврат
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
    
    console.error('[waterAnalysisApi] Исключение в createWaterAnalysis:', {
      error: error.message || error,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Обновить анализ
 * 
 * @param id - ID анализа для обновления
 * @param input - Частичные данные для обновления
 * @returns Обновленный анализ
 * 
 * Логика работы:
 * 1. Валидация ID
 * 2. Валидация формата дат ISO (если указаны)
 * 3. Валидация логики дат (если указаны)
 * 4. Валидация внешней лаборатории (если externalLab=true)
 * 5. Получение текущего пользователя для updated_by
 * 6. Формирование объекта обновления (только указанные поля)
 * 7. Проверка, что есть хотя бы одно поле для обновления
 * 8. Обновление в БД
 * 9. Обработка ошибок
 * 10. Очистка кэша
 * 11. Преобразование и возврат результата
 */
export async function updateWaterAnalysis(
  id: string,
  input: Partial<WaterAnalysisInput>
): Promise<WaterAnalysis> {
  try {
    // Шаг 1: Валидация ID
    validateId(id, 'ID анализа');

    // Шаг 2: Валидация формата дат ISO (если указаны)
    if (input.sampleDate) {
      validateISODate(input.sampleDate, 'Дата отбора пробы');
    }
    if (input.analysisDate) {
      validateISODate(input.analysisDate, 'Дата анализа');
    }
    if (input.receivedDate) {
      validateISODate(input.receivedDate, 'Дата получения результатов');
    }

    // Шаг 3: Валидация логики дат (если указаны)
    // Нужно получить текущие значения дат из БД для полной проверки
    // Но для упрощения проверяем только указанные поля
    if (input.sampleDate && input.analysisDate && new Date(input.analysisDate) < new Date(input.sampleDate)) {
      throw new Error('Дата анализа не может быть раньше даты отбора пробы');
    }

    if (input.receivedDate && input.analysisDate && new Date(input.receivedDate) < new Date(input.analysisDate)) {
      throw new Error('Дата получения результатов не может быть раньше даты анализа');
    }

    // Шаг 4: Валидация внешней лаборатории
    if (input.externalLab && !input.externalLabName?.trim()) {
      throw new Error('Название внешней лаборатории обязательно, если анализ выполнен внешней лабораторией');
    }

    // Шаг 5: Получение текущего пользователя для аудита
    const { data: { user } } = await supabase.auth.getUser();

    // Шаг 6: Формирование объекта обновления
    const updateData: any = {
      updated_at: new Date().toISOString(), // Явно обновляем updated_at
    };

    // Добавляем updated_by, если пользователь авторизован
    if (user?.email) {
      updateData.updated_by = user.email;
    }

    // Добавляем только те поля, которые указаны (не undefined)
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

    // Шаг 7: Проверка, что есть хотя бы одно поле для обновления (кроме служебных)
    const userFields = Object.keys(updateData).filter(key => key !== 'updated_at' && key !== 'updated_by');
    if (userFields.length === 0) {
      throw new Error('Не указаны поля для обновления');
    }

    // Шаг 8: Обновление в БД
    const { data, error } = await supabase
      .from('water_analysis')
      .update(updateData)
      .eq('id', id.trim())
      .select('*')
      .single();

    // Шаг 9: Обработка ошибок
    if (error) {
      console.error('[waterAnalysisApi] Ошибка updateWaterAnalysis:', {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        id: id.trim(),
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

    // Шаг 10: Проверка результата
    if (!data) {
      throw new Error('Анализ не найден');
    }

    // Шаг 11: Очистка кэша
    clearWaterQualityCache('water_analyses');
    clearWaterQualityCache(`water_analysis_${id.trim()}`);

    // Шаг 12: Преобразование и возврат
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
    
    console.error('[waterAnalysisApi] Исключение в updateWaterAnalysis:', {
      error: error.message || error,
      stack: error.stack,
      id,
    });
    throw error;
  }
}

/**
 * Удалить анализ
 * 
 * @param id - ID анализа для удаления
 * @returns void
 * 
 * Логика работы:
 * 1. Валидация ID
 * 2. Удаление из БД
 * 3. Обработка ошибок (включая foreign key constraint - если анализ используется)
 * 4. Очистка кэша (анализы и результаты)
 * 
 * Примечание: При удалении анализа также очищается кэш результатов,
 * так как результаты связаны с анализом через foreign key.
 */
export async function deleteWaterAnalysis(id: string): Promise<void> {
  try {
    // Шаг 1: Валидация ID
    validateId(id, 'ID анализа');

    // Шаг 2: Удаление из БД
    const { error } = await supabase
      .from('water_analysis')
      .delete()
      .eq('id', id.trim());

    // Шаг 3: Обработка ошибок
    if (error) {
      console.error('[waterAnalysisApi] Ошибка deleteWaterAnalysis:', {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        id: id.trim(),
      });
      
      // Специальная обработка ошибки foreign key constraint
      // Это означает, что анализ используется в других таблицах
      if (error.code === '23503') {
        throw new Error('Невозможно удалить анализ: он используется в других записях');
      }
      
      throw new Error(error.message || 'Ошибка при удалении анализа');
    }

    // Шаг 4: Очистка кэша
    // Очищаем кэш анализов, конкретного анализа и результатов
    clearWaterQualityCache('water_analyses');
    clearWaterQualityCache(`water_analysis_${id.trim()}`);
    clearWaterQualityCache('analysis_results');
    clearWaterQualityCache(`analysis_results_${id.trim()}`);
  } catch (error: any) {
    // Если ошибка уже обработана выше, просто пробрасываем
    if (error.message && (
      error.message.includes('обязателен') ||
      error.message.includes('используется')
    )) {
      throw error;
    }
    
    console.error('[waterAnalysisApi] Исключение в deleteWaterAnalysis:', {
      error: error.message || error,
      stack: error.stack,
      id,
    });
    throw error;
  }
}
