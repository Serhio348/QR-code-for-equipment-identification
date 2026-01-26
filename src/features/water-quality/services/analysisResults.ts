/**
 * API для работы с результатами измерений
 * 
 * Этот модуль содержит CRUD операции для управления результатами измерений качества воды.
 * Использует модули cache, validators и mappers для переиспользования кода.
 */

import { supabase } from '../../../shared/config/supabase';
import type {
  AnalysisResult,
  AnalysisResultInput,
  PaginationOptions,
  PaginatedResponse,
  AnalysisResultsFilter,
} from '@/features/water-quality/types/waterQuality';

// Импортируем функции из модулей
import { clearWaterQualityCache } from './cache';
import { validateId } from './validators';
import { mapAnalysisResultFromDb } from './mappers';

/**
 * Получить результаты анализа с пагинацией и фильтрами
 * 
 * @param analysisId - ID анализа
 * @param options - Опции пагинации и фильтры
 * @returns Пагинированный ответ с результатами
 * 
 * Логика работы:
 * 1. Валидация ID анализа
 * 2. Валидация параметров пагинации (limit, offset)
 * 3. Построение запроса с фильтрами (parameterName, minValue, maxValue)
 * 4. Выполнение запроса с подсчетом общего количества
 * 5. Преобразование данных и возврат пагинированного ответа
 */
export async function getAnalysisResults(
  analysisId: string,
  options?: PaginationOptions & { filter?: AnalysisResultsFilter }
): Promise<PaginatedResponse<AnalysisResult>> {
  try {
    // Шаг 1: Валидация ID анализа
    validateId(analysisId, 'ID анализа');

    // Шаг 2: Получение параметров пагинации с дефолтными значениями
    const {
      limit = 100,
      offset = 0,
      filter,
    } = options || {};

    // Валидация параметров пагинации
    if (limit < 1 || limit > 1000) {
      throw new Error('Лимит должен быть от 1 до 1000');
    }

    if (offset < 0) {
      throw new Error('Смещение не может быть отрицательным');
    }

    // Шаг 3: Построение запроса с подсчетом общего количества
    // count: 'exact' - точный подсчет всех записей (для пагинации)
    let query = supabase
      .from('analysis_results')
      .select('*', { count: 'exact' })
      .eq('analysis_id', analysisId.trim())
      .order('parameter_name', { ascending: true })
      .range(offset, offset + limit - 1);  // Пагинация: от offset до offset + limit - 1

    // Шаг 4: Применение фильтров (если указаны)
    if (filter?.parameterName) {
      query = query.eq('parameter_name', filter.parameterName);
    }

    if (filter?.minValue !== undefined) {
      query = query.gte('value', filter.minValue);  // >= minValue
    }

    if (filter?.maxValue !== undefined) {
      query = query.lte('value', filter.maxValue);  // <= maxValue
    }

    // Шаг 5: Выполнение запроса
    const { data, error, count } = await query;

    if (error) {
      console.error('[analysisResultsApi] Ошибка getAnalysisResults:', {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        analysisId: analysisId.trim(),
        options,
      });
      throw new Error(error.message || 'Ошибка при получении результатов');
    }

    // Шаг 6: Формирование пагинированного ответа
    return {
      data: (data || []).map(mapAnalysisResultFromDb),
      total: count || 0,
      limit,
      offset,
      hasMore: (count || 0) > offset + limit,  // Есть ли еще данные
    };
  } catch (error: any) {
    // Если ошибка уже обработана выше, просто пробрасываем
    if (error.message && (
      error.message.includes('обязателен') ||
      error.message.includes('должен быть') ||
      error.message.includes('не может быть')
    )) {
      throw error;
    }
    
    console.error('[analysisResultsApi] Исключение в getAnalysisResults:', {
      error: error.message || error,
      stack: error.stack,
      analysisId,
    });
    throw error;
  }
}

/**
 * Получить все результаты анализа (без пагинации, для обратной совместимости)
 * 
 * @deprecated Используйте getAnalysisResults с пагинацией
 * @param analysisId - ID анализа
 * @returns Массив всех результатов
 */
export async function getAllAnalysisResults(analysisId: string): Promise<AnalysisResult[]> {
  try {
    // Используем новую функцию с максимальным лимитом
    const result = await getAnalysisResults(analysisId, { limit: 1000, offset: 0 });
    return result.data;
  } catch (error: any) {
    console.error('[analysisResultsApi] Ошибка getAllAnalysisResults:', error);
    throw error;
  }
}

