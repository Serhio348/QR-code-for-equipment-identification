/**
 * API для работы с Google Drive
 * 
 * Функции для создания папок и получения списка файлов
 */

import { API_CONFIG } from '@/shared/config/api';
import { DriveFolderResult, DriveFile } from '@/shared/services/api/types';
import { supabase } from '@/shared/config/supabase';

const BACKEND_API_URL = import.meta.env.VITE_AI_CONSULTANT_API_URL || '';

function backendUrl(path: string): string {
  if (BACKEND_API_URL) return `${BACKEND_API_URL}${path}`;
  return path;
}

/**
 * Создать папку в Google Drive для оборудования
 *
 * SEC-02: через Express backend (auth + admin), не напрямую в GAS.
 */
export async function createDriveFolder(
  equipmentName: string,
  parentFolderId?: string
): Promise<DriveFolderResult> {
  if (!equipmentName || !equipmentName.trim()) {
    throw new Error('Название оборудования не указано');
  }

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error('Не авторизован');
  }

  const body: Record<string, string> = {
    name: equipmentName.trim(),
  };
  if (parentFolderId) {
    body.parentFolderId = parentFolderId;
  }

  const response = await fetch(backendUrl('/api/equipment/create-folder'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(API_CONFIG.TIMEOUT),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    if (response.status === 403) {
      throw new Error('Недостаточно прав для создания папки');
    }
    throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
  }

  const json = (await response.json()) as {
    success?: boolean;
    data?: DriveFolderResult;
    error?: string;
  };

  if (!json.success || !json.data) {
    throw new Error(json.error || 'Ошибка при создании папки: данные не получены');
  }

  return json.data;
}

/**
 * Получить список файлов из папки Google Drive
 * 
 * Загружает список всех файлов из указанной папки Google Drive
 * 
 * @param {string} folderUrl - URL папки в Google Drive
 * @returns {Promise<DriveFile[]>} Массив файлов в папке
 * 
 * @throws {Error} Если папка не найдена или произошла ошибка
 */
export async function getFolderFiles(folderUrl: string): Promise<DriveFile[]> {
  if (!folderUrl || !folderUrl.trim()) {
    throw new Error('URL папки не указан');
  }

  try {
    const url = new URL(API_CONFIG.EQUIPMENT_API_URL);
    url.searchParams.append('action', 'getFolderFiles');
    url.searchParams.append('folderUrl', folderUrl.trim());

    console.debug('📤 Запрос списка файлов:', url.toString());

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(API_CONFIG.TIMEOUT),
    });

    console.debug('📥 Ответ получен:', {
      status: response.status,
      ok: response.ok,
      statusText: response.statusText
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ HTTP ошибка:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText
      });
      
      // Создаем ошибку с информацией о статусе для лучшей диагностики
      const error: any = new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      error.status = response.status;
      error.statusText = response.statusText;
      throw error;
    }

    const data = await response.json();
    
    console.debug('📋 Данные ответа:', {
      success: data.success,
      dataLength: data.data ? data.data.length : 0,
      data: data.data
    });

    if (!data.success) {
      console.warn('⚠️ Ответ не успешен:', data);
      return [];
    }

    if (!data.data) {
      console.warn('⚠️ Данные отсутствуют в ответе');
      return [];
    }

    return data.data;
  } catch (error: any) {
    console.error('❌ Ошибка получения списка файлов:', error);
    console.error('  - URL папки:', folderUrl);
    console.error('  - Тип ошибки:', error.name);
    console.error('  - Сообщение:', error.message);
    throw error;
  }
}

