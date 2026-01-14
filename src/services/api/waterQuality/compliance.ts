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
import { validateId } from './validators';
import type { ComplianceDetails, ComplianceStatus } from '../../../types/waterQuality';

function validateNonEmptyString(value: string, fieldName: string): void {
  if (!value || typeof value !== 'string' || !value.trim()) {
    throw new Error(`${fieldName} обязательно`);
  }
}

export interface ComplianceCheckResult {
  status: ComplianceStatus;
  normId: string | null;
  deviationPercent: number | null;
  details: ComplianceDetails | Record<string, any>;
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

/**
 * Проверить соответствие результата измерения нормативам
 *
 * Делает:
 * 1) Получает сам результат (analysis_results)
 * 2) Получает контекст анализа (sampling_point_id / equipment_id)
 * 3) Вызывает RPC `check_norm_compliance`
 *
 * @param resultId - ID результата измерения
 * @returns Результат проверки (status / normId / deviationPercent / details)
 */
export async function checkResultCompliance(resultId: string): Promise<ComplianceCheckResult> {
  try {
    validateId(resultId, 'ID результата измерения');

    // 1) Получаем результат измерения
    const { data: result, error: resultError } = await supabase
      .from('analysis_results')
      .select('id, analysis_id, value, unit, parameter_name')
      .eq('id', resultId.trim())
      .single();

    if (resultError || !result) {
      throw new Error('Результат измерения не найден');
    }

    // 2) Получаем контекст анализа (нужно для выбора применимого норматива)
    const { data: analysis, error: analysisError } = await supabase
      .from('water_analysis')
      .select('sampling_point_id, equipment_id')
      .eq('id', result.analysis_id)
      .single();

    if (analysisError || !analysis) {
      throw new Error('Анализ не найден');
    }

    // 3) Вызываем функцию БД для проверки соответствия
    const { data: complianceResult, error: complianceError } = await supabase.rpc('check_norm_compliance', {
      p_result_id: resultId.trim(),
      p_value: result.value,
      p_unit: result.unit,
      p_sampling_point_id: analysis.sampling_point_id || null,
      p_equipment_id: analysis.equipment_id || null,
      p_parameter_name: result.parameter_name,
    });

    if (complianceError) {
      console.error('[complianceApi] Ошибка checkResultCompliance:', {
        error: {
          code: complianceError.code,
          message: complianceError.message,
          details: complianceError.details,
          hint: complianceError.hint,
        },
        resultId: resultId.trim(),
      });
      throw new Error(complianceError.message || 'Ошибка при проверке соответствия нормативам');
    }

    // После проверки обычно обновляются поля compliance в analysis_results → сбрасываем кэш
    clearWaterQualityCache('analysis_results');
    if (result.analysis_id) {
      clearWaterQualityCache(`analysis_results_${result.analysis_id}`);
    }

    return (
      complianceResult || {
        status: 'unknown',
        normId: null,
        deviationPercent: null,
        details: {},
      }
    );
  } catch (error: any) {
    // “понятные” ошибки пробрасываем как есть
    if (
      error?.message &&
      (error.message.includes('обязателен') ||
        error.message.includes('не найден') ||
        error.message.includes('Ошибка при проверке'))
    ) {
      throw error;
    }

    console.error('[complianceApi] Исключение в checkResultCompliance:', {
      error: error?.message || error,
      stack: error?.stack,
      resultId,
    });
    throw error;
  }
}
