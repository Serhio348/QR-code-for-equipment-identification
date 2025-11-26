/**
 * API для работы с журналом обслуживания оборудования
 * 
 * Функции для получения, добавления, обновления и удаления записей
 * в журнале обслуживания через Google Apps Script API
 */

import { apiRequest } from './apiRequest';
import { isCorsError, sendNoCorsRequest } from './corsFallback';
import { MaintenanceEntry, MaintenanceEntryInput } from '../../types/equipment';

/**
 * Получить журнал обслуживания для оборудования
 * 
 * Загружает все записи журнала обслуживания для указанного оборудования
 * из таблицы "Журнал обслуживания" в Google Sheets.
 * Если указан maintenanceSheetId, загружает общий журнал для нескольких единиц оборудования.
 * 
 * @param {string} equipmentId - ID оборудования
 * @param {string} [maintenanceSheetId] - Опциональный ID общего журнала обслуживания (для нескольких единиц оборудования)
 * @returns {Promise<MaintenanceEntry[]>} Массив записей журнала обслуживания
 * 
 * @throws {Error} Если не удалось загрузить журнал
 * 
 * @example
 * // Обычный журнал для одного оборудования
 * const log = await getMaintenanceLog('equipment-123');
 * 
 * // Общий журнал для нескольких единиц оборудования
 * const sharedLog = await getMaintenanceLog('equipment-123', 'shared-sheet-id');
 */
export async function getMaintenanceLog(
  equipmentId: string,
  maintenanceSheetId?: string
): Promise<MaintenanceEntry[]> {
  if (!equipmentId) {
    throw new Error('ID оборудования не указан');
  }

  try {
    const params: Record<string, string> = { equipmentId };
    if (maintenanceSheetId) {
      params.maintenanceSheetId = maintenanceSheetId;
    }
    
    const response = await apiRequest<MaintenanceEntry[]>(
      'getMaintenanceLog',
      'GET',
      undefined,
      params
    );
    return response.data || [];
  } catch (error: any) {
    console.error('Ошибка при получении журнала обслуживания:', error);
    throw new Error(`Не удалось загрузить журнал обслуживания: ${error.message || 'Неизвестная ошибка'}`);
  }
}

/**
 * Добавить запись в журнал обслуживания
 * 
 * Создает новую запись в журнале обслуживания для указанного оборудования.
 * Если указан maintenanceSheetId, добавляет запись в общий журнал для нескольких единиц оборудования.
 * 
 * @param {string} equipmentId - ID оборудования
 * @param {MaintenanceEntryInput} entry - Данные новой записи
 * @param {string} [maintenanceSheetId] - Опциональный ID общего журнала обслуживания
 * @returns {Promise<MaintenanceEntry>} Созданная запись
 * 
 * @throws {Error} Если не удалось добавить запись
 * 
 * @example
 * const newEntry = await addMaintenanceEntry('equipment-123', {
 *   date: '2024-01-15',
 *   type: 'Промывка',
 *   description: 'Проведена промывка фильтра',
 *   performedBy: 'Иванов И.И.',
 *   status: 'completed'
 * });
 */
