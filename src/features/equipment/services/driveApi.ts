/**
 * API для работы с Google Drive
 * 
 * Функции для создания папок и получения списка файлов
 */

import { API_CONFIG } from '../../../config/api';
import { apiRequest } from '../../../services/api/apiRequest';
import { isCorsError } from '../../../services/api/corsFallback';
import { DriveFolderResult, DriveFile } from '../../../services/api/types';

/**
 * Создать папку в Google Drive для оборудования
 * 
 * Создает новую папку в Google Drive с названием оборудования.
 * Папка будет использоваться для хранения документации и журнала обслуживания.
 * 
 * @param {string} equipmentName - Название оборудования (будет использовано как имя папки)
 * @param {string} parentFolderId - (Опционально) ID родительской папки, в которой создать папку
 * @returns {Promise<DriveFolderResult>} Объект с информацией о созданной папке
 * 
 * @throws {Error} Если не удалось создать папку
 */
export async function createDriveFolder(
  equipmentName: string,
  parentFolderId?: string
): Promise<DriveFolderResult> {
  if (!equipmentName || !equipmentName.trim()) {
    throw new Error('Название оборудования не указано');
  }

  try {
    const body: any = {
      name: equipmentName.trim()
    };
    
    if (parentFolderId) {
      body.parentFolderId = parentFolderId;
    }

    const response = await apiRequest<DriveFolderResult>('createFolder', 'POST', body);
    
    if (!response.data) {
      throw new Error('Ошибка при создании папки: данные не получены');
    }

    return response.data;
  } catch (error: any) {
    if (isCorsError(error)) {
      const postUrl = API_CONFIG.EQUIPMENT_API_URL;
      const postBody = {
        action: 'createFolder',
        name: equipmentName.trim(),
        ...(parentFolderId && { parentFolderId })
      };
      
      try {
        // Отправляем no-cors запрос
        await fetch(postUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(postBody)
        }).catch(() => {
          // Игнорируем ошибки no-cors запросов
        });
        
        // Ждем немного для обработки запроса на сервере
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Создаем специальный тип ошибки, который не является критическим
        const warningError: any = new Error('Папка может быть создана, но подтверждение недоступно из-за CORS. Проверьте Google Drive вручную или создайте папку позже.');
        warningError.isWarning = true;
        warningError.folderName = equipmentName.trim();
        throw warningError;
      } catch (fallbackError: any) {
        if (fallbackError.isWarning) {
          throw fallbackError;
        }
        throw new Error(`Ошибка при создании папки: ${fallbackError.message}`);
      }
    }
    
    throw error;
  }
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

