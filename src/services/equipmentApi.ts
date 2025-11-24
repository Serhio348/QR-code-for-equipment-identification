/**
 * API клиент для работы с базой данных оборудования
 * 
 * Предоставляет функции для взаимодействия с Google Apps Script API
 * Все функции возвращают промисы и обрабатывают ошибки
 */

import { API_CONFIG } from '../config/api';
import { Equipment, EquipmentType, ApiResponse } from '../types/equipment';

/**
 * Базовый запрос к API
 * 
 * Выполняет HTTP запрос к Google Apps Script веб-приложению
 * 
 * @param {string} action - Действие для выполнения (getAll, getById, getByType, add, update, delete)
 * @param {string} method - HTTP метод ('GET' или 'POST')
 * @param {any} body - Тело запроса для POST запросов
 * @returns {Promise<ApiResponse<T>>} Ответ API
 * 
 * @throws {Error} Если URL не настроен или произошла ошибка сети
 */
async function apiRequest<T>(
  action: string,
  method: 'GET' | 'POST' = 'GET',
  body?: any
): Promise<ApiResponse<T>> {
  // Проверяем, что URL настроен
  if (!API_CONFIG.EQUIPMENT_API_URL) {
    throw new Error('EQUIPMENT_API_URL не настроен. Проверьте src/config/api.ts');
  }

  // Создаем URL с параметром action для GET запросов
  const url = new URL(API_CONFIG.EQUIPMENT_API_URL);
  if (method === 'GET') {
    url.searchParams.append('action', action);
  }

  // Настройки запроса
  const options: RequestInit = {
    method,
    mode: 'cors', // Явно указываем CORS режим
    signal: AbortSignal.timeout(API_CONFIG.TIMEOUT), // Таймаут запроса
  };

  // Для POST запросов добавляем заголовки и тело
  if (method === 'POST') {
    options.headers = {
      'Content-Type': 'application/json',
    };
    if (body) {
      // Добавляем action в тело запроса для POST
      const postBody = {
        action: action,
        ...body
      };
      options.body = JSON.stringify(postBody);
    }
  }
  // Для GET запросов не добавляем заголовки, чтобы избежать preflight

  try {
    // Выполняем запрос
    const response = await fetch(url.toString(), options);

    // Проверяем статус ответа
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }

    // Парсим JSON ответ
    const data: ApiResponse<T> = await response.json();

    // Проверяем успешность операции
    if (!data.success) {
      throw new Error(data.error || 'Неизвестная ошибка');
    }

    return data;
  } catch (error: any) {
    // Проверяем, является ли это CORS ошибкой для POST запросов
    const isCorsError = error.name === 'TypeError' && 
                       (error.message.includes('fetch') || 
                        error.message.includes('Failed to fetch') ||
                        error.message.includes('CORS'));
    
    // Логируем ошибки только если это не CORS ошибка для POST (она будет обработана в fallback)
    if (!(isCorsError && method === 'POST')) {
      console.error('API request error:', {
        url: url.toString(),
        method,
        action,
        error: error.message,
        stack: error.stack
      });
    }
    
    // Улучшенные сообщения об ошибках
    if (isCorsError && method === 'GET') {
      throw new Error(`Не удалось подключиться к API. Проверьте:\n1. URL в src/config/api.ts\n2. Доступность интернета\n3. Настройки CORS в Google Apps Script\n\nURL: ${API_CONFIG.EQUIPMENT_API_URL}`);
    }
    
    // Пробрасываем ошибку дальше
    throw error;
  }
}

/**
 * Получить все оборудование
 * 
 * Загружает все записи оборудования из базы данных
 * 
 * @returns {Promise<Equipment[]>} Массив всего оборудования
 * 
 * @throws {Error} При ошибке сети или API
 * 
 * Пример использования:
 * const equipment = await getAllEquipment();
 * console.log(equipment); // [{ id: '...', name: '...', ... }, ...]
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
 * @returns {Promise<Equipment | null>} Объект Equipment или null, если не найдено
 * 
 * @throws {Error} При ошибке сети или API
 * 
 * Пример использования:
 * const equipment = await getEquipmentById('550e8400-e29b-41d4-a716-446655440000');
 */