export async function addMaintenanceEntry(
  equipmentId: string,
  entry: MaintenanceEntryInput,
  maintenanceSheetId?: string
): Promise<MaintenanceEntry> {
  if (!equipmentId) {
    throw new Error('ID оборудования не указан');
  }

  if (!entry.date || !entry.type || !entry.description || !entry.performedBy) {
    throw new Error('Не все обязательные поля заполнены');
  }

  try {
    const requestData: any = {
      action: 'addMaintenanceEntry',
      equipmentId,
      ...entry
    };
    
    if (maintenanceSheetId) {
      requestData.maintenanceSheetId = maintenanceSheetId;
    }
    
    const response = await apiRequest<MaintenanceEntry>(
      'addMaintenanceEntry',
      'POST',
      requestData
    );
    return response.data!;
  } catch (error: any) {
    // Если это CORS ошибка, пробуем fallback механизм
    if (isCorsError(error)) {
      console.log('⚠️ CORS ошибка при добавлении записи, пробуем fallback...');
      try {
        // Отправляем через no-cors режим
        const fallbackData: any = {
          equipmentId,
          ...entry
        };
        
        if (maintenanceSheetId) {
          fallbackData.maintenanceSheetId = maintenanceSheetId;
        }
        
        await sendNoCorsRequest('addMaintenanceEntry', fallbackData);
        
        // Ждем немного и проверяем, что запись добавилась
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Загружаем журнал заново и ищем последнюю запись
        // Делаем несколько попыток с увеличивающейся задержкой
        const maxAttempts = 5;
        const initialDelay = 2000;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          const delay = initialDelay * attempt;
          console.log(`⏳ Попытка ${attempt}/${maxAttempts} проверки добавления записи (задержка ${delay}ms)...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          
          try {
            // Используем прямой вызов API, чтобы избежать циклической зависимости
            const logParams: Record<string, string> = { equipmentId };
            if (maintenanceSheetId) {
              logParams.maintenanceSheetId = maintenanceSheetId;
            }
            
            const logResponse = await apiRequest<MaintenanceEntry[]>(
              'getMaintenanceLog',
              'GET',
              undefined,
              logParams
            );
            const log = logResponse.data || [];
            
            console.log(`📋 Загружено записей в журнале: ${log.length}`);
            
            if (log.length > 0) {
              // Ищем запись по дате, типу и описанию (более точное совпадение)
              const newEntry = log.find(e => 
                e.date === entry.date && 
                e.type === entry.type && 
                e.description === entry.description &&
                e.performedBy === entry.performedBy
              );
              
              if (newEntry) {
                console.log('✅ Новая запись найдена в журнале:', newEntry);
                return newEntry;
              }
              
              // Если точного совпадения нет, берем первую запись (самую новую)
              // и проверяем, что она достаточно свежая (создана не более 30 секунд назад)
              const firstEntry = log[0];
              const entryCreatedAt = new Date(firstEntry.createdAt).getTime();
              const now = Date.now();
              const timeDiff = now - entryCreatedAt;
              
              if (timeDiff < 30000) { // 30 секунд
                console.log('✅ Найдена свежая запись (создана недавно):', firstEntry);
                return firstEntry;
              }
            }
          } catch (checkError) {
            console.warn(`⚠️ Ошибка при проверке записи (попытка ${attempt}):`, checkError);
            // Продолжаем попытки
          }
        }
        
        // Если не нашли после всех попыток, все равно считаем успешным
        // (запись может быть добавлена, но мы не смогли её найти)
        console.warn('⚠️ Не удалось подтвердить добавление записи после всех попыток. Запись может быть добавлена.');
        throw new Error('Запись может быть добавлена, но не удалось подтвердить. Обновите страницу для проверки.');
      } catch (fallbackError: any) {
        console.error('Ошибка в fallback добавления записи:', fallbackError);
        throw new Error(`Не удалось добавить запись в журнал: ${fallbackError.message || 'Ошибка CORS и fallback не помог'}`);
      }
    }
    
    console.error('Ошибка при добавлении записи в журнал:', error);
    throw new Error(`Не удалось добавить запись в журнал: ${error.message || 'Неизвестная ошибка'}`);
  }
}

/**
 * Обновить запись в журнале обслуживания
 * 
 * Обновляет существующую запись в журнале обслуживания
 * 
 * @param {string} entryId - ID записи
 * @param {Partial<MaintenanceEntryInput>} entry - Новые данные записи (можно указать только изменяемые поля)
 * @returns {Promise<MaintenanceEntry>} Обновленная запись
 * 
 * @throws {Error} Если не удалось обновить запись
 * 
 * @example
 * const updated = await updateMaintenanceEntry('entry-123', {
 *   description: 'Обновленное описание',
 *   status: 'completed'
 * });
 */
export async function updateMaintenanceEntry(
  entryId: string,
  entry: Partial<MaintenanceEntryInput>
): Promise<MaintenanceEntry> {
  if (!entryId) {
    throw new Error('ID записи не указан');
  }

  try {
    const response = await apiRequest<MaintenanceEntry>(
      'updateMaintenanceEntry',
      'POST',
      {
        action: 'updateMaintenanceEntry',
        entryId,
        ...entry
      }
    );
    return response.data!;
  } catch (error: any) {
    // Если это CORS ошибка, пробуем fallback механизм
    if (isCorsError(error)) {
      console.log('⚠️ CORS ошибка при обновлении записи, пробуем fallback...');
      try {
        await sendNoCorsRequest('updateMaintenanceEntry', {
          entryId,
          ...entry
        });
        // Ждем и загружаем обновленную запись
        await new Promise(resolve => setTimeout(resolve, 2000));
        // Для обновления нужно знать equipmentId, но у нас его нет
        // Поэтому просто возвращаем успех
        throw new Error('Обновление через fallback требует дополнительной проверки. Попробуйте обновить страницу.');
      } catch (fallbackError: any) {
        console.error('Ошибка в fallback обновления записи:', fallbackError);
        throw new Error(`Не удалось обновить запись: ${fallbackError.message || 'Ошибка CORS и fallback не помог'}`);
      }
    }
    
    console.error('Ошибка при обновлении записи в журнале:', error);
    throw new Error(`Не удалось обновить запись: ${error.message || 'Неизвестная ошибка'}`);
  }
}

/**
 * Удалить запись из журнала обслуживания
 * 
 * Удаляет запись из журнала обслуживания по ID
 * 
 * @param {string} entryId - ID записи
 * @returns {Promise<{ success: boolean; message: string }>} Результат удаления
 * 
 * @throws {Error} Если не удалось удалить запись
 * 
 * @example
 * await deleteMaintenanceEntry('entry-123');
 */
export async function deleteMaintenanceEntry(
  entryId: string
): Promise<{ success: boolean; message: string }> {
  if (!entryId) {
    throw new Error('ID записи не указан');
  }

  try {
    const response = await apiRequest<{ success: boolean; message: string }>(
      'deleteMaintenanceEntry',
      'POST',
      {
        action: 'deleteMaintenanceEntry',
        entryId
      }
    );
    return response.data || { success: true, message: 'Запись удалена' };
  } catch (error: any) {
    // Если это CORS ошибка, пробуем fallback механизм
    if (isCorsError(error)) {
      console.log('⚠️ CORS ошибка при удалении записи, пробуем fallback...');
      try {
        await sendNoCorsRequest('deleteMaintenanceEntry', { entryId });
        // Ждем немного для обработки на сервере
        await new Promise(resolve => setTimeout(resolve, 1500));
        return { success: true, message: 'Запись может быть удалена. Обновите страницу для проверки.' };
      } catch (fallbackError: any) {
        console.error('Ошибка в fallback удаления записи:', fallbackError);
        throw new Error(`Не удалось удалить запись: ${fallbackError.message || 'Ошибка CORS и fallback не помог'}`);
      }
    }
    
    console.error('Ошибка при удалении записи из журнала:', error);
    throw new Error(`Не удалось удалить запись: ${error.message || 'Неизвестная ошибка'}`);
  }
}

