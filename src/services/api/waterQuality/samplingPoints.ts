/**
 * API для работы с пунктами отбора проб
 * 
 * Этот модуль содержит все CRUD операции для управления пунктами отбора проб.
 * Использует модули cache, validators и mappers для переиспользования кода.
 */

import { supabase } from '../../../config/supabase';
import type { SamplingPoint, SamplingPointInput, CacheOptions } from '../../../types/waterQuality';

// Импортируем функции из модулей
import {
  DEFAULT_MAX_LIMIT,
  MAX_HISTORICAL_LIMIT,
  generateCacheKey,
  getCacheOptions,
  getCacheEntry,
  setCacheEntry,
  isCacheValid,
  isCacheStale,
  deduplicateRequest,
  clearWaterQualityCache,
} from './cache';
import { validateLimit, validateId } from './validators';
import { mapSamplingPointFromDb } from './mappers';

/**
 * Получить все пункты отбора проб
 * 
 * @param limit - Максимальное количество записей (по умолчанию 1000, максимум 10000)
 * @param useCache - Использовать кэш (по умолчанию true)
 * @param cacheOptions - Опции кэширования
 * @returns Массив пунктов отбора проб
 * 
 * Логика работы:
 * 1. Валидируем лимит (защита от слишком больших запросов)
 * 2. Проверяем кэш - если данные свежие, возвращаем их
 * 3. Если кэш устарел, но включен stale-while-revalidate, возвращаем старые данные и обновляем в фоне
 * 4. Иначе делаем запрос к БД с дедупликацией (если несколько компонентов запрашивают одновременно)
 */
export async function getAllSamplingPoints(
  limit: number = DEFAULT_MAX_LIMIT,
  useCache: boolean = true,
  cacheOptions?: CacheOptions
): Promise<SamplingPoint[]> {
  try {
    // Шаг 1: Валидация лимита
    // Используем функцию из validators.ts вместо дублирования кода
    const validLimit = validateLimit(limit, MAX_HISTORICAL_LIMIT);

    // Шаг 2: Получаем опции кэша с дефолтными значениями
    const cacheOpts = getCacheOptions(cacheOptions);

    // Шаг 3: Генерируем уникальный ключ кэша на основе параметров запроса
    const cacheKey = generateCacheKey('sampling_points', { limit: validLimit });
    
    // Переменная для хранения устаревших данных (stale-while-revalidate)
    let staleData: SamplingPoint[] | null = null;
    
    // Шаг 4: Проверяем кэш
    if (useCache) {
      const cached = getCacheEntry(cacheKey);
      if (cached) {
        // Если кэш валиден, возвращаем данные сразу
        if (isCacheValid(cached)) {
          return cached.data;
        }
        // Если кэш устарел, но включен stale-while-revalidate, сохраняем для возврата
        if (isCacheStale(cached)) {
          staleData = cached.data;
        }
      }
    }

    // Шаг 5: Выполняем запрос с дедупликацией
    // Если несколько компонентов запрашивают одновременно, выполнится только один запрос
    const fetchPromise = deduplicateRequest(cacheKey, async () => {
      // Запрос к Supabase
      const { data, error } = await supabase
        .from('sampling_points')
        .select('*')
        .eq('is_active', true)  // Только активные пункты
        .order('name', { ascending: true })
        .limit(validLimit);

      if (error) {
        console.error('[samplingPointsApi] Ошибка getAllSamplingPoints:', {
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint,
          },
          limit: validLimit,
        });
        throw new Error(error.message || 'Ошибка при получении пунктов отбора проб');
      }

      // Преобразуем данные из формата БД в TypeScript типы
      const result = (data || []).map(mapSamplingPointFromDb);

      // Сохраняем в кэш для следующих запросов
      if (useCache) {
        setCacheEntry(cacheKey, result, cacheOpts);
      }

      return result;
    });

    // Шаг 6: Если есть stale данные, возвращаем их немедленно, обновление в фоне
    if (staleData !== null && cacheOpts.staleWhileRevalidate) {
      // Обновляем кэш в фоне (не ждем)
      fetchPromise.catch(err => {
        console.error('[samplingPointsApi] Ошибка обновления кэша (stale-while-revalidate):', err);
      });
      return staleData;
    }

    // Иначе ждем результат запроса
    return await fetchPromise;
  } catch (error: any) {
    console.error('[samplingPointsApi] Исключение в getAllSamplingPoints:', error);
    throw error;
  }
}

