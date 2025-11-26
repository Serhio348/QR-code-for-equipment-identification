/**
 * useEquipmentData.ts
 * 
 * НАЗНАЧЕНИЕ:
 * Хук для загрузки и кеширования данных оборудования.
 * Устраняет дублирование кода загрузки данных в компонентах.
 * 
 * ПРЕИМУЩЕСТВА:
 * - Убирает дублирование логики загрузки (~150 строк кода)
 * - Добавляет кеширование данных (не загружает дважды)
 * - Единая обработка ошибок
 * - Упрощает компоненты (1 строка вместо 30+)
 * - Легко добавить автообновление и синхронизацию
 * 
 * ИСПОЛЬЗОВАНИЕ:
 * // Загрузка списка оборудования
 * const { data: equipmentList, loading, error, refetch } = useEquipmentData();
 * 
 * // Загрузка одного оборудования
 * const { data: equipment, loading, error, refetch } = useEquipmentData(id);
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Equipment } from '../types/equipment';
import { getAllEquipment, getEquipmentById } from '../services/equipmentApi';

/**
 * Интерфейс результата хука
 */
interface UseEquipmentDataResult {
  data: Equipment | Equipment[] | null;  // Загруженные данные
  loading: boolean;                      // Состояние загрузки
  error: string | null;                  // Ошибка (если есть)
  refetch: () => Promise<void>;          // Функция перезагрузки данных
}

/**
 * Кеш для хранения загруженных данных
 * Ключ: 'all' для списка, или ID оборудования для одного элемента
 */
const cache = new Map<string, { data: Equipment | Equipment[]; timestamp: number }>();

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

/**
 * Нормализация дат в оборудовании
 * Убирает время из дат, оставляя только YYYY-MM-DD
 */
const normalizeEquipmentDates = (equipment: Equipment): Equipment => {
  return {
    ...equipment,
    commissioningDate: equipment.commissioningDate 
      ? String(equipment.commissioningDate).split('T')[0].split(' ')[0].trim() 
      : undefined,
    lastMaintenanceDate: equipment.lastMaintenanceDate 
      ? String(equipment.lastMaintenanceDate).split('T')[0].split(' ')[0].trim() 
      : undefined,
  };
};

/**
 * Хук для загрузки данных оборудования
 * 
 * @param id - ID оборудования (опционально). Если не указан, загружает список всех
 * @returns Объект с данными, состоянием загрузки, ошибкой и функцией refetch
 * 
 * @example
 * // Загрузка списка
 * const { data, loading, error } = useEquipmentData();
 * 
 * // Загрузка одного оборудования
 * const { data, loading, error } = useEquipmentData('equipment-id');
 */
export function useEquipmentData(id?: string): UseEquipmentDataResult {
  const [data, setData] = useState<Equipment | Equipment[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Используем ref для предотвращения обновления состояния после размонтирования
  const isMountedRef = useRef(true);
  
  // Ключ кеша
  const cacheKey = id || 'all';
  
  /**
   * Загрузка данных
   * 
   * @param forceRefresh - Принудительная перезагрузка (игнорирует кеш)
   */
  const loadData = useCallback(async (forceRefresh: boolean = false) => {
    // Проверяем кеш, если не принудительная перезагрузка
    if (!forceRefresh) {
      const cached = cache.get(cacheKey);
      if (cached && isCacheValid(cached.timestamp)) {
        if (isMountedRef.current) {
          setData(cached.data);
          setLoading(false);
          setError(null);
        }
        return;
      }
    }
    
    // Устанавливаем состояние загрузки
    if (isMountedRef.current) {
      setLoading(true);
      setError(null);
    }
    
    try {
      let result: Equipment | Equipment[];
      
      if (id) {
        // Загрузка одного оборудования
        const equipment = await getEquipmentById(id);
        if (!equipment) {
          throw new Error('Оборудование не найдено');
        }
        result = normalizeEquipmentDates(equipment);
      } else {
        // Загрузка списка оборудования
        const allEquipment = await getAllEquipment();
        result = allEquipment.map(normalizeEquipmentDates);
      }
      
      // Сохраняем в кеш
      cache.set(cacheKey, {
        data: result,
        timestamp: Date.now(),
      });
      
      // Обновляем состояние только если компонент еще смонтирован
      if (isMountedRef.current) {
        setData(result);
        setLoading(false);
        setError(null);
      }
    } catch (err: any) {
      console.error('Ошибка загрузки оборудования:', err);
      
      if (isMountedRef.current) {
        setError(err.message || 'Не удалось загрузить данные оборудования');
        setLoading(false);
        setData(null);
      }
    }
  }, [id, cacheKey]);
  
  /**
   * Функция перезагрузки данных (игнорирует кеш)
   */
  const refetch = useCallback(async () => {
    await loadData(true);
  }, [loadData]);
  
  // Загрузка данных при монтировании или изменении ID
  useEffect(() => {
    isMountedRef.current = true;
    loadData(false);
    
    // Очистка при размонтировании
    return () => {
      isMountedRef.current = false;
    };
  }, [loadData]);
  
  return {
    data,
    loading,
    error,
    refetch,
  };
}

/**
 * Функция для очистки кеша
 * Полезно при обновлении или удалении оборудования
 */
export function clearEquipmentCache(id?: string): void {
  if (id) {
    cache.delete(id);
    // Также очищаем кеш списка, так как он мог измениться
    cache.delete('all');
  } else {
    cache.clear();
  }
}

/**
 * Функция для обновления кеша после изменения оборудования
 */
export function updateEquipmentCache(equipment: Equipment): void {
  // Обновляем кеш конкретного оборудования
  cache.set(equipment.id, {
    data: normalizeEquipmentDates(equipment),
    timestamp: Date.now(),
  });
  
  // Инвалидируем кеш списка (он мог измениться)
  cache.delete('all');
}

