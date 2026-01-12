/**
 * Хук для загрузки участков из API
 */

import { useState, useEffect } from 'react';
import { getAllWorkshops } from '../services/api/supabaseWorkshopApi';
import { WORKSHOP_OPTIONS } from '../constants/workshops';

export function useWorkshops() {
  const [workshops, setWorkshops] = useState<string[]>(Array.from(WORKSHOP_OPTIONS));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadWorkshops();
  }, []);

  const loadWorkshops = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('[useWorkshops] Начало загрузки участков');
      
      const data = await getAllWorkshops();
      console.log('[useWorkshops] Получено участков из API:', data.length);
      console.log('[useWorkshops] Данные участков:', data);
      
      // Извлекаем только названия участков
      const workshopNames = data.map(w => w.name).filter(name => name && name.trim().length > 0);
      console.log('[useWorkshops] Названия участков (отфильтрованные):', workshopNames);
      
      if (workshopNames.length > 0) {
        console.log('[useWorkshops] Установлены участки из API:', workshopNames.length);
        setWorkshops(workshopNames);
      } else {
        console.warn('[useWorkshops] Участки не найдены в базе, используем статический список');
        console.warn('[useWorkshops] Статический список содержит:', WORKSHOP_OPTIONS.length, 'участков');
        setWorkshops(Array.from(WORKSHOP_OPTIONS));
      }
    } catch (err: any) {
      console.error('[useWorkshops] Ошибка загрузки участков:', err);
      console.error('[useWorkshops] Детали ошибки:', {
        message: err.message,
        stack: err.stack
      });
      setError(err.message);
      // Используем статический список как fallback
      console.warn('[useWorkshops] Используем статический список из-за ошибки');
      setWorkshops(Array.from(WORKSHOP_OPTIONS));
    } finally {
      setLoading(false);
      console.log('[useWorkshops] Загрузка завершена, текущее состояние workshops:', workshops.length);
    }
  };

  return {
    workshops,
    loading,
    error,
    refetch: loadWorkshops,
  };
}
