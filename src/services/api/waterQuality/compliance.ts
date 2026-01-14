/**
 * API для проверки соответствия нормативам (compliance)
 *
 * Пока выносим сюда только то, что используется из модуля нормативов:
 * - перепроверка результатов для конкретного параметра (RPC в БД)
 *
 * Остальные функции (checkResultCompliance, checkAnalysisCompliance, etc.)
 * вынесем следующим шагом, чтобы рефакторинг был короткими фрагментами.
 */

import { supabase } from '../../../config/supabase';
import { clearWaterQualityCache } from './cache';

function validateNonEmptyString(value: string, fieldName: string): void {
  if (!value || typeof value !== 'string' || !value.trim()) {
    throw new Error(`${fieldName} обязательно`);
  }
}

/**
 * Перепроверить все результаты для указанного параметра
 * (используется при изменении нормативов)
 *
 * @param parameterName - Название параметра (например: 'iron', 'ph', ...)
 * @returns Количество перепроверенных результатов
 */
export async function recheckResultsForParameter(parameterName: string): Promise<number> {
  try {
    validateNonEmptyString(parameterName, 'Название параметра');

    // Вызываем функцию БД для перепроверки
    const { data, error } = await supabase.rpc('recheck_all_results_for_parameter', {
      p_parameter_name: parameterName.trim(),
    });

    if (error) {
      console.error('[complianceApi] Ошибка recheckResultsForParameter:', {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        parameterName,
      });
      throw new Error(error.message || 'Ошибка при перепроверке результатов');
    }

    // После перепроверки меняются поля compliance в analysis_results → кэш нужно сбросить
    clearWaterQualityCache('analysis_results');

    return data || 0;
  } catch (error: any) {
    // Если это наша “понятная” ошибка валидации — просто пробрасываем
    if (error?.message && error.message.includes('обязательно')) {
      throw error;
    }

    console.error('[complianceApi] Исключение в recheckResultsForParameter:', {
      error: error?.message || error,
      stack: error?.stack,
      parameterName,
    });
    throw error;
  }
}
