/**
 * accessApi.ts
 * 
 * API функции для управления доступом пользователей к приложениям
 */

import { apiRequest } from './apiRequest';
import { API_CONFIG } from '../../config/api';
import type { UserAppAccess, UpdateUserAccessData } from '../../types/access';

/**
 * Получить список всех пользователей с их настройками доступа
 * 
 * @returns Promise с массивом настроек доступа пользователей
 */
export async function getAllUserAccess(): Promise<UserAppAccess[]> {
  try {
    // Используем apiRequest для согласованности с остальными API запросами
    // Добавляем timestamp для предотвращения кеширования
    const timestamp = Date.now();
    const result = await apiRequest<UserAppAccess[]>(
      'getAllUserAccess',
      'GET',
      undefined,
      { nocache: timestamp.toString() }
    );

    if (!result.success) {
      console.error('[accessApi] getAllUserAccess ошибка в ответе:', result.error);
      throw new Error(result.error || 'Ошибка при получении настроек доступа');
    }

    const data = result.data || [];
    console.log('[accessApi] getAllUserAccess возвращаем данные, длина:', data.length);
    if (data.length > 0) {
      console.log('[accessApi] getAllUserAccess первый элемент:', data[0]);
    }
    return data;
  } catch (error: any) {
    console.error('[accessApi] Ошибка getAllUserAccess:', error);
    throw error;
  }
}

/**
 * Получить настройки доступа для конкретного пользователя
 * 
 * @param email - Email пользователя
 * @returns Promise с настройками доступа пользователя
 */
export async function getUserAccess(email: string): Promise<UserAppAccess | null> {
  try {
    // Используем apiRequest для согласованности с остальными API запросами
    const result = await apiRequest<UserAppAccess>(
      'getUserAccess',
      'GET',
      undefined,
      { email }
    );

    if (!result.success) {
      throw new Error(result.error || 'Ошибка при получении настроек доступа');
    }

    return result.data || null;
  } catch (error: any) {
    console.error('[accessApi] Ошибка getUserAccess:', error);
    throw error;
  }
}

/**
 * Обновить настройки доступа для пользователя
 * 
 * @param data - Данные для обновления доступа
 * @returns Promise с обновленными настройками доступа
 */
export async function updateUserAccess(data: UpdateUserAccessData): Promise<UserAppAccess> {
  try {
    // Используем URL-encoded формат вместо JSON, чтобы избежать preflight-запросов CORS
    const formData = new URLSearchParams();
    formData.append('action', 'updateUserAccess');
    formData.append('email', data.email);
    
    if (data.access.equipment !== undefined) {
      formData.append('equipment', data.access.equipment.toString());
    }
    if (data.access.water !== undefined) {
      formData.append('water', data.access.water.toString());
    }

    const response = await fetch(API_CONFIG.EQUIPMENT_API_URL, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    const responseText = await response.text();
    console.log('[accessApi] updateUserAccess ответ:', responseText.substring(0, 500));

    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      console.error('[accessApi] Ошибка парсинга JSON:', parseError);
      throw new Error('Неверный формат ответа от сервера');
    }

    if (!result.success) {
      throw new Error(result.error || 'Ошибка при обновлении настроек доступа');
    }

    if (!result.data) {
      throw new Error('Данные не получены от сервера');
    }

    return result.data;
  } catch (error: any) {
    console.error('[accessApi] Ошибка updateUserAccess:', error);
    throw error;
  }
}

/**
 * Проверить, есть ли у пользователя доступ к приложению
 * 
 * @param email - Email пользователя
 * @param appId - ID приложения
 * @returns Promise с результатом проверки доступа
 */
export async function checkUserAccess(email: string, appId: 'equipment' | 'water'): Promise<boolean> {
  try {
    const access = await getUserAccess(email);
    if (!access) {
      // Если настроек нет, по умолчанию доступ запрещен
      return false;
    }
    
    return access[appId] === true;
  } catch (error: any) {
    console.error('[accessApi] Ошибка checkUserAccess:', error);
    // В случае ошибки, по умолчанию доступ запрещен
    return false;
  }
}

