/**
 * Хук для загрузки участков из API
 */

import { useState, useEffect, useRef } from 'react';
import { getAllWorkshops } from '../services/api/supabaseWorkshopApi';
import { WORKSHOP_OPTIONS } from '../constants/workshops';

/**
 * Глобальный кеш для участков
 */
const workshopsCache = {
  data: null as string[] | null,
  timestamp: 0,
  loading: false,
};

/**
 * Время жизни кеша (5 минут)
 */
const CACHE_TTL = 5 * 60 * 1000;

/**
 * Проверка, не устарел ли кеш
 */
const isCacheValid = (timestamp: number): boolean => {
  return Date.now() - timestamp < CACHE_TTL;
};

export function useWorkshops() {
  const [workshops, setWorkshops] = useState<string[]>(Array.from(WORKSHOP_OPTIONS));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Используем ref для предотвращения обновления состояния после размонтирования
  const isMountedRef = useRef(true);

  const loadWorkshops = async (forceRefresh: boolean = false) => {
    // Проверяем кеш, если не принудительная перезагрузка
    if (!forceRefresh) {
      if (workshopsCache.data && isCacheValid(workshopsCache.timestamp)) {
        if (isMountedRef.current) {
          setWorkshops(workshopsCache.data);
          setLoading(false);
          setError(null);
        }
        return;
      }
      
      // Если уже идет загрузка, не запускаем повторный запрос
      if (workshopsCache.loading) {
        return;
      }
    }

    try {
      workshopsCache.loading = true;
      if (isMountedRef.current) {
        setLoading(true);
        setError(null);
      }
      console.debug('[useWorkshops] Начало загрузки участков');
      
      const data = await getAllWorkshops();
      console.debug('[useWorkshops] Получено участков из API:', data.length);
      
      // Извлекаем только названия участков
      const workshopNames = data.map(w => w.name).filter(name => name && name.trim().length > 0);
      console.debug('[useWorkshops] Названия участков (отфильтрованные):', workshopNames);
      
      let finalWorkshops: string[];
      if (workshopNames.length > 0) {
        console.debug('[useWorkshops] Установлены участки из API:', workshopNames.length);
        finalWorkshops = workshopNames;
      } else {
        console.warn('[useWorkshops] Участки не найдены в базе, используем статический список');
        console.warn('[useWorkshops] Статический список содержит:', WORKSHOP_OPTIONS.length, 'участков');
        finalWorkshops = Array.from(WORKSHOP_OPTIONS);
      }
      
      // Сохраняем в кеш
      workshopsCache.data = finalWorkshops;
      workshopsCache.timestamp = Date.now();
      
      // Обновляем состояние только если компонент еще смонтирован
      if (isMountedRef.current) {
        setWorkshops(finalWorkshops);
        setLoading(false);
        setError(null);
      }
    } catch (err: any) {
      console.error('[useWorkshops] Ошибка загрузки участков:', err);
      console.error('[useWorkshops] Детали ошибки:', {
        message: err.message,
        stack: err.stack
      });
      
      // Используем статический список как fallback
      const fallbackWorkshops = Array.from(WORKSHOP_OPTIONS);
      console.warn('[useWorkshops] Используем статический список из-за ошибки');
      
      // Не кешируем ошибку, но устанавливаем fallback
      if (isMountedRef.current) {
        setError(err.message);
        setWorkshops(fallbackWorkshops);
        setLoading(false);
      }
    } finally {
      workshopsCache.loading = false;
      if (isMountedRef.current) {
        console.debug('[useWorkshops] Загрузка завершена');
      }
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    loadWorkshops(false);
    
    // Очистка при размонтировании
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return {
    workshops,
    loading,
    error,
    refetch: () => loadWorkshops(true),
  };
}