/**
 * Получить пункт отбора проб по ID
 * 
 * @param id - Уникальный идентификатор пункта отбора проб
 * @returns Пункт отбора проб
 * 
 * Логика работы:
 * 1. Валидируем ID (не пустой, не undefined)
 * 2. Делаем запрос к БД с фильтром по ID
 * 3. Используем .single() для получения одной записи
 * 4. Преобразуем данные через mapper
 * 
 * Примечание: Эта функция не использует кэш, так как:
 * - Получение по ID обычно редкая операция
 * - Данные могут часто меняться
 * - Кэш для списка уже покрывает большинство случаев
 */
export async function getSamplingPointById(id: string): Promise<SamplingPoint> {
  try {
    // Шаг 1: Валидация ID
    // Используем функцию из validators.ts для единообразия
    validateId(id, 'ID пункта отбора проб');

    // Шаг 2: Запрос к Supabase
    // .single() гарантирует, что вернется одна запись или ошибка
    const { data, error } = await supabase
      .from('sampling_points')
      .select('*')
      .eq('id', id.trim())  // Обрезаем пробелы на всякий случай
      .single();

    // Шаг 3: Обработка ошибок
    if (error) {
      console.error('[samplingPointsApi] Ошибка getSamplingPointById:', {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        id: id.trim(),
      });
      throw new Error(error.message || 'Ошибка при получении пункта отбора проб');
    }

    // Шаг 4: Проверка наличия данных
    // .single() может вернуть null, если запись не найдена
    if (!data) {
      throw new Error('Пункт отбора проб не найден');
    }

    // Шаг 5: Преобразование данных и возврат
    return mapSamplingPointFromDb(data);
  } catch (error: any) {
    // Если ошибка уже обработана выше (валидация, не найдено), просто пробрасываем
    if (error.message && (
      error.message.includes('обязателен') ||
      error.message.includes('не найден')
    )) {
      throw error;
    }
    
    console.error('[samplingPointsApi] Исключение в getSamplingPointById:', {
      error: error.message || error,
      stack: error.stack,
      id,
    });
    throw error;
  }
}

/**
 * Создать новый пункт отбора проб
 * 
 * @param input - Данные для создания пункта отбора проб
 * @returns Созданный пункт отбора проб
 * 
 * Логика работы:
 * 1. Валидация обязательных полей (code, name)
 * 2. Валидация длины полей (code: 2-50, name: 2-200)
 * 3. Получение текущего пользователя для created_by
 * 4. Вставка данных в БД
 * 5. Обработка ошибок (включая дубликат кода)
 * 6. Очистка кэша списка (чтобы новые данные появились при следующем запросе)
 * 7. Преобразование и возврат результата
 */
