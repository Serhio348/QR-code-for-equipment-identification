/**
 * API для работы с инцидентами (incidents) по качеству воды
 *
 * Инцидент — это агрегированная сущность для анализа, когда есть превышения/проблемы.
 */

import { supabase } from '../../../config/supabase';
import type {
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
  PaginationOptions,
  PaginatedResponse,
  WaterQualityIncident,
  WaterQualityIncidentInput,
  WaterQualityIncidentUpdate,
} from '../../../types/waterQuality';

import { MAX_HISTORICAL_LIMIT, clearWaterQualityCache } from './cache';
import { validateId, validateLimit } from './validators';
import { mapIncidentFromDb } from './mappers';

/**
 * Создать инцидент для анализа с превышениями (RPC)
 *
 * @returns ID созданного инцидента или null, если превышений нет
 */
export async function createIncidentForAnalysis(
  analysisId: string,
  input?: WaterQualityIncidentInput
): Promise<string | null> {
  try {
    validateId(analysisId, 'ID анализа');

    const { data, error } = await supabase.rpc('create_incident_for_analysis', {
      p_analysis_id: analysisId.trim(),
      p_incident_type: input?.incidentType || null,
      p_title: input?.title || null,
      p_description: input?.description || null,
      p_severity: input?.severity || null,
    });

    if (error) {
      console.error('[incidentsApi] Ошибка createIncidentForAnalysis:', {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        analysisId: analysisId.trim(),
        input,
      });
      throw new Error(error.message || 'Ошибка при создании инцидента');
    }

    clearWaterQualityCache('water_quality_incidents');

    return data || null;
  } catch (error: any) {
    if (error?.message && error.message.includes('обязателен')) {
      throw error;
    }
    console.error('[incidentsApi] Исключение в createIncidentForAnalysis:', error);
    throw error;
  }
}

/**
 * Получить все инциденты (пагинация + фильтры)
 */
export async function getAllIncidents(
  filters?: {
    status?: IncidentStatus;
    severity?: IncidentSeverity;
    incidentType?: IncidentType;
    samplingPointId?: string;
    equipmentId?: string;
  },
  options?: PaginationOptions
): Promise<PaginatedResponse<WaterQualityIncident>> {
  try {
    const { limit = 100, offset = 0 } = options || {};

    const validLimit = validateLimit(limit, MAX_HISTORICAL_LIMIT);
    if (offset < 0) {
      throw new Error('Смещение не может быть отрицательным');
    }

    let query = supabase
      .from('water_quality_incidents')
      .select('*', { count: 'exact' })
      .order('occurred_at', { ascending: false })
      .range(offset, offset + validLimit - 1);

    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.severity) query = query.eq('severity', filters.severity);
    if (filters?.incidentType) query = query.eq('incident_type', filters.incidentType);
    if (filters?.samplingPointId) query = query.eq('sampling_point_id', filters.samplingPointId);
    if (filters?.equipmentId) query = query.eq('equipment_id', filters.equipmentId);

    const { data, error, count } = await query;

    if (error) {
      console.error('[incidentsApi] Ошибка getAllIncidents:', {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        filters,
        options,
      });
      throw new Error(error.message || 'Ошибка при получении инцидентов');
    }

    return {
      data: (data || []).map(mapIncidentFromDb),
      total: count || 0,
      limit: validLimit,
      offset,
      hasMore: (count || 0) > offset + validLimit,
    };
  } catch (error: any) {
    console.error('[incidentsApi] Исключение в getAllIncidents:', error);
    throw error;
  }
}

/**
 * Обновить инцидент
 */
export async function updateIncident(
  incidentId: string,
  input: WaterQualityIncidentUpdate
): Promise<WaterQualityIncident> {
  try {
    validateId(incidentId, 'ID инцидента');

    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (input.status !== undefined) {
      updateData.status = input.status;
      if (input.status === 'resolved' && !updateData.resolved_at) {
        updateData.resolved_at = new Date().toISOString();
      }
      if (input.status === 'closed' && !updateData.closed_at) {
        updateData.closed_at = new Date().toISOString();
      }
    }
    if (input.severity !== undefined) updateData.severity = input.severity;
    if (input.assignedTo !== undefined) updateData.assigned_to = input.assignedTo.trim() || null;
    if (input.resolutionNotes !== undefined) updateData.resolution_notes = input.resolutionNotes.trim() || null;
    if (input.resolutionActions !== undefined) updateData.resolution_actions = input.resolutionActions;
    if (input.tags !== undefined) updateData.tags = input.tags;
    if (input.relatedIncidents !== undefined) updateData.related_incidents = input.relatedIncidents;

    const userFields = Object.keys(updateData).filter(key => key !== 'updated_at');
    if (userFields.length === 0) {
      throw new Error('Не указаны поля для обновления');
    }

    const { data, error } = await supabase
      .from('water_quality_incidents')
      .update(updateData)
      .eq('id', incidentId.trim())
      .select('*')
      .single();

    if (error) {
      console.error('[incidentsApi] Ошибка updateIncident:', {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        incidentId: incidentId.trim(),
        input,
      });
      throw new Error(error.message || 'Ошибка при обновлении инцидента');
    }

    if (!data) throw new Error('Инцидент не найден');

    clearWaterQualityCache('water_quality_incidents');

    return mapIncidentFromDb(data);
  } catch (error: any) {
    if (error?.message && (error.message.includes('обязателен') || error.message.includes('Не указаны поля'))) {
      throw error;
    }
    console.error('[incidentsApi] Исключение в updateIncident:', error);
    throw error;
  }
}

/**
 * Получить инцидент по ID
 */
export async function getIncidentById(incidentId: string): Promise<WaterQualityIncident> {
  try {
    validateId(incidentId, 'ID инцидента');

    const { data, error } = await supabase
      .from('water_quality_incidents')
      .select('*')
      .eq('id', incidentId.trim())
      .single();

    if (error) {
      console.error('[incidentsApi] Ошибка getIncidentById:', {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
        incidentId: incidentId.trim(),
      });
      throw new Error(error.message || 'Ошибка при получении инцидента');
    }

    if (!data) throw new Error('Инцидент не найден');

    return mapIncidentFromDb(data);
  } catch (error: any) {
    if (error?.message && (error.message.includes('обязателен') || error.message.includes('не найден'))) {
      throw error;
    }
    console.error('[incidentsApi] Исключение в getIncidentById:', error);
    throw error;
  }
}

