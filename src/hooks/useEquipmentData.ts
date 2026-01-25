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
import { Equipment, EquipmentSpecs } from '../types/equipment';
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
 * Подписчики на изменения кеша
 * Ключ: ключ кеша, значение: массив функций обратного вызова
 */
const cacheSubscribers = new Map<string, Set<() => void>>();

/**
 * Подписаться на изменения кеша
 */
function subscribeToCache(key: string, callback: () => void): () => void {
  if (!cacheSubscribers.has(key)) {
    cacheSubscribers.set(key, new Set());
  }
  cacheSubscribers.get(key)!.add(callback);
  
  // Возвращаем функцию отписки
  return () => {
    const subscribers = cacheSubscribers.get(key);
    if (subscribers) {
      subscribers.delete(callback);
      if (subscribers.size === 0) {
        cacheSubscribers.delete(key);
      }
    }
  };
}

/**
 * Уведомить подписчиков об изменении кеша
 */
function notifyCacheChange(key: string): void {
  const subscribers = cacheSubscribers.get(key);
  if (subscribers) {
    subscribers.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('Ошибка при уведомлении подписчика кеша:', error);
      }
    });
  }
}

/**
 * Проверка, не устарел ли кеш
 */
const isCacheValid = (timestamp: number): boolean => {
  return Date.now() - timestamp < CACHE_TTL;
};

/**
 * Нормализация specs - убеждаемся, что это объект, а не строка
 */
const normalizeSpecs = (specs: any): EquipmentSpecs => {
  if (!specs) {
    return {};
  }
  
  // Если specs это строка, пытаемся распарсить
  if (typeof specs === 'string') {
    try {
      return JSON.parse(specs);
    } catch (e) {
      console.warn('⚠️ Не удалось распарсить specs как JSON:', e);
      return {};
    }
  }
  
  // Если specs это объект, возвращаем как есть
  if (typeof specs === 'object') {
    return specs;
  }
  
  return {};
};

/**
 * Нормализация дат в оборудовании
 * Убирает время из дат, оставляя только YYYY-MM-DD
 */
const normalizeEquipmentDates = (equipment: Equipment): Equipment => {
  return {
    ...equipment,
    specs: normalizeSpecs(equipment.specs),
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
  
  // Используем ref для хранения актуального id
  const idRef = useRef(id);
  idRef.current = id;
  
  // Используем ref для хранения функции загрузки
  const loadDataRef = useRef<((forceRefresh: boolean) => Promise<void>) | null>(null);
  
  /**
   * Загрузка данных
   * 
   * @param forceRefresh - Принудительная перезагрузка (игнорирует кеш)
   */
  const loadData = useCallback(async (forceRefresh: boolean = false) => {
    const currentId = idRef.current;
    const cacheKey = currentId || 'all';
    
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
      console.debug('[useEquipmentData] Начало загрузки данных, id:', currentId, 'forceRefresh:', forceRefresh);
      let result: Equipment | Equipment[];
      
      if (currentId) {
        // Загрузка одного оборудования
        console.debug('[useEquipmentData] Загрузка одного оборудования:', currentId);
        const equipment = await getEquipmentById(currentId);
        if (!equipment) {
          throw new Error('Оборудование не найдено');
        }
        result = normalizeEquipmentDates(equipment);
      } else {
        // Загрузка списка оборудования
        console.debug('[useEquipmentData] Загрузка списка оборудования');
        const allEquipment = await getAllEquipment();
        console.debug('[useEquipmentData] Получено оборудования:', allEquipment.length);
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
  }, []);
  
  // Сохраняем функцию в ref для доступа из useEffect
  loadDataRef.current = loadData;
  
  /**
   * Функция перезагрузки данных (игнорирует кеш)
   */
  const refetch = useCallback(async () => {
    if (loadDataRef.current) {
      await loadDataRef.current(true);
    }
  }, []);
  
  // Загрузка данных при монтировании или изменении ID
  useEffect(() => {
    const cacheKey = id || 'all';
    console.debug('[useEquipmentData] Монтирование/обновление, cacheKey:', cacheKey);
    isMountedRef.current = true;
    
    // Используем функцию из ref
    if (loadDataRef.current) {
      loadDataRef.current(false);
    }
    
    // Подписываемся на изменения кеша
    const unsubscribe = subscribeToCache(cacheKey, () => {
      console.debug('[useEquipmentData] Изменение кеша, перезагрузка данных');
      // При изменении кеша перезагружаем данные
      if (loadDataRef.current) {
        loadDataRef.current(false);
      }
    });
    
    // Очистка при размонтировании
    return () => {
      console.debug('[useEquipmentData] Размонтирование');
      isMountedRef.current = false;
      unsubscribe();
    };
  }, [id]);
  
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
    // Уведомляем подписчиков
    notifyCacheChange(id);
    notifyCacheChange('all');
  } else {
    cache.clear();
    // Уведомляем всех подписчиков
    cacheSubscribers.forEach((_, key) => {
      notifyCacheChange(key);
    });
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
  
  // Уведомляем подписчиков об изменении кеша
  notifyCacheChange(equipment.id);
  notifyCacheChange('all');
}

