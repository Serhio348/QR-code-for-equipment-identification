/**
 * saveAnalysisBundle.ts
 *
 * Один вызов RPC сохраняет анализ и результаты. Ошибка любого шага
 * откатывает запись на стороне базы и приходит сюда как исключение.
 */

import { supabase } from '@/shared/config/supabase';
import type { WaterAnalysisInput } from '../types/waterQuality';
import { clearWaterQualityCache } from './cache';
import type { AnalysisSavePlan } from './analysisSavePlan';

export interface AnalysisBundleInput {
  analysisId: string;
  analysis: WaterAnalysisInput;
  plan: AnalysisSavePlan;
  updatedBy?: string;
}

export async function saveAnalysisBundle(input: AnalysisBundleInput): Promise<string> {
  const { analysis } = input;
  const payload: Record<string, unknown> = {
    analysis_id: input.analysisId,
    sampling_point_id: analysis.samplingPointId,
    equipment_id: analysis.equipmentId ?? '',
    sample_date: analysis.sampleDate,
    status: analysis.status ?? 'in_progress',
    notes: analysis.notes ?? '',
    sample_condition: analysis.sampleCondition ?? '',
    external_lab: analysis.externalLab ?? false,
    external_lab_name: analysis.externalLabName ?? '',
    delete_result_ids: input.plan.deleteResultIds,
    results: input.plan.results.map(result => ({
      parameter_name: result.parameterName,
      parameter_label: result.parameterLabel,
      value: result.value,
      unit: result.unit,
      method: result.method ?? '',
    })),
  };
  if (analysis.sampledBy !== undefined) payload.sampled_by = analysis.sampledBy;
  if (analysis.analyzedBy !== undefined) payload.analyzed_by = analysis.analyzedBy;
  if (analysis.responsiblePerson !== undefined) payload.responsible_person = analysis.responsiblePerson;
  if (input.updatedBy) payload.updated_by = input.updatedBy;
  if (analysis.complianceConclusion) payload.compliance_conclusion = analysis.complianceConclusion;
  if (analysis.complianceBasis !== undefined) payload.compliance_basis = analysis.complianceBasis;

  const { data, error } = await supabase.rpc('save_water_analysis_bundle', {
    payload,
  });

  if (error) {
    throw new Error(error.message || 'Не удалось сохранить анализ');
  }
  if (typeof data !== 'string' || data.length === 0) {
    throw new Error('Не удалось сохранить анализ');
  }

  clearWaterQualityCache('water_analyses');
  clearWaterQualityCache(`water_analysis_${data}`);
  return data;
}