/**
 * Создать результат измерения
 * 
 * @param input - Данные для создания результата измерения
 * @returns Созданный результат измерения
 * 
 * Логика работы:
 * 1. Валидация обязательных полей (analysisId, parameterName, parameterLabel, value, unit)
 * 2. Валидация типов и значений (value - число >= 0, detectionLimit - число >= 0)
 * 3. Вставка данных в БД
 * 4. Обработка ошибок (включая дубликат параметра)
 * 5. Очистка кэша результатов
 * 6. Преобразование и возврат результата
 */
export async function createAnalysisResult(input: AnalysisResultInput): Promise<AnalysisResult> {
  try {
    // Шаг 1: Валидация обязательных полей
    validateId(input.analysisId, 'ID анализа');

    if (!input.parameterName) {
      throw new Error('Параметр измерения обязателен для заполнения');
    }

    if (!input.parameterLabel || !input.parameterLabel.trim()) {
      throw new Error('Название параметра обязательно для заполнения');
    }

    const trimmedLabel = input.parameterLabel.trim();
    if (trimmedLabel.length < 2) {
      throw new Error('Название параметра должно содержать минимум 2 символа');
    }

    // Шаг 2: Валидация значения измерения
    if (input.value === undefined || input.value === null) {
      throw new Error('Значение измерения обязательно для заполнения');
    }

    if (typeof input.value !== 'number' || isNaN(input.value)) {
      throw new Error('Значение измерения должно быть числом');
    }

    if (input.value < 0) {
      throw new Error('Значение измерения не может быть отрицательным');
    }

    // Валидация единицы измерения
    if (!input.unit || !input.unit.trim()) {
      throw new Error('Единица измерения обязательна для заполнения');
    }

    // Валидация detectionLimit, если указан
    if (input.detectionLimit !== undefined && input.detectionLimit !== null) {
      if (typeof input.detectionLimit !== 'number' || isNaN(input.detectionLimit)) {
        throw new Error('Предел обнаружения должен быть числом');
      }
      if (input.detectionLimit < 0) {
        throw new Error('Предел обнаружения не может быть отрицательным');
      }
    }

    // Шаг 3: Вставка данных в БД
    const { data, error } = await supabase
      .from('analysis_results')
      .insert({
        analysis_id: input.analysisId.trim(),
        parameter_name: input.parameterName,
        parameter_label: trimmedLabel,
        value: input.value,
        unit: input.unit.trim(),
        method: input.method?.trim() || null,
        detection_limit: input.detectionLimit || null,
      })
      .select('*')
      .single();

    // Шаг 4: Обработка ошибок
    if (error) {
      console.error('[analysisResultsApi] Ошибка createAnalysisResult:', {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        input: {
          analysisId: input.analysisId,
          parameterName: input.parameterName,
          parameterLabel: trimmedLabel,
          value: input.value,
          unit: input.unit,
          hasMethod: !!input.method,
          detectionLimit: input.detectionLimit,
        },
      });
      
      // Специальная обработка ошибки дубликата
      // Один анализ не может иметь два результата для одного параметра
      if (error.code === '23505') {
        throw new Error('Результат для этого параметра уже существует');
      }
      
      throw new Error(error.message || 'Ошибка при создании результата');
    }

    // Шаг 5: Проверка результата
    if (!data) {
      throw new Error('Не удалось создать результат');
    }

    // Шаг 6: Очистка кэша
    // Очищаем кэш результатов для этого анализа
    clearWaterQualityCache('analysis_results');
    clearWaterQualityCache(`analysis_results_${input.analysisId.trim()}`);

    // Шаг 7: Преобразование и возврат
    return mapAnalysisResultFromDb(data);
  } catch (error: any) {
    // Если ошибка уже обработана выше, просто пробрасываем
    if (error.message && (
      error.message.includes('обязателен') ||
      error.message.includes('обязательна') ||
      error.message.includes('обязательно') ||
      error.message.includes('должно быть') ||
      error.message.includes('не может быть') ||
      error.message.includes('уже существует') ||
      error.message.includes('не удалось создать')
    )) {
      throw error;
    }
    
    console.error('[analysisResultsApi] Исключение в createAnalysisResult:', {
      error: error.message || error,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Обновить результат измерения
 * 
 * @param id - ID результата измерения
 * @param input - Частичные данные для обновления
 * @returns Обновленный результат измерения
 * 
 * Логика работы:
 * 1. Валидация ID
 * 2. Валидация полей, которые нужно обновить (если указаны)
 * 3. Формирование объекта обновления (только указанные поля)
 * 4. Проверка, что есть хотя бы одно поле для обновления
 * 5. Обновление в БД
 * 6. Обработка ошибок
 * 7. Очистка кэша
 * 8. Преобразование и возврат результата
 * 
 * Примечание: analysisId и parameterName нельзя изменить после создания
 * (они исключены из типа через Omit)
 */
export async function updateAnalysisResult(
  id: string,
  input: Partial<Omit<AnalysisResultInput, 'analysisId' | 'parameterName'>>
): Promise<AnalysisResult> {
  try {
    // Шаг 1: Валидация ID
    validateId(id, 'ID результата');

    // Шаг 2: Валидация полей, которые нужно обновить
    if (input.parameterLabel !== undefined) {
      const trimmedLabel = input.parameterLabel.trim();
      if (!trimmedLabel) {
        throw new Error('Название параметра не может быть пустым');
      }
      if (trimmedLabel.length < 2) {
        throw new Error('Название параметра должно содержать минимум 2 символа');
      }
    }

    if (input.value !== undefined) {
      if (typeof input.value !== 'number' || isNaN(input.value)) {
        throw new Error('Значение измерения должно быть числом');
      }
      if (input.value < 0) {
        throw new Error('Значение измерения не может быть отрицательным');
      }
    }

    if (input.unit !== undefined && !input.unit.trim()) {
      throw new Error('Единица измерения не может быть пустой');
    }

    if (input.detectionLimit !== undefined && input.detectionLimit !== null) {
      if (typeof input.detectionLimit !== 'number' || isNaN(input.detectionLimit)) {
        throw new Error('Предел обнаружения должен быть числом');
      }
      if (input.detectionLimit < 0) {
        throw new Error('Предел обнаружения не может быть отрицательным');
      }
    }

    // Шаг 3: Формирование объекта обновления
    const updateData: any = {};

    // Добавляем только те поля, которые указаны (не undefined)
    if (input.parameterLabel !== undefined) updateData.parameter_label = input.parameterLabel.trim();
    if (input.value !== undefined) updateData.value = input.value;
    if (input.unit !== undefined) updateData.unit = input.unit.trim();
    if (input.method !== undefined) updateData.method = input.method?.trim() || null;
    if (input.detectionLimit !== undefined) updateData.detection_limit = input.detectionLimit || null;

    // Шаг 4: Проверка, что есть хотя бы одно поле для обновления
    if (Object.keys(updateData).length === 0) {
      throw new Error('Не указаны поля для обновления');
    }

    // Шаг 5: Обновление в БД
    const { data, error } = await supabase
      .from('analysis_results')
      .update(updateData)
      .eq('id', id.trim())
      .select('*')
      .single();

    // Шаг 6: Обработка ошибок
    if (error) {
      console.error('[analysisResultsApi] Ошибка updateAnalysisResult:', {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        id: id.trim(),
        updateFields: Object.keys(updateData),
      });
      throw new Error(error.message || 'Ошибка при обновлении результата');
    }

    // Шаг 7: Проверка результата
    if (!data) {
      throw new Error('Результат не найден');
    }

    // Шаг 8: Очистка кэша
    // Очищаем кэш результатов для этого анализа
    clearWaterQualityCache('analysis_results');
    if (data.analysis_id) {
      clearWaterQualityCache(`analysis_results_${data.analysis_id}`);
    }

    // Шаг 9: Преобразование и возврат
    return mapAnalysisResultFromDb(data);
  } catch (error: any) {
    // Если ошибка уже обработана выше, просто пробрасываем
    if (error.message && (
      error.message.includes('обязателен') ||
      error.message.includes('не может быть') ||
      error.message.includes('должно быть') ||
      error.message.includes('не найден') ||
      error.message.includes('поля для обновления')
    )) {
      throw error;
    }
    
    console.error('[analysisResultsApi] Исключение в updateAnalysisResult:', {
      error: error.message || error,
      stack: error.stack,
      id,
    });
    throw error;
  }
}

/**
 * Удалить результат измерения
 * 
 * @param id - ID результата измерения для удаления
 * @returns void
 * 
 * Логика работы:
 * 1. Валидация ID
 * 2. Получение analysisId перед удалением (для очистки кэша)
 * 3. Удаление из БД
 * 4. Обработка ошибок
 * 5. Очистка кэша
 */
export async function deleteAnalysisResult(id: string): Promise<void> {
  try {
    // Шаг 1: Валидация ID
    validateId(id, 'ID результата');

    // Шаг 2: Получаем analysisId перед удалением (для очистки кэша)
    const { data: existingResult } = await supabase
      .from('analysis_results')
      .select('analysis_id')
      .eq('id', id.trim())
      .single();

    // Шаг 3: Удаление из БД
    const { error } = await supabase
      .from('analysis_results')
      .delete()
      .eq('id', id.trim());

    // Шаг 4: Обработка ошибок
    if (error) {
      console.error('[analysisResultsApi] Ошибка deleteAnalysisResult:', {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        id: id.trim(),
      });
      throw new Error(error.message || 'Ошибка при удалении результата');
    }

    // Шаг 5: Очистка кэша
    clearWaterQualityCache('analysis_results');
    if (existingResult?.analysis_id) {
      clearWaterQualityCache(`analysis_results_${existingResult.analysis_id}`);
    }
  } catch (error: any) {
    // Если ошибка уже обработана выше, просто пробрасываем
    if (error.message && error.message.includes('обязателен')) {
      throw error;
    }
    
    console.error('[analysisResultsApi] Исключение в deleteAnalysisResult:', {
      error: error.message || error,
      stack: error.stack,
      id,
    });
    throw error;
  }
}

/**
 * Создать несколько результатов измерения за раз
 * 
 * @param inputs - Массив данных для создания результатов
 * @returns Массив созданных результатов
 * 
 * Логика работы:
 * 1. Валидация массива (не пустой)
 * 2. Подготовка данных для массовой вставки
 * 3. Вставка всех результатов одним запросом
 * 4. Обработка ошибок
 * 5. Очистка кэша для всех затронутых анализов
 * 6. Преобразование и возврат результатов
 * 
 * Примечание: Массовое создание эффективнее, чем создание по одному
 * Используется при импорте данных или создании полного набора измерений
 */
export async function createAnalysisResults(inputs: AnalysisResultInput[]): Promise<AnalysisResult[]> {
  try {
    // Шаг 1: Валидация массива
    if (!inputs || inputs.length === 0) {
      throw new Error('Массив результатов не может быть пустым');
    }

    // Шаг 2: Подготовка данных для массовой вставки
    const insertData = inputs.map(input => ({
      analysis_id: input.analysisId.trim(),
      parameter_name: input.parameterName,
      parameter_label: input.parameterLabel.trim(),
      value: input.value,
      unit: input.unit.trim(),
      method: input.method?.trim() || null,
      detection_limit: input.detectionLimit || null,
    }));

    // Шаг 3: Массовая вставка в БД
    const { data, error } = await supabase
      .from('analysis_results')
      .insert(insertData)
      .select('*');

    // Шаг 4: Обработка ошибок
    if (error) {
      console.error('[analysisResultsApi] Ошибка createAnalysisResults:', {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        inputsCount: inputs.length,
      });
      throw new Error(error.message || 'Ошибка при создании результатов');
    }

    // Шаг 5: Очистка кэша для всех затронутых анализов
    clearWaterQualityCache('analysis_results');
    
    // Получаем уникальные analysisId для очистки их кэшей
    const uniqueAnalysisIds = [...new Set(inputs.map(input => input.analysisId.trim()))];
    uniqueAnalysisIds.forEach(analysisId => {
      clearWaterQualityCache(`analysis_results_${analysisId}`);
    });

    // Шаг 6: Преобразование и возврат
    return (data || []).map(mapAnalysisResultFromDb);
  } catch (error: any) {
    // Если ошибка уже обработана выше, просто пробрасываем
    if (error.message && (
      error.message.includes('не может быть пустым')
    )) {
      throw error;
    }
    
    console.error('[analysisResultsApi] Исключение в createAnalysisResults:', {
      error: error.message || error,
      stack: error.stack,
      inputsCount: inputs.length,
    });
    throw error;
  }
}
