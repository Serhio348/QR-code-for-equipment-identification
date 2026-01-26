/**
 * Модуль кэширования для API качества воды
 */

import type { CacheOptions } from '../../types/waterQuality';

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
 */
const cache = new Map<string, CacheEntry>();

/**
 * Время жизни кэша по умолчанию в миллисекундах (5 минут)
 */
export const DEFAULT_CACHE_TTL = 5 * 60 * 1000;

/**
 * Максимальное количество записей по умолчанию
 */
export const DEFAULT_MAX_LIMIT = 1000;

/**
 * Максимальный лимит для исторических данных
 */
export const MAX_HISTORICAL_LIMIT = 10000;

/**
 * Активные запросы для дедупликации параллельных вызовов
 */
const activeRequests = new Map<string, Promise<any>>();

/**
 * Проверка валидности кэша
 */
export function isCacheValid(entry: CacheEntry): boolean {
  const age = Date.now() - entry.timestamp;
  return age < entry.ttl;
}

/**
 * Проверка, является ли кэш устаревшим (stale), но еще пригодным для stale-while-revalidate
 */
export function isCacheStale(entry: CacheEntry): boolean {
  const age = Date.now() - entry.timestamp;
  return age >= entry.ttl && entry.staleWhileRevalidate;
}

/**
 * Генерация ключа кэша из параметров
 */
export function generateCacheKey(prefix: string, params: Record<string, any>): string {
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}:${JSON.stringify(params[key])}`)
    .join('|');
  return `${prefix}_${sortedParams}`;
}

/**
 * Получить опции кэша с значениями по умолчанию
 */
export function getCacheOptions(options?: CacheOptions): Required<CacheOptions> {
  return {
    ttl: options?.ttl ?? DEFAULT_CACHE_TTL,
    staleWhileRevalidate: options?.staleWhileRevalidate ?? false,
  };
}

/**
 * Получить запись из кэша
 */
export function getCacheEntry(key: string): CacheEntry | undefined {
  return cache.get(key);
}

/**
 * Сохранить запись в кэш
 */
export function setCacheEntry(key: string, data: any, options: Required<CacheOptions>): void {
  cache.set(key, {
    data,
    timestamp: Date.now(),
    ttl: options.ttl,
    staleWhileRevalidate: options.staleWhileRevalidate,
  });
}

/**
 * Очистка кэша
 */
export function clearWaterQualityCache(pattern?: string): void {
  if (pattern) {
    for (const key of cache.keys()) {
      if (key.startsWith(pattern)) {
        cache.delete(key);
      }
    }
    // Также очищаем активные запросы с таким паттерном
    for (const key of activeRequests.keys()) {
      if (key.startsWith(pattern)) {
        activeRequests.delete(key);
      }
    }
  } else {
    cache.clear();
    activeRequests.clear();
  }
}

/**
 * Выполнить запрос с дедупликацией параллельных вызовов
 */
export async function deduplicateRequest<T>(
  cacheKey: string,
  requestFn: () => Promise<T>
): Promise<T> {
  const existingRequest = activeRequests.get(cacheKey);
  if (existingRequest) {
    return existingRequest as Promise<T>;
  }

  const requestPromise = requestFn()
    .finally(() => {
      activeRequests.delete(cacheKey);
    });

  activeRequests.set(cacheKey, requestPromise);
  return requestPromise;
}
