/**
 * Типы для учета лабораторных измерений качества воды
 * Соответствуют структуре базы данных Supabase
 */

/**
 * Параметры измерения качества воды
 */
export type WaterQualityParameter = 
  | 'iron'           // Железо (Fe) - мг/л
  | 'alkalinity'     // Щелочность - мг-экв/л
  | 'hardness'       // Жесткость - мг-экв/л
  | 'oxidizability'  // Окисляемость - мг O₂/л
  | 'ph'             // pH - единицы pH
  | 'temperature';   // Температура - °C

/**
 * Периодичность отбора проб
 */
export type SamplingFrequency = 'daily' | 'weekly' | 'monthly' | 'custom';

/**
 * Статус анализа
 */
export type AnalysisStatus = 'in_progress' | 'completed' | 'deviation' | 'cancelled';

/**
 * Состояние пробы
 */
export type SampleCondition = 'normal' | 'turbid' | 'colored' | 'odorous';

/**
 * Статус соответствия нормативам
 */
export type ComplianceStatus = 'optimal' | 'normal' | 'warning' | 'exceeded' | 'unknown';

/**
 * Пункт отбора проб (Точка контроля)
 */
export interface SamplingPoint {
  id: string;
  code: string;
  name: string;
  description?: string;
  equipmentId?: string;
  location?: string;
  samplingFrequency?: SamplingFrequency;
  samplingSchedule?: Record<string, any>; // JSONB
  responsiblePerson?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

/**
 * Входные данные для создания/обновления пункта отбора проб
 */
export interface SamplingPointInput {
  code: string;
  name: string;
  description?: string;
  equipmentId?: string;
  location?: string;
  samplingFrequency?: SamplingFrequency;
  samplingSchedule?: Record<string, any>;
  responsiblePerson?: string;
  isActive?: boolean;
}

/**
 * Тип для обновления пункта отбора проб (исключает поля, которые не должны обновляться напрямую)
 */
export type SamplingPointUpdate = Partial<Omit<SamplingPointInput, 'code'>> & {
  code?: string; // Код можно обновлять, но с валидацией
};

/**
 * Лабораторный анализ (Запись в журнале)
 */
export interface WaterAnalysis {
  id: string;
  samplingPointId: string;
  equipmentId?: string;
  sampleDate: string; // TIMESTAMP WITH TIME ZONE
  analysisDate?: string; // TIMESTAMP WITH TIME ZONE
  receivedDate?: string; // TIMESTAMP WITH TIME ZONE
  sampledBy?: string;
  analyzedBy?: string;
  responsiblePerson?: string;
  status: AnalysisStatus;
  notes?: string;
  sampleCondition?: SampleCondition;
  externalLab: boolean;
  externalLabName?: string;
  certificateNumber?: string;
  attachmentUrls?: string[]; // JSONB массив URL
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  changeLog?: ChangeLogEntry[]; // JSONB массив
}

/**
 * Запись в журнале изменений
 */
export interface ChangeLogEntry {
  user: string;
  timestamp: string;
  field: string;
  oldValue: any;
  newValue: any;
}

/**
 * Входные данные для создания/обновления анализа
 */
export interface WaterAnalysisInput {
  samplingPointId: string;
  equipmentId?: string;
  sampleDate: string;
  analysisDate?: string;
  receivedDate?: string;
  sampledBy?: string;
  analyzedBy?: string;
  responsiblePerson?: string;
  status?: AnalysisStatus;
  notes?: string;
  sampleCondition?: SampleCondition;
  externalLab?: boolean;
  externalLabName?: string;
  certificateNumber?: string;
  attachmentUrls?: string[];
}

/**
 * Тип для обновления анализа (исключает поля, которые не должны обновляться напрямую)
 */
export type WaterAnalysisUpdate = Partial<Omit<WaterAnalysisInput, 'samplingPointId'>> & {
  samplingPointId?: string; // Можно изменить пункт отбора проб
};

/**
 * Детали соответствия нормативам
 */
export interface ComplianceDetails {
  optimalRange?: { min?: number; max?: number };
  allowedRange?: { min?: number; max?: number };
  warningRange?: { min?: number; max?: number };
  value: number;
  deviation?: number;
  message?: string;
}

/**
 * Результат измерения параметра (Нормализованная структура)
 */
export interface AnalysisResult {
  id: string;
  analysisId: string;
  parameterName: WaterQualityParameter;
  parameterLabel: string;
  value: number; // DECIMAL(10, 4)
  unit: string;
  method?: string;
  detectionLimit?: number; // DECIMAL(10, 4)
  createdAt: string;
  // Поля соответствия нормативам
  complianceStatus?: ComplianceStatus;
  normId?: string;
  deviationPercent?: number;
  checkedAt?: string;
  complianceDetails?: ComplianceDetails;
}

/**
 * Входные данные для создания результата измерения
 */
export interface AnalysisResultInput {
  analysisId: string;
  parameterName: WaterQualityParameter;
  parameterLabel: string;
  value: number;
  unit: string;
  method?: string;
  detectionLimit?: number;
}

/**
 * Тип для обновления результата измерения (исключает поля, которые не должны обновляться)
 */
export type AnalysisResultUpdate = Partial<Omit<AnalysisResultInput, 'analysisId' | 'parameterName'>>;

/**
 * Норматив качества воды (Граничные условия)
 */
export interface WaterQualityNorm {
  id: string;
  samplingPointId?: string;
  equipmentId?: string;
  parameterName: WaterQualityParameter;
  optimalMin?: number; // DECIMAL(10, 4)
  optimalMax?: number; // DECIMAL(10, 4)
  minAllowed?: number; // DECIMAL(10, 4)
  maxAllowed?: number; // DECIMAL(10, 4)
  warningMin?: number; // DECIMAL(10, 4)
  warningMax?: number; // DECIMAL(10, 4)
  unit: string;
  regulationReference?: string;
  regulationDocumentUrl?: string;
  enableNotifications: boolean;
  warningThresholdPercent: number; // DECIMAL(5, 2)
  alarmThresholdPercent: number; // DECIMAL(5, 2)
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

/**
 * Входные данные для создания/обновления норматива
 */
export interface WaterQualityNormInput {
  samplingPointId?: string;
  equipmentId?: string;
  parameterName: WaterQualityParameter;
  optimalMin?: number;
  optimalMax?: number;
  minAllowed?: number;
  maxAllowed?: number;
  warningMin?: number;
  warningMax?: number;
  unit: string;
  regulationReference?: string;
  regulationDocumentUrl?: string;
  enableNotifications?: boolean;
  warningThresholdPercent?: number;
  alarmThresholdPercent?: number;
  isActive?: boolean;
}

/**
 * Тип для обновления норматива (исключает поля, которые не должны обновляться напрямую)
 */
export type WaterQualityNormUpdate = Partial<Omit<WaterQualityNormInput, 'parameterName'>> & {
  parameterName?: WaterQualityParameter; // Можно изменить параметр, но с валидацией
};

/**
 * Полный анализ с результатами измерений
 */
export interface WaterAnalysisWithResults extends WaterAnalysis {
  results: AnalysisResult[];
  samplingPoint?: SamplingPoint;
}

/**
 * Параметр с метаданными для отображения
 */
export interface ParameterMetadata {
  name: WaterQualityParameter;
  label: string;
  unit: string;
  description?: string;
  minValue?: number;
  maxValue?: number;
  step?: number;
  precision?: number; // Количество знаков после запятой
}

/**
 * Константы для метаданных параметров
 */
export const PARAMETER_METADATA: Record<WaterQualityParameter, ParameterMetadata> = {
  iron: {
    name: 'iron',
    label: 'Железо',
    unit: 'мг/л',
    description: 'Содержание железа в воде',
    minValue: 0,
    maxValue: 10,
    step: 0.01,
    precision: 2,
  },
  alkalinity: {
    name: 'alkalinity',
    label: 'Щелочность',
    unit: 'мг-экв/л',
    description: 'Щелочность воды',
    minValue: 0,
    maxValue: 20,
    step: 0.1,
    precision: 1,
  },
  hardness: {
    name: 'hardness',
    label: 'Жесткость',
    unit: 'мг-экв/л',
    description: 'Общая жесткость воды',
    minValue: 0,
    maxValue: 20,
    step: 0.1,
    precision: 1,
  },
  oxidizability: {
    name: 'oxidizability',
    label: 'Окисляемость',
    unit: 'мг O₂/л',
    description: 'Перманганатная окисляемость',
    minValue: 0,
    maxValue: 20,
    step: 0.1,
    precision: 1,
  },
  ph: {
    name: 'ph',
    label: 'pH',
    unit: 'pH',
    description: 'Водородный показатель',
    minValue: 0,
    maxValue: 14,
    step: 0.1,
    precision: 1,
  },
  temperature: {
    name: 'temperature',
    label: 'Температура',
    unit: '°C',
    description: 'Температура воды',
    minValue: -10,
    maxValue: 100,
    step: 0.1,
    precision: 1,
  },
};

/**
 * Получить метаданные параметра
 */
export function getParameterMetadata(parameter: WaterQualityParameter): ParameterMetadata {
  return PARAMETER_METADATA[parameter];
}

/**
 * Получить список всех параметров
 */
export function getAllParameters(): WaterQualityParameter[] {
  return Object.keys(PARAMETER_METADATA) as WaterQualityParameter[];
}

/**
 * Опции пагинации
 */
export interface PaginationOptions {
  /** Максимальное количество записей (по умолчанию 100) */
  limit?: number;
  /** Смещение для пагинации (по умолчанию 0) */
  offset?: number;
}

/**
 * Ответ с пагинацией
 */
export interface PaginatedResponse<T> {
  /** Массив данных */
  data: T[];
  /** Общее количество записей */
  total: number;
  /** Лимит записей на странице */
  limit: number;
  /** Смещение */
  offset: number;
  /** Есть ли еще данные */
  hasMore: boolean;
}

/**
 * Фильтры для результатов измерений
 */
export interface AnalysisResultsFilter {
  /** Фильтр по типу параметра */
  parameterName?: WaterQualityParameter;
  /** Минимальное значение */
  minValue?: number;
  /** Максимальное значение */
  maxValue?: number;
}

/**
 * Опции кэширования
 */
export interface CacheOptions {
  /** Время жизни кэша в миллисекундах (по умолчанию 5 минут) */
  ttl?: number;
  /** Использовать паттерн stale-while-revalidate (возвращать устаревшие данные из кэша, пока идет обновление) */
  staleWhileRevalidate?: boolean;
}

/**
 * Тип предупреждения
 */
export type AlertType = 'warning' | 'exceeded' | 'deviation';

/**
 * Статус предупреждения
 */
export type AlertStatus = 'active' | 'acknowledged' | 'resolved' | 'dismissed';

/**
 * Приоритет предупреждения
 */
export type AlertPriority = 'low' | 'medium' | 'high' | 'critical';

/**
 * Тип инцидента
 */
export type IncidentType = 'exceeded_norm' | 'multiple_exceeded' | 'critical_exceeded' | 'equipment_failure' | 'sampling_error';

/**
 * Статус инцидента
 */
export type IncidentStatus = 'open' | 'investigating' | 'resolved' | 'closed';

/**
 * Серьезность инцидента
 */
export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Предупреждение о превышении нормативов
 */
export interface WaterQualityAlert {
  id: string;
  resultId: string;
  analysisId: string;
  normId?: string;
  alertType: AlertType;
  parameterName: WaterQualityParameter;
  parameterLabel: string;
  value: number;
  unit: string;
  deviationPercent?: number;
  thresholdValue?: number;
  thresholdType?: 'optimal_max' | 'optimal_min' | 'allowed_max' | 'allowed_min' | 'warning_max' | 'warning_min';
  status: AlertStatus;
  priority: AlertPriority;
  message: string;
  createdAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolvedNotes?: string;
  details?: ComplianceDetails;
}

/**
 * Входные данные для создания/обновления предупреждения
 */
export interface WaterQualityAlertInput {
  resultId: string;
  alertType?: AlertType;
  status?: AlertStatus;
  priority?: AlertPriority;
  message?: string;
  resolvedNotes?: string;
}

/**
 * Параметр с превышением (для инцидентов)
 */
export interface AffectedParameter {
  parameterName: WaterQualityParameter;
  parameterLabel: string;
  value: number;
  unit: string;
  status: ComplianceStatus;
  deviation?: number;
  normId?: string;
  normRange?: {
    minAllowed?: number;
    maxAllowed?: number;
    optimalMin?: number;
    optimalMax?: number;
  };
}

/**
 * Инцидент превышения нормативов
 */
export interface WaterQualityIncident {
  id: string;
  analysisId: string;
  samplingPointId?: string;
  equipmentId?: string;
  incidentType: IncidentType;
  title: string;
  description: string;
  affectedParameters: AffectedParameter[];
  status: IncidentStatus;
  severity: IncidentSeverity;
  assignedTo?: string;
  reportedBy?: string;
  occurredAt: string;
  detectedAt: string;
  resolvedAt?: string;
  closedAt?: string;
  resolutionNotes?: string;
  resolutionActions?: Array<{ action: string; date: string; performedBy: string }>;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  attachments?: string[];
  tags?: string[];
  relatedIncidents?: string[];
}

/**
 * Входные данные для создания инцидента
 */
export interface WaterQualityIncidentInput {
  analysisId: string;
  incidentType?: IncidentType;
  title?: string;
  description?: string;
  severity?: IncidentSeverity;
  assignedTo?: string;
  tags?: string[];
}

/**
 * Входные данные для обновления инцидента
 */
export interface WaterQualityIncidentUpdate {
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  assignedTo?: string;
  resolutionNotes?: string;
  resolutionActions?: Array<{ action: string; date: string; performedBy: string }>;
  tags?: string[];
  relatedIncidents?: string[];
}

/**
 * Результат оценки результата по нормативу
 */
export interface ResultEvaluation {
  success: boolean;
  hasNorm: boolean;
  status: ComplianceStatus;
  message: string;
  result: {
    id: string;
    value: number;
    unit: string;
    parameterName: WaterQualityParameter;
  };
  norm?: {
    id: string;
    optimalRange?: { min?: number; max?: number };
    allowedRange?: { min?: number; max?: number };
    warningRange?: { min?: number; max?: number };
    unit: string;
  };
  deviation?: number;
  isExceeded: boolean;
  isWarning: boolean;
  isOptimal: boolean;
  isNormal: boolean;
  error?: string;
}
