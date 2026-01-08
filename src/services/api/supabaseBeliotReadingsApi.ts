/**
 * API клиент для работы с показаниями счетчиков Beliot через Supabase
 * 
 * Заменяет хранение показаний в Google Sheets на Supabase для улучшения производительности.
 * Показания автоматически собираются через Railway cron job.
 */

import { supabase } from '../../config/supabase';

/**
 * Интерфейс для показания счетчика Beliot
 */
export interface BeliotDeviceReading {
  id: string;
  device_id: string;
  reading_date: string;
  reading_value: number;
  unit: string;
  reading_type: 'hourly' | 'daily';
  source: string;
  period: 'current' | 'previous';
  created_at: string;
  updated_at: string;
}

/**
 * Опции для получения показаний
 */
export interface GetReadingsOptions {
  /** ID устройства (опционально, если не указан - все устройства) */
  device_id?: string;
  /** Начальная дата (ISO строка) */
  start_date?: string;
  /** Конечная дата (ISO строка) */
  end_date?: string;
  /** Тип показания: 'hourly' (почасовой), 'daily' (ежедневный) или 'all' (все) */
  reading_type?: 'hourly' | 'daily' | 'all';
  /** Максимальное количество записей (по умолчанию 100) */
  limit?: number;
  /** Смещение для пагинации (по умолчанию 0) */
  offset?: number;
}

/**
 * Ответ с показаниями (с пагинацией)
 */
export interface GetReadingsResponse {
  /** Массив показаний */
  data: BeliotDeviceReading[];
  /** Общее количество записей */
  total: number;
  /** Лимит записей */
  limit: number;
  /** Смещение */
  offset: number;
  /** Есть ли еще записи */
  has_more: boolean;
}

/**
 * Статистика по показаниям устройства
 */
export interface BeliotReadingStats {
  /** Количество показаний */
  count: number;
  /** Минимальное значение */
  min_value: number;
  /** Максимальное значение */
  max_value: number;
  /** Среднее значение */
  avg_value: number;
  /** Общее потребление (разница между первым и последним показанием) */
  total_consumption: number;
}

/**
 * Получить показания счетчиков с пагинацией
 * 
 * @param options - Опции для фильтрации и пагинации
 * @returns Promise с показаниями и метаданными пагинации
 * @throws Error если произошла ошибка при запросе
 */
export async function getBeliotReadings(
  options: GetReadingsOptions = {}
): Promise<GetReadingsResponse> {
  try {
    const {
      device_id,
      start_date,
      end_date,
      reading_type = 'all',
      limit = 100,
      offset = 0,
    } = options;

    // Строим запрос с подсчетом общего количества
    let query = supabase
      .from('beliot_device_readings')
      .select('*', { count: 'exact' })
      .order('reading_date', { ascending: false })
      .range(offset, offset + limit - 1);

    // Применяем фильтры
    if (device_id) {
      query = query.eq('device_id', device_id);
    }

    if (start_date) {
      query = query.gte('reading_date', start_date);
    }

    if (end_date) {
      query = query.lte('reading_date', end_date);
    }

    if (reading_type !== 'all') {
      query = query.eq('reading_type', reading_type);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('Ошибка получения показаний:', error);
      throw new Error(`Ошибка получения показаний: ${error.message}`);
    }

    return {
      data: (data as BeliotDeviceReading[]) || [],
      total: count || 0,
      limit,
      offset,
      has_more: (count || 0) > offset + limit,
    };
  } catch (error: any) {
    console.error('Ошибка в getBeliotReadings:', error);
    throw error;
  }
}

/**
 * Получить последнее показание устройства
 * 
 * Использует RPC функцию get_last_beliot_reading для оптимизации запроса.
 * 
 * @param device_id - ID устройства
 * @param reading_type - Тип показания (по умолчанию 'hourly')
 * @returns Promise с последним показанием или null, если не найдено
 * @throws Error если произошла ошибка при запросе
 */
