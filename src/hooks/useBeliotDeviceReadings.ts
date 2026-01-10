/**
 * React хук для работы с показаниями счетчиков Beliot из Supabase
 * 
 * Предоставляет удобный интерфейс для получения и управления показаниями
 * с поддержкой пагинации, фильтрации и автоматической загрузки.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getBeliotReadings,
  getLastBeliotReading,
  getBeliotReadingStats,
  getBeliotReadingsByPeriod,
  type BeliotDeviceReading,
  type GetReadingsOptions,
  type BeliotReadingStats,
} from '../services/api/supabaseBeliotReadingsApi';

/**
 * Результат работы хука
 */
export interface UseBeliotDeviceReadingsResult {
  /** Массив показаний */
  readings: BeliotDeviceReading[];
  /** Последнее показание устройства */
  lastReading: BeliotDeviceReading | null;
  /** Статистика по показаниям */
  stats: BeliotReadingStats | null;
  /** Состояние загрузки */
  loading: boolean;
  /** Ошибка, если произошла */
  error: Error | null;
  /** Общее количество записей */
  total: number;
  /** Есть ли еще записи для загрузки */
  hasMore: boolean;
  /** Загрузить следующую страницу */
  loadMore: () => Promise<void>;
  /** Обновить показания */
  refresh: () => Promise<void>;
  /** Загрузить статистику */
  loadStats: (startDate?: string, endDate?: string) => Promise<void>;
  /** Загрузить показания за период */
  loadByPeriod: (startDate: string, endDate: string) => Promise<void>;
}

/**
 * Хук для работы с показаниями счетчика Beliot
 * 
 * @param device_id - ID устройства (null для отключения загрузки)
 * @param options - Опции для фильтрации и пагинации
 * @returns Объект с показаниями, состоянием загрузки и методами управления
 */
export function useBeliotDeviceReadings(
  device_id: string | null,
  options: GetReadingsOptions = {}
): UseBeliotDeviceReadingsResult {
  const [readings, setReadings] = useState<BeliotDeviceReading[]>([]);
  const [lastReading, setLastReading] = useState<BeliotDeviceReading | null>(null);
  const [stats, setStats] = useState<BeliotReadingStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [currentOffset, setCurrentOffset] = useState(0);

  const {
    limit = 100,
    reading_type = 'all',
    start_date,
    end_date,
    autoLoad = true,
  } = options;

  /**
   * Загрузка показаний
   */
  const loadReadings = useCallback(async (offset: number = 0, append: boolean = false) => {
    if (!device_id) {
      setReadings([]);
      setTotal(0);
      setHasMore(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await getBeliotReadings({
        ...options,
        device_id,
        limit,
        offset,
      });

      if (append) {
        setReadings((prev) => [...prev, ...response.data]);
      } else {
        setReadings(response.data);
      }

      setTotal(response.total);
      setHasMore(response.has_more);
      setCurrentOffset(offset);
    } catch (err: any) {
      setError(err);
      setReadings([]);
      setTotal(0);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [device_id, limit, reading_type, start_date, end_date, JSON.stringify(options)]);

  /**
   * Загрузка последнего показания
   */
  const loadLastReading = useCallback(async () => {
    if (!device_id) {
      setLastReading(null);
      return;
    }

    try {
      const reading = await getLastBeliotReading(
        device_id,
        reading_type === 'all' ? 'hourly' : reading_type
      );
      setLastReading(reading);
    } catch (err: any) {
      console.error('Ошибка загрузки последнего показания:', err);
      setLastReading(null);
    }
  }, [device_id, reading_type]);

  /**
   * Загрузка статистики
   */
  const loadStats = useCallback(async (startDate?: string, endDate?: string) => {
    if (!device_id) {
      setStats(null);
      return;
    }

    try {
      const statistics = await getBeliotReadingStats(
        device_id,
        startDate || start_date,
        endDate || end_date
      );
      setStats(statistics);
    } catch (err: any) {
      console.error('Ошибка загрузки статистики:', err);
      setStats(null);
    }
  }, [device_id, start_date, end_date]);

  /**
   * Загрузка показаний за период
   */
  const loadByPeriod = useCallback(async (startDate: string, endDate: string) => {
    if (!device_id) {
      setReadings([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const periodReadings = await getBeliotReadingsByPeriod(device_id, startDate, endDate);
      setReadings(periodReadings);
      setTotal(periodReadings.length);
      setHasMore(false);
    } catch (err: any) {
      setError(err);
      setReadings([]);
    } finally {
      setLoading(false);
    }
  }, [device_id]);

  /**
   * Загрузить следующую страницу
   */
  const loadMore = useCallback(async () => {
    if (!hasMore || loading) {
      return;
    }

    await loadReadings(currentOffset + limit, true);
  }, [hasMore, loading, currentOffset, limit, loadReadings]);

  /**
   * Обновить показания
   */
  const refresh = useCallback(async () => {
    await Promise.all([
      loadReadings(0, false),
      loadLastReading(),
    ]);
  }, [loadReadings, loadLastReading]);

  // Автоматическая загрузка при изменении device_id или опций (только если autoLoad !== false)
  useEffect(() => {
    if (autoLoad && device_id) {
      loadReadings(0, false);
      loadLastReading();
    } else if (!device_id) {
      // Если device_id стал null, очищаем данные
      setReadings([]);
      setLastReading(null);
      setTotal(0);
      setHasMore(false);
    }
  }, [autoLoad, device_id, loadReadings, loadLastReading]);

  return {
    readings,
    lastReading,
    stats,
    loading,
    error,
    total,
    hasMore,
    loadMore,
    refresh,
    loadStats,
    loadByPeriod,
  };
}

