/**
 * API для работы с журналом обслуживания оборудования
 * 
 * Функции для получения, добавления, обновления и удаления записей
 * в журнале обслуживания через Google Apps Script API
 */

import { apiRequest } from '@/shared/services/api/apiRequest';
import { isCorsError, sendNoCorsRequest } from '@/shared/services/api/corsFallback';
import { MaintenanceEntry, MaintenanceEntryInput, MaintenanceFile } from '../types/equipment';
import { API_CONFIG } from '@/shared/config/api';
import { ApiResponse } from '@/shared/services/api/types';
import { logUserActivity } from '../../user-activity/services/activityLogsApi';

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

  // Логирование для диагностики
  console.log('📋 getMaintenanceLog вызвана:', {
    equipmentId,
    maintenanceSheetId,
    apiUrl: API_CONFIG.EQUIPMENT_API_URL,
    isProduction: import.meta.env.PROD,
    env: import.meta.env.MODE
  });

  try {
    const params: Record<string, string> = { equipmentId };
    if (maintenanceSheetId) {
      params.maintenanceSheetId = maintenanceSheetId;
    }
    
    console.log('📤 Отправка запроса getMaintenanceLog:', { params, url: API_CONFIG.EQUIPMENT_API_URL });
    
    const response = await apiRequest<MaintenanceEntry[]>(
      'getMaintenanceLog',
      'GET',
      undefined,
      params
    );
    
    console.log('📥 Получен ответ getMaintenanceLog:', {
      success: response.success,
      dataLength: response.data?.length || 0,
      error: response.error
    });
    
    const log = response.data || [];
    console.log(`✅ Загружен журнал обслуживания: ${log.length} записей для equipmentId="${equipmentId}"`);
    if (log.length === 0) {
      console.warn(`⚠️ Журнал пустой для equipmentId="${equipmentId}". Проверьте, что записи существуют в таблице.`);
      console.warn('⚠️ Возможные причины:');
      console.warn('  1. Записи отсутствуют в Google Sheets таблице');
      console.warn('  2. Неправильный equipmentId');
      console.warn('  3. Проблемы с доступом к Google Apps Script API');
      console.warn('  4. Неправильный URL API:', API_CONFIG.EQUIPMENT_API_URL);
    }
    return log;
  } catch (error: any) {
    console.error('❌ Ошибка при получении журнала обслуживания:', {
      error,
      message: error.message,
      stack: error.stack,
      equipmentId,
      maintenanceSheetId,
      apiUrl: API_CONFIG.EQUIPMENT_API_URL,
      isCorsError: isCorsError(error)
    });
    
    // Если это CORS ошибка, пробуем fallback через GET с параметрами в URL
    if (isCorsError(error)) {
      console.log('⚠️ CORS ошибка при загрузке журнала, пробуем fallback через GET...');
      try {
        // Используем прямой GET запрос с параметрами в URL
        const baseUrl = API_CONFIG.EQUIPMENT_API_URL;
        const url = new URL(baseUrl);
        url.searchParams.append('action', 'getMaintenanceLog');
        url.searchParams.append('equipmentId', equipmentId);
        if (maintenanceSheetId) {
          url.searchParams.append('maintenanceSheetId', maintenanceSheetId);
        }
        
        console.log('📤 Fallback запрос:', url.toString());
        
        // Пробуем через обычный fetch с CORS
        const response = await fetch(url.toString(), {
          method: 'GET',
          mode: 'cors',
        });
        
        console.log('📥 Fallback ответ:', {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ Fallback HTTP error:', errorText);
          throw new Error(`HTTP error! status: ${response.status}, body: ${errorText.substring(0, 200)}`);
        }
        
        const data: ApiResponse<MaintenanceEntry[]> = await response.json();
        console.log('📥 Fallback JSON ответ:', {
          success: data.success,
          dataLength: data.data?.length || 0,
          error: data.error
        });
        
        if (data.success && data.data) {
          console.log(`✅ Загружен журнал через fallback: ${data.data.length} записей`);
          return data.data;
        }
        throw new Error(data.error || 'Неизвестная ошибка');
      } catch (fallbackError: any) {
        console.error('❌ Ошибка в fallback загрузки журнала:', {
          error: fallbackError,
          message: fallbackError.message,
          stack: fallbackError.stack
        });
        // Возвращаем пустой массив вместо ошибки, чтобы не блокировать интерфейс
        console.warn('⚠️ Не удалось загрузить журнал, возвращаем пустой массив');
        console.warn('⚠️ Проверьте:');
        console.warn('  1. Переменную окружения VITE_EQUIPMENT_API_URL на Railway');
        console.warn('  2. Доступность Google Apps Script API');
        console.warn('  3. Настройки CORS в Google Apps Script');
        return [];
      }
    }
    
    console.error('❌ Критическая ошибка при получении журнала обслуживания:', error);
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

    // Логируем добавление записи ТО
    if (response.data) {
      logUserActivity(
        'maintenance_add',
        `Добавлена запись ТО: ${response.data.type} (${response.data.date})`,
        {
          entityType: 'maintenance_entry',
          entityId: response.data.id,
          metadata: {
            equipmentId,
            type: response.data.type,
            performedBy: response.data.performedBy,
          },
        }
      );
    }

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
        
        console.log('📤 Отправка no-cors запроса для добавления записи...');
        await sendNoCorsRequest('addMaintenanceEntry', fallbackData);
        console.log('✅ No-cors запрос отправлен. Ждем обработки на сервере...');
        
        // Ждем немного и проверяем, что запись добавилась
        await new Promise(resolve => setTimeout(resolve, 3000));
        console.log('⏳ Начинаем проверку добавления записи...');
        
        // Загружаем журнал заново и ищем последнюю запись
        // Делаем несколько попыток с увеличивающейся задержкой
        const maxAttempts = 8;
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
              // Нормализуем даты для сравнения (может быть разный формат)
              const normalizeDate = (dateStr: string) => {
                if (!dateStr) return '';
                // Убираем время, оставляем только дату
                return dateStr.split('T')[0].split(' ')[0];
              };
              
              const normalizedEntryDate = normalizeDate(entry.date);
              
              const newEntry = log.find(e => {
                const normalizedLogDate = normalizeDate(e.date);
                return normalizedLogDate === normalizedEntryDate && 
                       e.type === entry.type && 
                       e.description === entry.description &&
                       e.performedBy === entry.performedBy;
              });

              if (newEntry) {
                console.log('✅ Новая запись найдена в журнале (точное совпадение):', newEntry);
                // Логируем добавление записи ТО (fallback)
                logUserActivity(
                  'maintenance_add',
                  `Добавлена запись ТО: ${newEntry.type} (${newEntry.date})`,
                  {
                    entityType: 'maintenance_entry',
                    entityId: newEntry.id,
                    metadata: {
                      equipmentId,
                      type: newEntry.type,
                      performedBy: newEntry.performedBy,
                      fallback: 'no-cors',
                    },
                  }
                );
                return newEntry;
              }
              
              // Если точного совпадения нет, ищем по частичным совпадениям
              const partialMatch = log.find(e => {
                const normalizedLogDate = normalizeDate(e.date);
                return normalizedLogDate === normalizedEntryDate && 
                       e.type === entry.type &&
                       e.performedBy === entry.performedBy;
              });
              
              if (partialMatch) {
                console.log('✅ Новая запись найдена в журнале (частичное совпадение):', partialMatch);
                return partialMatch;
              }
              
              // Если частичного совпадения нет, берем первую запись (самую новую)
              // и проверяем, что она достаточно свежая (создана не более 60 секунд назад)
              const firstEntry = log[0];
              if (firstEntry.createdAt) {
                const entryCreatedAt = new Date(firstEntry.createdAt).getTime();
                const now = Date.now();
                const timeDiff = now - entryCreatedAt;
                
                if (timeDiff < 60000) { // 60 секунд
                  console.log('✅ Найдена свежая запись (создана недавно):', firstEntry);
                  return firstEntry;
                }
              }
              
              // Если createdAt нет, но дата совпадает, берем первую запись
              const normalizedFirstDate = normalizeDate(firstEntry.date);
              if (normalizedFirstDate === normalizedEntryDate) {
                console.log('✅ Найдена запись с совпадающей датой:', firstEntry);
                return firstEntry;
              }
            } else {
              console.log(`⚠️ Журнал пустой (попытка ${attempt}/${maxAttempts}). Продолжаем попытки...`);
            }
          } catch (checkError) {
            console.warn(`⚠️ Ошибка при проверке записи (попытка ${attempt}):`, checkError);
            // Продолжаем попытки
          }
        }
        
        // Если не нашли после всех попыток, создаем временную запись на основе данных формы
        // Это позволит пользователю увидеть результат сразу, а при обновлении страницы увидит реальную запись
        console.warn('⚠️ Не удалось подтвердить добавление записи после всех попыток.');
        console.log('📝 Создаем временную запись для отображения. Запись может быть добавлена на сервер.');
        const tempEntry: MaintenanceEntry = {
          id: `temp-${Date.now()}`,
          equipmentId,
          date: entry.date,
          type: entry.type,
          description: entry.description,
          performedBy: entry.performedBy,
          status: entry.status || 'completed',
          createdAt: new Date().toISOString()
        };
        console.log('✅ Возвращаем временную запись. При следующей загрузке журнала она будет заменена реальной:', tempEntry);
        return tempEntry;
      } catch (fallbackError: any) {
        console.error('Ошибка в fallback добавления записи:', fallbackError);
        
        // Если ошибка произошла при проверке записи, все равно создаем временную запись
        // Запись может быть добавлена на сервер, но мы не смогли её проверить
        if (fallbackError.message?.includes('getMaintenanceLog') || 
            fallbackError.message?.includes('загрузить журнал') ||
            fallbackError.message?.includes('CORS')) {
          console.warn('⚠️ Ошибка при проверке записи, но запрос был отправлен. Создаем временную запись.');
          const tempEntry: MaintenanceEntry = {
            id: `temp-${Date.now()}`,
            equipmentId,
            date: entry.date,
            type: entry.type,
            description: entry.description,
            performedBy: entry.performedBy,
            status: entry.status || 'completed',
            createdAt: new Date().toISOString()
          };
          console.log('✅ Возвращаем временную запись из catch блока:', tempEntry);
          return tempEntry;
        }
        
        // Для других ошибок тоже создаем временную запись
        // Запрос был отправлен, запись может быть добавлена, но мы не можем это подтвердить
        console.warn('⚠️ Неизвестная ошибка в fallback, но запрос был отправлен. Создаем временную запись.');
        const tempEntry: MaintenanceEntry = {
          id: `temp-${Date.now()}`,
          equipmentId,
          date: entry.date,
          type: entry.type,
          description: entry.description,
          performedBy: entry.performedBy,
          status: entry.status || 'completed',
          createdAt: new Date().toISOString()
        };
        console.log('✅ Возвращаем временную запись из catch блока (неизвестная ошибка):', tempEntry);
        return tempEntry;
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

    // Логируем обновление записи ТО
    if (response.data) {
      logUserActivity(
        'maintenance_update',
        `Обновлена запись ТО (ID: ${entryId.substring(0, 8)}...)`,
        {
          entityType: 'maintenance_entry',
          entityId: entryId,
          metadata: {
            updatedFields: Object.keys(entry),
          },
        }
      );
    }

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

    // Логируем удаление записи ТО
    logUserActivity(
      'maintenance_delete',
      `Удалена запись ТО (ID: ${entryId.substring(0, 8)}...)`,
      {
        entityType: 'maintenance_entry',
        entityId: entryId,
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
        // Логируем удаление записи ТО (fallback)
        logUserActivity(
          'maintenance_delete',
          `Удалена запись ТО (ID: ${entryId.substring(0, 8)}...)`,
          {
            entityType: 'maintenance_entry',
            entityId: entryId,
            metadata: {
              fallback: 'no-cors',
            },
          }
        );
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

/**
 * Конвертировать File в Base64 строку (без data:...;base64, префикса)
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Загрузить документ обслуживания в Google Drive
 *
 * @param equipmentId - ID оборудования
 * @param entryId - ID записи журнала
 * @param file - File объект для загрузки
 * @param date - Дата обслуживания (YYYY-MM-DD)
 * @returns Метаданные загруженного файла
 */
export async function uploadMaintenanceFile(
  equipmentId: string,
  entryId: string,
  file: File,
  date: string
): Promise<MaintenanceFile> {
  const base64 = await fileToBase64(file);

  const response = await apiRequest<{
    success: boolean;
    fileId: string;
    fileUrl: string;
    fileName: string;
    mimeType: string;
    size: number;
  }>(
    'uploadMaintenanceDocument',
    'POST',
    {
      action: 'uploadMaintenanceDocument',
      equipmentId,
      entryId,
      fileBase64: base64,
      mimeType: file.type || 'application/octet-stream',
      originalFileName: file.name,
      date,
    }
  );

  if (!response.data) {
    throw new Error('Не удалось загрузить файл');
  }

  return {
    id: response.data.fileId,
    name: response.data.fileName,
    url: response.data.fileUrl,
    mimeType: response.data.mimeType,
    size: response.data.size,
  };
}

/**
 * Прикрепить файлы к записи журнала обслуживания
 *
 * @param entryId - ID записи
 * @param files - Массив метаданных файлов
 * @returns Обновлённая запись
 */
export async function attachFilesToEntry(
  entryId: string,
  files: MaintenanceFile[]
): Promise<MaintenanceEntry> {
  const response = await apiRequest<MaintenanceEntry>(
    'attachFilesToEntry',
    'POST',
    {
      action: 'attachFilesToEntry',
      entryId,
      files: JSON.stringify(files),
    }
  );

  if (!response.data) {
    throw new Error('Не удалось прикрепить файлы к записи');
  }

  return response.data;
}

