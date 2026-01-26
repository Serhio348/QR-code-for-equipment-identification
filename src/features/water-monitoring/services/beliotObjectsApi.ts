/**
 * API клиент для работы с объектами через Beliot API
 * 
 * Основан на NEKTA CORE API: https://beliot.by:4443/api/documentation
 */

import { beliotApiRequest } from './beliotApi';
import { getBeliotToken } from './beliotAuthApi';
import { API_CONFIG } from '../../../config/api';

/**
 * Интерфейс объекта
 */
export interface BeliotObject {
  id: number;
  name: string;
  description?: string;
  address?: string;
  company_id?: number;
  [key: string]: any;
}

/**
 * Получить Bearer token для аутентификации
 */
async function getAuthToken(customToken?: string): Promise<string> {
  if (customToken) {
    return customToken;
  }
  
  if (API_CONFIG.BELIOT_API_KEY) {
    return API_CONFIG.BELIOT_API_KEY;
  }
  
  return await getBeliotToken();
}

/**
 * Получить список объектов компании
 * 
 * Использует endpoint: POST /api/objects/accounting_point/company/list
 * 
 * @param {string} token - Bearer token для аутентификации
 * @returns {Promise<BeliotObject[]>} Список объектов
 */
export async function getCompanyObjects(token?: string): Promise<BeliotObject[]> {
  try {
    const authToken = await getAuthToken(token);
    
    const response = await beliotApiRequest(
      'objects/accounting_point/company/list',
      'POST',
      {},
      undefined,
      {
        'Authorization': `Bearer ${authToken}`,
      }
    );
    
    // Проверяем различные форматы ответа
    if (response?.data) {
      // Формат: { data: [...] }
      if (Array.isArray(response.data)) {
        console.log(`✅ Получено объектов: ${response.data.length}`);
        return response.data;
      }
      
      // Формат: { data: { objects: [...] } }
      if (response.data.objects && Array.isArray(response.data.objects)) {
        console.log(`✅ Получено объектов: ${response.data.objects.length}`);
        return response.data.objects;
      }
      
      // Формат: { data: { data: [...] } }
      if (response.data.data && Array.isArray(response.data.data)) {
        console.log(`✅ Получено объектов: ${response.data.data.length}`);
        return response.data.data;
      }
      
      // Формат: { data: { accounting_points: [...] } }
      if (response.data.accounting_points && Array.isArray(response.data.accounting_points)) {
        console.log(`✅ Получено объектов (accounting_points): ${response.data.accounting_points.length}`);
        return response.data.accounting_points;
      }
    }
    
    // Формат: прямой массив
    if (Array.isArray(response)) {
      return response;
    }

    console.warn('⚠️ Неожиданный формат ответа от objects/accounting_point/company/list:', {
      hasData: !!response?.data,
      dataKeys: response?.data ? Object.keys(response.data) : [],
      responseKeys: Object.keys(response || {}),
    });
    return [];
  } catch (error: any) {
    console.error('Ошибка получения объектов компании:', error);
    
    // Если ошибка 401, пробуем обновить токен
    if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
      console.log('🔄 Токен истек, обновляем...');
      try {
        const newToken = await getBeliotToken(true);
        return await getCompanyObjects(newToken);
      } catch (retryError: any) {
        throw new Error(`Не удалось получить объекты компании после обновления токена: ${retryError.message}`);
      }
    }
    
    throw new Error(`Не удалось получить объекты компании: ${error.message}`);
  }
}

