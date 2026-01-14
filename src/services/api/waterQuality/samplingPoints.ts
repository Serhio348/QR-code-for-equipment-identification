/**
 * API для работы с пунктами отбора проб
 * 
 * Этот модуль содержит все CRUD операции для управления пунктами отбора проб.
 * Использует модули cache, validators и mappers для переиспользования кода.
 */

import { supabase } from '../../../config/supabase';
import type { SamplingPoint, CacheOptions } from '../../../types/waterQuality';

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
} from './cache';
import { validateLimit } from './validators';
import { mapSamplingPointFromDb } from './mappers';

/**
 * Получить все пункты отбора проб
 * 
 * @param limit - Максимальное количество записей (по умолчанию 1000, максимум 10000)
 * @param useCache - Использовать кэш (по умолчанию true)
 * @param cacheOptions - Опции кэширования
 * @returns Массив пунктов отбора проб
 * 
 * Логика работы:
 * 1. Валидируем лимит (защита от слишком больших запросов)
 * 2. Проверяем кэш - если данные свежие, возвращаем их
 * 3. Если кэш устарел, но включен stale-while-revalidate, возвращаем старые данные и обновляем в фоне
 * 4. Иначе делаем запрос к БД с дедупликацией (если несколько компонентов запрашивают одновременно)
 */
export async function getAllSamplingPoints(
  limit: number = DEFAULT_MAX_LIMIT,
  useCache: boolean = true,
  cacheOptions?: CacheOptions
): Promise<SamplingPoint[]> {
  try {
    // Шаг 1: Валидация лимита
    // Используем функцию из validators.ts вместо дублирования кода
    const validLimit = validateLimit(limit, MAX_HISTORICAL_LIMIT);

    // Шаг 2: Получаем опции кэша с дефолтными значениями
    const cacheOpts = getCacheOptions(cacheOptions);

    // Шаг 3: Генерируем уникальный ключ кэша на основе параметров запроса
    const cacheKey = generateCacheKey('sampling_points', { limit: validLimit });
    
    // Переменная для хранения устаревших данных (stale-while-revalidate)
    let staleData: SamplingPoint[] | null = null;
    
    // Шаг 4: Проверяем кэш
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

    // Шаг 5: Выполняем запрос с дедупликацией
    // Если несколько компонентов запрашивают одновременно, выполнится только один запрос
    const fetchPromise = deduplicateRequest(cacheKey, async () => {
      // Запрос к Supabase
      const { data, error } = await supabase
        .from('sampling_points')
        .select('*')
        .eq('is_active', true)  // Только активные пункты
        .order('name', { ascending: true })
        .limit(validLimit);

      if (error) {
        console.error('[samplingPointsApi] Ошибка getAllSamplingPoints:', {
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

      // Преобразуем данные из формата БД в TypeScript типы
      const result = (data || []).map(mapSamplingPointFromDb);

      // Сохраняем в кэш для следующих запросов
      if (useCache) {
        setCacheEntry(cacheKey, result, cacheOpts);
      }

      return result;
    });

    // Шаг 6: Если есть stale данные, возвращаем их немедленно, обновление в фоне
    if (staleData !== null && cacheOpts.staleWhileRevalidate) {
      // Обновляем кэш в фоне (не ждем)
      fetchPromise.catch(err => {
        console.error('[samplingPointsApi] Ошибка обновления кэша (stale-while-revalidate):', err);
      });
      return staleData;
    }

    // Иначе ждем результат запроса
    return await fetchPromise;
  } catch (error: any) {
    console.error('[samplingPointsApi] Исключение в getAllSamplingPoints:', error);
    throw error;
  }
}
