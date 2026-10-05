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
import { useRequestGate } from '@/shared/async/requestGate';
import { Equipment, EquipmentSpecs } from '../types/equipment';
import { getAllEquipment, getEquipmentById } from '../services/equipmentApi';

/**
 * Интерфейс результата хука
 */
interface UseEquipmentDataResult {
  data: Equipment | Equipment[] | null;  // Загруженные данные
  loading: boolean;                      // Состояние загрузки
  error: string | null;                  // Сбой загрузки, не путать с отсутствием записи
  notFound: boolean;                     // Запись с этим ID отсутствует
  refetch: () => Promise<void>;          // Функция перезагрузки данных
}

/**
 * Кеш для хранения загруженных данных
 * Ключ: 'all' для списка, или ID оборудования для одного элемента
 */
const cache = new Map<string, { data: Equipment | Equipment[]; timestamp: number }>();
const inflight = new Map<string, Promise<'ok' | 'missing'>>();

/** Показывать сохранённый список сразу, даже если он уже не самый свежий. */
const SHOW_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Пока запись свежая, повторный заход не ходит в Google Apps Script. */
const FRESH_MS = 2 * 60 * 1000;
const STORAGE_KEY = 'equipment-data-cache-v1';

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
function isFreshEnough(timestamp: number, maxAge: number): boolean {
  return Date.now() - timestamp < maxAge;
}

function readStoredList(): Equipment[] | null {
  const entry = cache.get('all');
  if (!entry || !Array.isArray(entry.data) || !isFreshEnough(entry.timestamp, SHOW_MAX_AGE_MS)) return null;
  return entry.data;
}

function readStoredEquipment(id: string): Equipment | null {
  const direct = cache.get(id);
  if (direct && !Array.isArray(direct.data) && isFreshEnough(direct.timestamp, SHOW_MAX_AGE_MS)) {
    return direct.data;
  }
  return readStoredList()?.find((item) => item.id === id) ?? null;
}

function entryIsFresh(key: string): boolean {
  const entry = cache.get(key);
  if (entry && isFreshEnough(entry.timestamp, FRESH_MS)) return true;
  if (key === 'all') return false;
  const list = cache.get('all');
  return Boolean(
    list
    && Array.isArray(list.data)
    && list.data.some((item) => item.id === key)
    && isFreshEnough(list.timestamp, FRESH_MS),
  );
}

async function fetchEquipment(requestedId: string | undefined): Promise<'ok' | 'missing'> {
  if (requestedId) {
    const equipment = await getEquipmentById(requestedId);
    if (!equipment) return 'missing';
    rememberEquipment(requestedId, normalizeEquipmentDates(equipment));
    return 'ok';
  }
  const allEquipment = await getAllEquipment();
  rememberEquipment('all', allEquipment.map(normalizeEquipmentDates));
  return 'ok';
}

function persistCache(): void {
  try {
    const entries = [...cache.entries()].map(([key, value]) => ({
      key,
      data: value.data,
      timestamp: value.timestamp,
    }));
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Приватный режим или переполненное хранилище не должны ломать экран.
  }
}

function rememberEquipment(key: string, data: Equipment | Equipment[]): void {
  const timestamp = Date.now();
  cache.set(key, { data, timestamp });
  if (key === 'all' && Array.isArray(data)) {
    for (const item of data) {
      cache.set(item.id, { data: item, timestamp });
    }
  }
  persistCache();
}

function restoreCache(): void {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const entries = JSON.parse(raw) as Array<{ key: string; data: Equipment | Equipment[]; timestamp: number }>;
    for (const entry of entries) {
      if (entry?.key && isFreshEnough(entry.timestamp, SHOW_MAX_AGE_MS)) {
        cache.set(entry.key, { data: entry.data, timestamp: entry.timestamp });
      }
    }
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}