export async function getEquipmentById(id: string): Promise<Equipment | null> {
  if (!id) {
    throw new Error('ID не указан');
  }

  const url = new URL(API_CONFIG.EQUIPMENT_API_URL);
  url.searchParams.append('action', 'getById');
  url.searchParams.append('id', id);

  try {
    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(API_CONFIG.TIMEOUT),
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
 * Фильтрует оборудование по типу (filter, pump, tank, valve, other)
 * 
 * @param {EquipmentType} type - Тип оборудования для фильтрации
 * @returns {Promise<Equipment[]>} Массив оборудования указанного типа
 * 
 * @throws {Error} При ошибке сети или API
 * 
 * Пример использования:
 * const filters = await getEquipmentByType('filter');
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

/**
 * Добавить новое оборудование
 * 
 * Создает новую запись оборудования в базе данных
 * Автоматически генерирует ID и временные метки
 * 
 * @param {Omit<Equipment, 'id' | 'createdAt' | 'updatedAt'>} equipment - Данные нового оборудования
 * @returns {Promise<Equipment>} Созданный объект Equipment с присвоенным ID
 * 
 * @throws {Error} При ошибке валидации, сети или API
 * 
 * Пример использования:
 * const newEquipment = await addEquipment({
 *   name: 'Фильтр №1',
 *   type: 'filter',
 *   specs: { height: '1,5 м', diameter: '0,8 м' },
 *   googleDriveUrl: 'https://...',
 *   qrCodeUrl: 'https://...',
 *   status: 'active'
 * });
 */
export async function addEquipment(
  equipment: Omit<Equipment, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Equipment> {
  // Валидация обязательных полей
  if (!equipment.name) {
    throw new Error('Название оборудования обязательно');
  }
  if (!equipment.type) {
    throw new Error('Тип оборудования обязателен');
  }

  try {
    // Логируем данные перед отправкой для отладки
    console.log('📤 Отправка данных оборудования:', {
      name: equipment.name,
      type: equipment.type,
      status: equipment.status,
      hasSpecs: !!equipment.specs,
      googleDriveUrl: equipment.googleDriveUrl || 'не указан',
      qrCodeUrl: equipment.qrCodeUrl || 'не указан'
    });
    
    // Пытаемся отправить POST запрос
    const response = await apiRequest<Equipment>('add', 'POST', equipment);
    
    if (!response.data) {
      throw new Error('Ошибка при добавлении оборудования: данные не получены');
    }

    return response.data;
  } catch (error: any) {
    // Если CORS ошибка, используем обходной путь через GET
    const isCorsError = error.name === 'TypeError' && 
                       (error.message && (error.message.includes('CORS') || error.message.includes('Failed to fetch')));
    
    if (isCorsError) {
      // Отправляем POST без чтения ответа (no-cors)
      const postUrl = API_CONFIG.EQUIPMENT_API_URL;
      const postBody = {
        action: 'add',
        ...equipment
      };
      
      // Логируем тело запроса для отладки
      console.log('📤 Отправка через no-cors fallback:', {
        action: postBody.action,
        name: postBody.name,
        type: postBody.type,
        bodyString: JSON.stringify(postBody)
      });
      
      try {
        // no-cors запросы всегда показывают ошибки в консоли, но это нормально
        // Подавляем ошибки через try-catch
        await fetch(postUrl, {
          method: 'POST',
          mode: 'no-cors', // Обход CORS
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(postBody)
        }).catch(() => {
          // Игнорируем ошибки no-cors запросов, они ожидаемы
        });
        
        // Ждем немного, чтобы запрос обработался, и делаем несколько попыток
        let added: Equipment | undefined;
        const maxAttempts = 3;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          // Увеличиваем время ожидания с каждой попыткой
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          
          // Получаем все оборудование и ищем последнее добавленное
          const allEquipment = await getAllEquipment();
          added = allEquipment.find(eq => 
            eq.name === equipment.name && 
            eq.type === equipment.type &&
            eq.status === equipment.status
          );
          
          if (added) {
            return added;
          }
        }
        
        // Если после всех попыток не найдено, все равно считаем успешным
        // (запрос был отправлен, возможно просто задержка на сервере)
        throw new Error('Оборудование не найдено после добавления, но запрос был отправлен');
      } catch (fallbackError: any) {
        throw new Error(`Ошибка при добавлении оборудования: ${fallbackError.message}`);
      }
    }
    
    // Если не CORS ошибка, пробрасываем дальше
    throw error;
  }
}

/**
 * Обновить оборудование
 * 
 * Обновляет существующее оборудование в базе данных
 * Обновляет только переданные поля, остальные остаются без изменений
 * Автоматически обновляет поле updatedAt
 * 
 * @param {string} id - UUID оборудования для обновления
 * @param {Partial<Equipment>} updates - Объект с полями для обновления
 * @returns {Promise<Equipment>} Обновленный объект Equipment
 * 
 * @throws {Error} Если оборудование не найдено или произошла ошибка
 * 
 * Пример использования:
 * const updated = await updateEquipment('uuid', {
 *   name: 'Новое название',
 *   lastMaintenanceDate: '2024-01-25'
 * });
 */
export async function updateEquipment(
  id: string,
  updates: Partial<Equipment>
): Promise<Equipment> {
  if (!id) {
    throw new Error('ID не указан');
  }

  try {
    const response = await apiRequest<Equipment>('update', 'POST', {
      id,
      ...updates,
    });

    if (!response.data) {
      throw new Error('Ошибка при обновлении оборудования: данные не получены');
    }

    return response.data;
  } catch (error: any) {
    // Если CORS ошибка, используем обходной путь
    const isCorsError = error.name === 'TypeError' && 
                       (error.message && (error.message.includes('CORS') || error.message.includes('Failed to fetch')));
    
    if (isCorsError) {
      const postUrl = API_CONFIG.EQUIPMENT_API_URL;
      const postBody = {
        action: 'update',
        id,
        ...updates
      };
      
      try {
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
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Получаем обновленное оборудование по ID
        const updated = await getEquipmentById(id);
        if (updated) {
          return updated;
        }
        
        throw new Error('Оборудование не найдено после обновления');
      } catch (fallbackError: any) {
        throw new Error(`Ошибка при обновлении оборудования: ${fallbackError.message}`);
      }
    }
    
    throw error;
  }
}

/**
 * Удалить оборудование (архивировать)
 * 
 * Выполняет мягкое удаление - меняет статус на 'archived'
 * Данные остаются в базе, но помечаются как архивные
 * 
 * @param {string} id - UUID оборудования для удаления
 * @returns {Promise<void>}
 * 
 * @throws {Error} Если оборудование не найдено или произошла ошибка
 * 
 * Пример использования:
 * await deleteEquipment('uuid');
 */
export async function deleteEquipment(id: string): Promise<void> {
  if (!id) {
    throw new Error('ID не указан');
  }

  try {
    await apiRequest('delete', 'POST', { id });
  } catch (error: any) {
    // Если CORS ошибка, используем обходной путь
    const isCorsError = error.name === 'TypeError' && 
                       (error.message && (error.message.includes('CORS') || error.message.includes('Failed to fetch')));
    
    if (isCorsError) {
      const postUrl = API_CONFIG.EQUIPMENT_API_URL;
      const postBody = {
        action: 'delete',
        id
      };
      
      try {
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
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Проверяем, что оборудование удалено (статус = archived)
        const deleted = await getEquipmentById(id);
        if (deleted && deleted.status === 'archived') {
          return;
        }
        
        throw new Error('Оборудование не было удалено');
      } catch (fallbackError: any) {
        throw new Error(`Ошибка при удалении оборудования: ${fallbackError.message}`);
      }
    }
    
    throw error;
  }
}

/**
 * Интерфейс результата создания папки в Google Drive
 */
export interface DriveFolderResult {
  folderId: string;
  folderUrl: string;
  folderName: string;
}

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
 * 
 * Пример использования:
 * const folder = await createDriveFolder("Фильтр обезжелезивания ФО-0,8-1,5 №1");
 * console.log(folder.folderUrl); // URL созданной папки
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
    
    // Добавляем parentFolderId если указан
    if (parentFolderId) {
      body.parentFolderId = parentFolderId;
    }

    const response = await apiRequest<DriveFolderResult>('createFolder', 'POST', body);
    
    if (!response.data) {
      throw new Error('Ошибка при создании папки: данные не получены');
    }

    return response.data;
  } catch (error: any) {
    // Если CORS ошибка, используем обходной путь
    const isCorsError = error.name === 'TypeError' && 
                       (error.message && (error.message.includes('CORS') || error.message.includes('Failed to fetch')));
    
    if (isCorsError) {
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
        
        // Пытаемся найти созданную папку через поиск в Google Drive
        // К сожалению, это невозможно без доступа к Drive API с клиента
        // Поэтому просто предполагаем, что папка была создана
        
        // Создаем специальный тип ошибки, который не является критическим
        const warningError: any = new Error('Папка может быть создана, но подтверждение недоступно из-за CORS. Проверьте Google Drive вручную или создайте папку позже.');
        warningError.isWarning = true; // Флаг для отличия от критических ошибок
        warningError.folderName = equipmentName.trim();
        throw warningError;
      } catch (fallbackError: any) {
        // Если это наше предупреждение, пробрасываем его как есть
        if (fallbackError.isWarning) {
          throw fallbackError;
        }
        throw new Error(`Ошибка при создании папки: ${fallbackError.message}`);
      }
    }
    
    throw error;
  }
}

