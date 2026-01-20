/**
 * API для проверки соответствия нормативам (compliance)
 *
 * Этот модуль содержит функции, которые завязаны на RPC-функции БД
 * для подбора/проверки применимых нормативов.
 */

import { supabase } from '../../../config/supabase';
import { clearWaterQualityCache } from './cache';
import { validateId } from './validators';
import type {
  ComplianceDetails,
  ComplianceStatus,
  ResultEvaluation,
  WaterQualityNorm,
  WaterQualityParameter,
} from '../../../types/waterQuality';
import { mapWaterQualityNormFromDb } from './mappers';

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

/**
 * Получить применимый норматив для проверки результата
 *
 * В БД логика выбора норматива делается через RPC `get_applicable_norm`:
 * - учитывается parameterName
 * - приоритетнее нормативы, привязанные к samplingPointId или equipmentId (если заданы)
 *
 * Чтобы на фронте не зависеть от формата ответа RPC, мы:
 * 1) вызываем RPC и берём `id` норматива
 * 2) подтягиваем полный норматив из `water_quality_norms` по id и маппим его
 */
export async function getApplicableNorm(
  parameterName: string,
  samplingPointId?: string,
  equipmentId?: string
): Promise<WaterQualityNorm | null> {
  try {
    validateNonEmptyString(parameterName, 'Название параметра');

    const trimmedSamplingPointId = samplingPointId?.trim() || null;
    const trimmedEquipmentId = equipmentId?.trim() || null;

    const { data, error } = await supabase.rpc('get_applicable_norm', {
      p_sampling_point_id: trimmedSamplingPointId,
      p_equipment_id: trimmedEquipmentId,
      p_parameter_name: parameterName.trim(),
    });

    if (error) {
      console.error('[complianceApi] Ошибка getApplicableNorm:', {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        parameterName,
        samplingPointId: trimmedSamplingPointId,
        equipmentId: trimmedEquipmentId,
      });
      throw new Error(error.message || 'Ошибка при получении норматива');
    }

    if (!data || data.length === 0) return null;

    const normId: string | undefined = data?.[0]?.id;
    if (!normId) return null;

    // Тянем полный норматив по id, чтобы вернуть корректный WaterQualityNorm
    const { data: normRow, error: normError } = await supabase
      .from('water_quality_norms')
      .select('*')
      .eq('id', normId)
      .single();

    if (normError) {
      console.error('[complianceApi] Ошибка чтения норматива по id:', {
        error: {
          code: normError.code,
          message: normError.message,
          details: normError.details,
          hint: normError.hint,
        },
        normId,
      });
      throw new Error(normError.message || 'Ошибка при получении норматива');
    }

    if (!normRow) return null;

    return mapWaterQualityNormFromDb(normRow);
  } catch (error: any) {
    if (error?.message && (error.message.includes('обязательно') || error.message.includes('Ошибка при получении'))) {
      throw error;
    }

    console.error('[complianceApi] Исключение в getApplicableNorm:', {
      error: error?.message || error,
      stack: error?.stack,
      parameterName,
      samplingPointId,
      equipmentId,
    });
    throw error;
  }
}

/**
 * Оценить результат измерения по нормативу (RPC)
 *
 * Используется для UI: показать подробное объяснение, попадает ли значение в норму,
 * какие диапазоны применены, какой процент отклонения и т.п.
 */
export async function evaluateResultAgainstNorm(resultId: string): Promise<ResultEvaluation> {
  try {
    validateId(resultId, 'ID результата измерения');

    const { data, error } = await supabase.rpc('evaluate_result_against_norm', {
      p_result_id: resultId.trim(),
    });

    if (error) {
      console.error('[complianceApi] Ошибка evaluateResultAgainstNorm:', {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        resultId: resultId.trim(),
      });
      throw new Error(error.message || 'Ошибка при оценке результата по нормативу');
    }

    // Если RPC ничего не вернул (например, resultId не найден) — возвращаем “безопасный” ответ
    if (!data) {
      return {
        success: false,
        hasNorm: false,
        status: 'unknown',
        message: 'Не удалось оценить результат',
        result: {
          id: resultId.trim(),
          value: 0,
          unit: '',
          // Нужен WaterQualityParameter — используем дефолтный, как и в монолите
          parameterName: 'iron' as WaterQualityParameter,
        },
        isExceeded: false,
        isWarning: false,
        isOptimal: false,
        isNormal: false,
        error: 'Результат не найден',
      };
    }

    return data as ResultEvaluation;
  } catch (error: any) {
    if (error?.message && error.message.includes('обязателен')) {
      throw error;
    }
    console.error('[complianceApi] Исключение в evaluateResultAgainstNorm:', {
      error: error?.message || error,
      stack: error?.stack,
      resultId,
    });
    throw error;
  }
}