export async function createSamplingPoint(input: SamplingPointInput): Promise<SamplingPoint> {
  try {
    // Шаг 1: Валидация обязательных полей
    if (!input.code || !input.name) {
      throw new Error('Код и название обязательны для заполнения');
    }

    // Шаг 2: Обрезка пробелов и валидация длины
    const trimmedCode = input.code.trim();
    const trimmedName = input.name.trim();

    // Валидация кода: минимум 2, максимум 50 символов
    if (trimmedCode.length < 2) {
      throw new Error('Код должен содержать минимум 2 символа');
    }
    if (trimmedCode.length > 50) {
      throw new Error('Код не должен превышать 50 символов');
    }

    // Валидация названия: минимум 2, максимум 200 символов
    if (trimmedName.length < 2) {
      throw new Error('Название должно содержать минимум 2 символа');
    }
    if (trimmedName.length > 200) {
      throw new Error('Название не должно превышать 200 символов');
    }

    // Шаг 3: Получение текущего пользователя для аудита
    const { data: { user } } = await supabase.auth.getUser();
    
    // Шаг 4: Вставка данных в БД
    const { data, error } = await supabase
      .from('sampling_points')
      .insert({
        code: trimmedCode,
        name: trimmedName,
        description: input.description?.trim() || null,
        equipment_id: input.equipmentId || null,
        location: input.location?.trim() || null,
        sampling_frequency: input.samplingFrequency || null,
        sampling_schedule: input.samplingSchedule || null,
        responsible_person: input.responsiblePerson?.trim() || null,
        is_active: input.isActive !== undefined ? input.isActive : true,
        created_by: user?.email || null,  // Сохраняем email создателя
      })
      .select('*')
      .single();

    // Шаг 5: Обработка ошибок
    if (error) {
      console.error('[samplingPointsApi] Ошибка createSamplingPoint:', {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        input: {
          code: trimmedCode,
          name: trimmedName,
          hasDescription: !!input.description,
          hasEquipmentId: !!input.equipmentId,
          hasLocation: !!input.location,
          samplingFrequency: input.samplingFrequency,
          isActive: input.isActive,
        },
      });
      
      // Специальная обработка ошибки дубликата (unique constraint violation)
      if (error.code === '23505') {
        throw new Error('Пункт отбора проб с таким кодом уже существует');
      }
      
      throw new Error(error.message || 'Ошибка при создании пункта отбора проб');
    }

    // Шаг 6: Проверка результата
    if (!data) {
      throw new Error('Не удалось создать пункт отбора проб');
    }

    // Шаг 7: Очистка кэша списка
    // После создания нового пункта кэш списка становится неактуальным
    clearWaterQualityCache('sampling_points');

    // Шаг 8: Преобразование и возврат
    return mapSamplingPointFromDb(data);
  } catch (error: any) {
    // Если ошибка уже обработана выше (валидация, дубликат), просто пробрасываем
    if (error.message && (
      error.message.includes('обязательны') ||
      error.message.includes('должен содержать') ||
      error.message.includes('не должен превышать') ||
      error.message.includes('уже существует')
    )) {
      throw error;
    }
    
    console.error('[samplingPointsApi] Исключение в createSamplingPoint:', {
      error: error.message || error,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Обновить пункт отбора проб
 * 
 * @param id - ID пункта отбора проб для обновления
 * @param input - Частичные данные для обновления (только изменяемые поля)
 * @returns Обновленный пункт отбора проб
 * 
 * Логика работы:
 * 1. Валидация ID
 * 2. Валидация полей, которые нужно обновить (если указаны)
 * 3. Получение текущего пользователя для updated_by
 * 4. Формирование объекта обновления (только указанные поля)
 * 5. Проверка, что есть хотя бы одно поле для обновления
 * 6. Обновление в БД
 * 7. Обработка ошибок (включая дубликат кода)
 * 8. Очистка кэша (список и конкретный пункт)
 * 9. Преобразование и возврат результата
 */
export async function updateSamplingPoint(
  id: string,
  input: Partial<SamplingPointInput>
): Promise<SamplingPoint> {
  try {
    // Шаг 1: Валидация ID
    validateId(id, 'ID пункта отбора проб');

    // Шаг 2: Валидация полей, которые нужно обновить
    // Проверяем только те поля, которые указаны (не undefined)
    if (input.code !== undefined) {
      const trimmedCode = input.code.trim();
      if (!trimmedCode) {
        throw new Error('Код не может быть пустым');
      }
      if (trimmedCode.length < 2) {
        throw new Error('Код должен содержать минимум 2 символа');
      }
      if (trimmedCode.length > 50) {
        throw new Error('Код не должен превышать 50 символов');
      }
    }

    if (input.name !== undefined) {
      const trimmedName = input.name.trim();
      if (!trimmedName) {
        throw new Error('Название не может быть пустым');
      }
      if (trimmedName.length < 2) {
        throw new Error('Название должно содержать минимум 2 символа');
      }
      if (trimmedName.length > 200) {
        throw new Error('Название не должно превышать 200 символов');
      }
    }

    // Шаг 3: Получение текущего пользователя для аудита
    const { data: { user } } = await supabase.auth.getUser();

    // Шаг 4: Формирование объекта обновления
    const updateData: any = {
      updated_at: new Date().toISOString(), // Явно обновляем updated_at
    };

    // Добавляем updated_by, если пользователь авторизован
    if (user?.email) {
      updateData.updated_by = user.email;
    }

    // Добавляем только те поля, которые указаны (не undefined)
    if (input.code !== undefined) updateData.code = input.code.trim();
    if (input.name !== undefined) updateData.name = input.name.trim();
    if (input.description !== undefined) updateData.description = input.description?.trim() || null;
    if (input.equipmentId !== undefined) updateData.equipment_id = input.equipmentId || null;
    if (input.location !== undefined) updateData.location = input.location?.trim() || null;
    if (input.samplingFrequency !== undefined) updateData.sampling_frequency = input.samplingFrequency || null;
    if (input.samplingSchedule !== undefined) updateData.sampling_schedule = input.samplingSchedule || null;
    if (input.responsiblePerson !== undefined) updateData.responsible_person = input.responsiblePerson?.trim() || null;
    if (input.isActive !== undefined) updateData.is_active = input.isActive;

    // Шаг 5: Проверка, что есть хотя бы одно поле для обновления (кроме служебных)
    const userFields = Object.keys(updateData).filter(key => key !== 'updated_at' && key !== 'updated_by');
    if (userFields.length === 0) {
      throw new Error('Не указаны поля для обновления');
    }

    // Шаг 6: Обновление в БД
    const { data, error } = await supabase
      .from('sampling_points')
      .update(updateData)
      .eq('id', id.trim())
      .select('*')
      .single();

    // Шаг 7: Обработка ошибок
    if (error) {
      console.error('[samplingPointsApi] Ошибка updateSamplingPoint:', {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        id: id.trim(),
        updateFields: Object.keys(updateData),
        input: {
          hasCode: input.code !== undefined,
          hasName: input.name !== undefined,
          hasDescription: input.description !== undefined,
          hasEquipmentId: input.equipmentId !== undefined,
          hasLocation: input.location !== undefined,
          samplingFrequency: input.samplingFrequency,
          isActive: input.isActive,
        },
      });
      
      // Специальная обработка ошибки дубликата
      if (error.code === '23505') {
        throw new Error('Пункт отбора проб с таким кодом уже существует');
      }
      
      throw new Error(error.message || 'Ошибка при обновлении пункта отбора проб');
    }

    // Шаг 8: Проверка результата
    if (!data) {
      throw new Error('Пункт отбора проб не найден');
    }

    // Шаг 9: Очистка кэша
    // Очищаем кэш списка и конкретного пункта
    clearWaterQualityCache('sampling_points');
    clearWaterQualityCache(`sampling_point_${id.trim()}`);

    // Шаг 10: Преобразование и возврат
    return mapSamplingPointFromDb(data);
  } catch (error: any) {
    // Если ошибка уже обработана выше, просто пробрасываем
    if (error.message && (
      error.message.includes('обязателен') ||
      error.message.includes('не может быть пустым') ||
      error.message.includes('должен содержать') ||
      error.message.includes('не должен превышать') ||
      error.message.includes('уже существует') ||
      error.message.includes('не найден') ||
      error.message.includes('поля для обновления')
    )) {
      throw error;
    }
    
    console.error('[samplingPointsApi] Исключение в updateSamplingPoint:', {
      error: error.message || error,
      stack: error.stack,
      id,
    });
    throw error;
  }
}

/**
 * Удалить пункт отбора проб
 * 
 * @param id - ID пункта отбора проб для удаления
 * @returns void
 * 
 * Логика работы:
 * 1. Валидация ID
 * 2. Удаление из БД
 * 3. Обработка ошибок (включая foreign key constraint - если пункт используется)
 * 4. Очистка кэша (список и конкретный пункт)
 * 
 * Примечание: Если пункт используется в анализах, удаление будет заблокировано БД
 * (foreign key constraint violation - error code 23503)
 */
export async function deleteSamplingPoint(id: string): Promise<void> {
  try {
    // Шаг 1: Валидация ID
    validateId(id, 'ID пункта отбора проб');

    // Шаг 2: Удаление из БД
    const { error } = await supabase
      .from('sampling_points')
      .delete()
      .eq('id', id.trim());

    // Шаг 3: Обработка ошибок
    if (error) {
      console.error('[samplingPointsApi] Ошибка deleteSamplingPoint:', {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        id: id.trim(),
      });
      
      // Специальная обработка ошибки foreign key constraint
      // Это означает, что пункт используется в других таблицах (например, в анализах)
      if (error.code === '23503') {
        throw new Error('Невозможно удалить пункт отбора проб: он используется в анализах');
      }
      
      throw new Error(error.message || 'Ошибка при удалении пункта отбора проб');
    }

    // Шаг 4: Очистка кэша
    // Очищаем кэш списка и конкретного пункта
    clearWaterQualityCache('sampling_points');
    clearWaterQualityCache(`sampling_point_${id.trim()}`);
  } catch (error: any) {
    // Если ошибка уже обработана выше, просто пробрасываем
    if (error.message && (
      error.message.includes('обязателен') ||
      error.message.includes('используется')
    )) {
      throw error;
    }
    
    console.error('[samplingPointsApi] Исключение в deleteSamplingPoint:', {
      error: error.message || error,
      stack: error.stack,
      id,
    });
    throw error;
  }
}
