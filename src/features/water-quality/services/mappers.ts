/**
 * Модуль маппинга данных из БД в TypeScript типы
 */

import type {
  SamplingPoint,
  WaterAnalysis,
  AnalysisResult,
  WaterQualityNorm,
  WaterQualityAlert,
  WaterQualityIncident,
} from '@/features/water-quality/types/waterQuality';

export function mapSamplingPointFromDb(data: any): SamplingPoint {
  return {
    id: data.id,
    code: data.code,
    name: data.name,
    description: data.description || undefined,
    equipmentId: data.equipment_id || undefined,
    location: data.location || undefined,
    samplingFrequency: data.sampling_frequency || undefined,
    samplingSchedule: data.sampling_schedule || undefined,
    responsiblePerson: data.responsible_person || undefined,
    isActive: data.is_active !== undefined ? data.is_active : true,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    createdBy: data.created_by || undefined,
  };
}

export function mapWaterAnalysisFromDb(data: any): WaterAnalysis {
  return {
    id: data.id,
    samplingPointId: data.sampling_point_id,
    equipmentId: data.equipment_id || undefined,
    sampleDate: data.sample_date,
    analysisDate: data.analysis_date || undefined,
    receivedDate: data.received_date || undefined,
    sampledBy: data.sampled_by || undefined,
    analyzedBy: data.analyzed_by || undefined,
    responsiblePerson: data.responsible_person || undefined,
    status: data.status,
    notes: data.notes || undefined,
    sampleCondition: data.sample_condition || undefined,
    externalLab: data.external_lab || false,
    externalLabName: data.external_lab_name || undefined,
    certificateNumber: data.certificate_number || undefined,
    attachmentUrls: data.attachment_urls || undefined,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    createdBy: data.created_by || undefined,
    changeLog: data.change_log || undefined,
  };
}

export function mapAnalysisResultFromDb(data: any): AnalysisResult {
  return {
    id: data.id,
    analysisId: data.analysis_id,
    parameterName: data.parameter_name,
    parameterLabel: data.parameter_label,
    value: parseFloat(data.value),
    unit: data.unit,
    method: data.method || undefined,
    detectionLimit: data.detection_limit ? parseFloat(data.detection_limit) : undefined,
    createdAt: data.created_at,
    // Поля соответствия нормативам
    complianceStatus: data.compliance_status || undefined,
    normId: data.norm_id || undefined,
    deviationPercent: data.deviation_percent ? parseFloat(data.deviation_percent) : undefined,
    checkedAt: data.checked_at || undefined,
    complianceDetails: data.compliance_details || undefined,
  };
}

export function mapWaterQualityNormFromDb(data: any): WaterQualityNorm {
  return {
    id: data.id,
    samplingPointId: data.sampling_point_id || undefined,
    equipmentId: data.equipment_id || undefined,
    parameterName: data.parameter_name,
    optimalMin: data.optimal_min ? parseFloat(data.optimal_min) : undefined,
    optimalMax: data.optimal_max ? parseFloat(data.optimal_max) : undefined,
    minAllowed: data.min_allowed ? parseFloat(data.min_allowed) : undefined,
    maxAllowed: data.max_allowed ? parseFloat(data.max_allowed) : undefined,
    warningMin: data.warning_min ? parseFloat(data.warning_min) : undefined,
    warningMax: data.warning_max ? parseFloat(data.warning_max) : undefined,
    unit: data.unit,
    regulationReference: data.regulation_reference || undefined,
    regulationDocumentUrl: data.regulation_document_url || undefined,
    enableNotifications: data.enable_notifications !== undefined ? data.enable_notifications : true,
    warningThresholdPercent: parseFloat(data.warning_threshold_percent || '10.0'),
    alarmThresholdPercent: parseFloat(data.alarm_threshold_percent || '5.0'),
    isActive: data.is_active !== undefined ? data.is_active : true,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    createdBy: data.created_by || undefined,
  };
}

export function mapAlertFromDb(data: any): WaterQualityAlert {
  return {
    id: data.id,
    resultId: data.result_id,
    analysisId: data.analysis_id,
    normId: data.norm_id || undefined,
    alertType: data.alert_type,
    parameterName: data.parameter_name,
    parameterLabel: data.parameter_label,
    value: parseFloat(data.value),
    unit: data.unit,
    deviationPercent: data.deviation_percent ? parseFloat(data.deviation_percent) : undefined,
    thresholdValue: data.threshold_value ? parseFloat(data.threshold_value) : undefined,
    thresholdType: data.threshold_type || undefined,
    status: data.status,
    priority: data.priority,
    message: data.message,
    createdAt: data.created_at,
    acknowledgedAt: data.acknowledged_at || undefined,
    acknowledgedBy: data.acknowledged_by || undefined,
    resolvedAt: data.resolved_at || undefined,
    resolvedBy: data.resolved_by || undefined,
    resolvedNotes: data.resolved_notes || undefined,
    details: data.details || undefined,
  };
}

export function mapIncidentFromDb(data: any): WaterQualityIncident {
  return {
    id: data.id,
    analysisId: data.analysis_id,
    samplingPointId: data.sampling_point_id || undefined,
    equipmentId: data.equipment_id || undefined,
    incidentType: data.incident_type,
    title: data.title,
    description: data.description,
    affectedParameters: data.affected_parameters || [],
    status: data.status,
    severity: data.severity,
    assignedTo: data.assigned_to || undefined,
    reportedBy: data.reported_by || undefined,
    occurredAt: data.occurred_at,
    detectedAt: data.detected_at,
    resolvedAt: data.resolved_at || undefined,
    closedAt: data.closed_at || undefined,
    resolutionNotes: data.resolution_notes || undefined,
    resolutionActions: data.resolution_actions || [],
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    createdBy: data.created_by || undefined,
    attachments: data.attachments || [],
    tags: data.tags || [],
    relatedIncidents: data.related_incidents || [],
  };
}