restoreCache();

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
  const stored = id ? readStoredEquipment(id) : readStoredList();
  const [data, setData] = useState<Equipment | Equipment[] | null>(stored);
  const [loading, setLoading] = useState<boolean>(stored == null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState<boolean>(false);
  
  // Используем ref для предотвращения обновления состояния после размонтирования
  const isMountedRef = useRef(true);
  const requests = useRequestGate();
  
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
    const requestedId = idRef.current;
    const cacheKey = requestedId || 'all';
    const token = requests.begin();
    const stillCurrent = (): boolean =>
      isMountedRef.current && requests.isCurrent(token) && idRef.current === requestedId;
    const visible = requestedId ? readStoredEquipment(requestedId) : readStoredList();

    if (!forceRefresh && visible) {
      if (stillCurrent()) {
        setData(visible);
        setLoading(false);
        setError(null);
        setNotFound(false);
      }
      if (entryIsFresh(cacheKey)) return;
    } else if (stillCurrent()) {
      setError(null);
      setNotFound(false);
      if (visible) {
        setData(visible);
        setLoading(false);
      } else {
        setLoading(true);
        setData(null);
      }
    }

    let task: Promise<'ok' | 'missing'> | undefined;
    try {
      if (requestedId && !forceRefresh) {
        const listTask = inflight.get('all');
        if (listTask) {
          try {
            await listTask;
          } catch {
            // Список не загрузился — карточку запросим отдельно.
          }
          const fromList = readStoredEquipment(requestedId);
          if (fromList) {
            if (stillCurrent()) {
              setData(fromList);
              setLoading(false);
              setError(null);
              setNotFound(false);
            }
            if (entryIsFresh(cacheKey)) return;
          }
        }
      }

      task = !forceRefresh ? inflight.get(cacheKey) : undefined;
      if (!task) {
        task = fetchEquipment(requestedId);
        inflight.set(cacheKey, task);
      }
      const outcome = await task;
      if (inflight.get(cacheKey) === task) inflight.delete(cacheKey);
      if (!stillCurrent()) return;

      const next = requestedId ? readStoredEquipment(requestedId) : readStoredList();
      if (outcome === 'missing' && !next) {
        setData(null);
        setLoading(false);
        setError(null);
        setNotFound(true);
        return;
      }
      if (next) {
        setData(next);
        setLoading(false);
        setError(null);
        setNotFound(false);
      }
    } catch (err: unknown) {
      if (task && inflight.get(cacheKey) === task) inflight.delete(cacheKey);
      console.error('Ошибка загрузки оборудования:', err);
      if (!stillCurrent()) return;
      const fallback = requestedId ? readStoredEquipment(requestedId) : readStoredList();
      if (fallback) {
        setData(fallback);
        setLoading(false);
        setError(null);
        setNotFound(false);
        return;
      }
      const message = err instanceof Error ? err.message : 'Не удалось загрузить данные оборудования';
      setError(message);
      setNotFound(false);
      setLoading(false);
      setData(null);
    }
  }, [requests]);
  
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
    notFound,
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
    cache.delete('all');
    persistCache();
    notifyCacheChange(id);
    notifyCacheChange('all');
    return;
  }
  cache.clear();
  inflight.clear();
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Хранилище может быть недоступно в тесте.
  }
  cacheSubscribers.forEach((_, key) => {
    notifyCacheChange(key);
  });
}

/**
 * Функция для обновления кеша после изменения оборудования
 */
export function updateEquipmentCache(equipment: Equipment): void {
  const normalized = normalizeEquipmentDates(equipment);
  const timestamp = Date.now();
  cache.set(normalized.id, { data: normalized, timestamp });
  const all = cache.get('all');
  if (all && Array.isArray(all.data)) {
    cache.set('all', {
      data: all.data.map((item) => item.id === normalized.id ? normalized : item),
      timestamp,
    });
  }
  persistCache();
  notifyCacheChange(normalized.id);
  notifyCacheChange('all');
}

