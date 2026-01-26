/**
 * API для работы с предупреждениями (alerts) по качеству воды
 *
 * Предупреждения создаются на основе результатов измерений и нормативов
 * (обычно через RPC в БД).
 */

import { supabase } from '../../../config/supabase';
import type {
  AlertPriority,
  AlertStatus,
  AlertType,
  PaginationOptions,
  PaginatedResponse,
  WaterQualityAlert,
  WaterQualityParameter,
} from '../../types/waterQuality';

import { MAX_HISTORICAL_LIMIT, clearWaterQualityCache } from './cache';
import { validateId, validateLimit } from './validators';
import { mapAlertFromDb } from './mappers';

/**
 * Сгенерировать предупреждение для результата измерения (RPC)
 *
 * @param resultId - ID результата измерения
 * @param alertType - Тип предупреждения (опционально, определяется автоматически)
 * @returns ID созданного предупреждения или null, если предупреждение не требуется
 */
export async function generateAlertForResult(
  resultId: string,
  alertType?: AlertType
): Promise<string | null> {
  try {
    validateId(resultId, 'ID результата измерения');

    const { data, error } = await supabase.rpc('generate_alert_for_result', {
      p_result_id: resultId.trim(),
      p_alert_type: alertType || null,
    });

    if (error) {
      console.error('[alertsApi] Ошибка generateAlertForResult:', {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        resultId: resultId.trim(),
        alertType,
      });
      throw new Error(error.message || 'Ошибка при генерации предупреждения');
    }

    // Предупреждения могли измениться
    clearWaterQualityCache('water_quality_alerts');

    return data || null;
  } catch (error: any) {
    if (error?.message && error.message.includes('обязателен')) {
      throw error;
    }
    console.error('[alertsApi] Исключение в generateAlertForResult:', {
      error: error?.message || error,
      stack: error?.stack,
      resultId,
      alertType,
    });
    throw error;
  }
}

/**
 * Получить все предупреждения (пагинация + фильтры)
 */
export async function getAllAlerts(
  filters?: {
    status?: AlertStatus;
    alertType?: AlertType;
    priority?: AlertPriority;
    parameterName?: WaterQualityParameter;
    analysisId?: string;
  },
  options?: PaginationOptions
): Promise<PaginatedResponse<WaterQualityAlert>> {
  try {
    const { limit = 100, offset = 0 } = options || {};

    const validLimit = validateLimit(limit, MAX_HISTORICAL_LIMIT);
    if (offset < 0) {
      throw new Error('Смещение не может быть отрицательным');
    }

    let query = supabase
      .from('water_quality_alerts')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + validLimit - 1);

    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.alertType) query = query.eq('alert_type', filters.alertType);
    if (filters?.priority) query = query.eq('priority', filters.priority);
    if (filters?.parameterName) query = query.eq('parameter_name', filters.parameterName);
    if (filters?.analysisId) query = query.eq('analysis_id', filters.analysisId);

    const { data, error, count } = await query;

    if (error) {
      console.error('[alertsApi] Ошибка getAllAlerts:', {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        filters,
        options,
      });
      throw new Error(error.message || 'Ошибка при получении предупреждений');
    }

    return {
      data: (data || []).map(mapAlertFromDb),
      total: count || 0,
      limit: validLimit,
      offset,
      hasMore: (count || 0) > offset + validLimit,
    };
  } catch (error: any) {
    if (error?.message && error.message.includes('Смещение')) {
      throw error;
    }
    console.error('[alertsApi] Исключение в getAllAlerts:', error);
    throw error;
  }
}

/**
 * Обновить статус предупреждения
 *
 * @param alertId - ID предупреждения
 * @param status - Новый статус
 * @param resolvedNotes - Заметки о решении (если статус = 'resolved')
 */
export async function updateAlertStatus(
  alertId: string,
  status: AlertStatus,
  resolvedNotes?: string
): Promise<WaterQualityAlert> {
  try {
    validateId(alertId, 'ID предупреждения');

    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;

    const updateData: any = { status };

    if (status === 'acknowledged') {
      updateData.acknowledged_at = new Date().toISOString();
      if (user?.email) updateData.acknowledged_by = user.email;
    } else if (status === 'resolved') {
      updateData.resolved_at = new Date().toISOString();
      if (user?.email) updateData.resolved_by = user.email;
      if (resolvedNotes) updateData.resolved_notes = resolvedNotes.trim();
    }

    const { data, error } = await supabase
      .from('water_quality_alerts')
      .update(updateData)
      .eq('id', alertId.trim())
      .select('*')
      .single();

    if (error) {
      console.error('[alertsApi] Ошибка updateAlertStatus:', {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        alertId: alertId.trim(),
        status,
      });
      throw new Error(error.message || 'Ошибка при обновлении статуса предупреждения');
    }

    if (!data) throw new Error('Предупреждение не найдено');

    clearWaterQualityCache('water_quality_alerts');

    return mapAlertFromDb(data);
  } catch (error: any) {
    if (error?.message && (error.message.includes('обязателен') || error.message.includes('не найдено'))) {
      throw error;
    }
    console.error('[alertsApi] Исключение в updateAlertStatus:', error);
    throw error;
  }
}

