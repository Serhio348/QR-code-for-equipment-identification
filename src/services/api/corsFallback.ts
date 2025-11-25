/**
 * Утилиты для обхода CORS ошибок
 * 
 * Используется для POST запросов, когда CORS блокирует обычные запросы
 */

import { API_CONFIG } from '../../config/api';
import { Equipment } from '../../types/equipment';
import { getEquipmentById } from './equipmentQueries';

/**
 * Проверяет, является ли ошибка CORS ошибкой
 */
export function isCorsError(error: any): boolean {
  return error.name === 'TypeError' && 
         (error.message?.includes('CORS') || 
          error.message?.includes('Failed to fetch') ||
          error.message?.includes('fetch') ||
          error.message?.includes('network'));
}

/**
 * Отправляет POST запрос через no-cors режим с URL-encoded форматом
 * 
 * @param {string} action - Действие для выполнения
 * @param {Record<string, any>} data - Данные для отправки
 * @returns {Promise<void>} Промис, который резолвится после отправки
 */
export async function sendNoCorsRequest(action: string, data: Record<string, any>): Promise<void> {
  const postUrl = API_CONFIG.EQUIPMENT_API_URL;
  const formData = new URLSearchParams();
  formData.append('action', action);
  
  // Добавляем все поля данных
  Object.keys(data).forEach(key => {
    const value = data[key];
    if (value !== undefined && value !== null) {
      if (typeof value === 'object') {
        // Для объектов (например, specs) сериализуем в JSON
        formData.append(key, JSON.stringify(value));
      } else {
        formData.append(key, String(value));
      }
    }
  });
  
  await fetch(postUrl, {
    method: 'POST',
    mode: 'no-cors',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString()
  }).catch(() => {
    // Игнорируем ошибки no-cors запросов (они всегда возникают)
  });
}

/**
 * Ожидает и проверяет обновление оборудования после no-cors запроса
 * 
 * @param {string} id - ID оборудования
 * @param {number} maxAttempts - Максимальное количество попыток
 * @param {number} initialDelayMs - Начальная задержка в миллисекундах
 * @returns {Promise<Equipment | null>} Обновленное оборудование или null
 */
export async function waitForEquipmentUpdate(
  id: string,
  maxAttempts: number = 5,
  initialDelayMs: number = 1500
): Promise<Equipment | null> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const delay = initialDelayMs * attempt;
    await new Promise(resolve => setTimeout(resolve, delay));
    
    try {
      const equipment = await getEquipmentById(id, true);
      if (equipment) {
        return equipment;
      }
    } catch (error) {
      // Продолжаем попытки
    }
  }
  
  return null;
}

/**
 * Ожидает и проверяет удаление оборудования после no-cors запроса
 * 
 * @param {string} id - ID оборудования
 * @param {number} maxAttempts - Максимальное количество попыток
 * @param {number} initialDelayMs - Начальная задержка в миллисекундах
 * @returns {Promise<boolean>} true если оборудование удалено, false если все еще существует
 */
export async function waitForEquipmentDeletion(
  id: string,
  maxAttempts: number = 8,
  initialDelayMs: number = 1500
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const delay = initialDelayMs * attempt;
    await new Promise(resolve => setTimeout(resolve, delay));
    
    try {
      const equipment = await getEquipmentById(id, true);
      if (!equipment) {
        // Оборудование не найдено - значит удалено успешно
        return true;
      }
    } catch (error: any) {
      const errorMessage = error?.message || error?.toString() || '';
      // Если ошибка говорит о том, что оборудование не найдено, считаем удаление успешным
      if (errorMessage.includes('не найдено') || errorMessage.includes('not found')) {
        return true;
      }
    }
  }
  
  return false;
}

