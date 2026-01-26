/**
 * GET запросы для работы с оборудованием
 * 
 * Функции для получения данных об оборудовании из API
 */

import { Equipment, EquipmentType } from '../types/equipment';
import { apiRequest } from '../../../services/api/apiRequest';
import { API_CONFIG } from '../../../config/api';
import { ApiResponse } from '../../../services/api/types';

/**
 * Получить все оборудование
 * 
 * Загружает все записи оборудования из базы данных
 * 
 * @returns {Promise<Equipment[]>} Массив всего оборудования
 * 
 * @throws {Error} При ошибке сети или API
 */
export async function getAllEquipment(): Promise<Equipment[]> {
  const response = await apiRequest<Equipment[]>('getAll');
  return response.data || [];
}

/**
 * Получить оборудование по ID
 * 
 * Находит конкретное оборудование по его уникальному идентификатору
 * 
 * @param {string} id - UUID оборудования
 * @param {boolean} preventCache - Предотвратить кеширование (добавляет timestamp)
 * @returns {Promise<Equipment | null>} Объект Equipment или null, если не найдено
 * 
 * @throws {Error} При ошибке сети или API
 */
export async function getEquipmentById(id: string, preventCache: boolean = false): Promise<Equipment | null> {
  if (!id) {
    throw new Error('ID не указан');
  }

  const url = new URL(API_CONFIG.EQUIPMENT_API_URL);
  url.searchParams.append('action', 'getById');
  url.searchParams.append('id', id);
  
  // Добавляем timestamp для предотвращения кеширования
  if (preventCache) {
    url.searchParams.append('_t', Date.now().toString());
  }

  try {
    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(API_CONFIG.TIMEOUT),
      cache: preventCache ? 'no-store' : 'default',
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: ApiResponse<Equipment> = await response.json();

    if (!data.success || !data.data) {
      return null;
    }

    return data.data;
  } catch (error) {
    console.error('Error getting equipment by ID:', error);
    return null;
  }
}

/**
 * Получить оборудование по типу
 * 
 * Фильтрует оборудование по типу (filter, pump, tank, valve, etc.)
 * 
 * @param {EquipmentType} type - Тип оборудования для фильтрации
 * @returns {Promise<Equipment[]>} Массив оборудования указанного типа
 * 
 * @throws {Error} При ошибке сети или API
 */
export async function getEquipmentByType(type: EquipmentType): Promise<Equipment[]> {
  if (!type) {
    throw new Error('Тип не указан');
  }

  const url = new URL(API_CONFIG.EQUIPMENT_API_URL);
  url.searchParams.append('action', 'getByType');
  url.searchParams.append('type', type);

  try {
    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(API_CONFIG.TIMEOUT),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: ApiResponse<Equipment[]> = await response.json();

    return data.data || [];
  } catch (error) {
    console.error('Error getting equipment by type:', error);
    return [];
  }
}