export async function getLastBeliotReading(
  device_id: string,
  reading_type: 'hourly' | 'daily' = 'hourly'
): Promise<BeliotDeviceReading | null> {
  try {
    const { data, error } = await supabase.rpc('get_last_beliot_reading', {
      p_device_id: device_id,
      p_reading_type: reading_type,
    });

    if (error) {
      console.error('Ошибка получения последнего показания:', error);
      throw new Error(`Ошибка получения последнего показания: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return null;
    }

    return data[0] as BeliotDeviceReading;
  } catch (error: any) {
    console.error('Ошибка в getLastBeliotReading:', error);
    throw error;
  }
}

/**
 * Получить статистику по показаниям устройства
 * 
 * Вычисляет минимальное, максимальное, среднее значение и общее потребление
 * за указанный период.
 * 
 * @param device_id - ID устройства
 * @param start_date - Начальная дата (ISO строка, опционально)
 * @param end_date - Конечная дата (ISO строка, опционально)
 * @returns Promise со статистикой
 * @throws Error если произошла ошибка при запросе
 */
export async function getBeliotReadingStats(
  device_id: string,
  start_date?: string,
  end_date?: string
): Promise<BeliotReadingStats> {
  try {
    let query = supabase
      .from('beliot_device_readings')
      .select('reading_value')
      .eq('device_id', device_id)
      .order('reading_date', { ascending: true });

    if (start_date) {
      query = query.gte('reading_date', start_date);
    }

    if (end_date) {
      query = query.lte('reading_date', end_date);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Ошибка получения статистики:', error);
      throw new Error(`Ошибка получения статистики: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return {
        count: 0,
        min_value: 0,
        max_value: 0,
        avg_value: 0,
        total_consumption: 0,
      };
    }

    // Преобразуем значения в числа
    const values = data.map((r) => Number(r.reading_value));
    const sorted = [...values].sort((a, b) => a - b);

    // Вычисляем потребление (разница между первым и последним показанием)
    const total_consumption = sorted.length > 1 
      ? sorted[sorted.length - 1] - sorted[0] 
      : 0;

    // Вычисляем среднее значение
    const avg_value = values.reduce((a, b) => a + b, 0) / values.length;

    return {
      count: values.length,
      min_value: sorted[0],
      max_value: sorted[sorted.length - 1],
      avg_value,
      total_consumption,
    };
  } catch (error: any) {
    console.error('Ошибка в getBeliotReadingStats:', error);
    throw error;
  }
}

/**
 * Получить показания устройства за период с группировкой по дням
 * 
 * Полезно для построения графиков потребления.
 * 
 * @param device_id - ID устройства
 * @param start_date - Начальная дата (ISO строка)
 * @param end_date - Конечная дата (ISO строка)
 * @returns Promise с показаниями, отсортированными по дате
 */
export async function getBeliotReadingsByPeriod(
  device_id: string,
  start_date: string,
  end_date: string
): Promise<BeliotDeviceReading[]> {
  try {
    const { data, error } = await supabase
      .from('beliot_device_readings')
      .select('*')
      .eq('device_id', device_id)
      .gte('reading_date', start_date)
      .lte('reading_date', end_date)
      .order('reading_date', { ascending: true });

    if (error) {
      console.error('Ошибка получения показаний за период:', error);
      throw new Error(`Ошибка получения показаний за период: ${error.message}`);
    }

    return (data as BeliotDeviceReading[]) || [];
  } catch (error: any) {
    console.error('Ошибка в getBeliotReadingsByPeriod:', error);
    throw error;
  }
}

/**
 * Сохранить показание счетчика в Supabase
 * 
 * Использует RPC функцию insert_beliot_reading для безопасной вставки.
 * Предотвращает дубликаты через ON CONFLICT.
 * 
 * @param reading - Данные показания для сохранения
 * @returns Promise с ID созданного/обновленного показания
 * @throws Error если произошла ошибка при сохранении
 */
export async function saveBeliotReading(reading: {
  device_id: string;
  reading_date: string | Date;
  reading_value: number;
  unit?: string;
  reading_type?: 'hourly' | 'daily';
  source?: string;
  period?: 'current' | 'previous';
}): Promise<string> {
  try {
    // Преобразуем дату в ISO строку, если это Date объект
    let readingDate: string;
    
    if (reading.reading_date instanceof Date) {
      // Проверяем валидность даты
      if (isNaN(reading.reading_date.getTime())) {
        throw new Error('Invalid date: Date object is invalid');
      }
      readingDate = reading.reading_date.toISOString();
    } else if (typeof reading.reading_date === 'string') {
      // Проверяем, что строка может быть преобразована в валидную дату
      const dateObj = new Date(reading.reading_date);
      if (isNaN(dateObj.getTime())) {
        throw new Error(`Invalid date string: ${reading.reading_date}`);
      }
      readingDate = dateObj.toISOString();
    } else {
      throw new Error(`Invalid date type: ${typeof reading.reading_date}`);
    }

    const { data, error } = await supabase.rpc('insert_beliot_reading', {
      p_device_id: reading.device_id,
      p_reading_date: readingDate,
      p_reading_value: reading.reading_value,
      p_unit: reading.unit || 'м³',
      p_reading_type: reading.reading_type || 'hourly',
      p_source: reading.source || 'api',
      p_period: reading.period || 'current',
    });

    if (error) {
      console.error('Ошибка сохранения показания:', error);
      throw new Error(`Ошибка сохранения показания: ${error.message}`);
    }

    return data as string;
  } catch (error: any) {
    console.error('Ошибка в saveBeliotReading:', error);
    throw error;
  }
}

