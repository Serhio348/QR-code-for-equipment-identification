-- ============================================================================
-- МИГРАЦИЯ: Добавление системы предупреждений и инцидентов
-- Версия: 2.3
-- Дата: 2024
-- ============================================================================
-- 
-- Эта миграция добавляет таблицы для предупреждений и инцидентов превышения
-- нормативов, а также функции для их автоматической генерации.
-- ============================================================================

-- ============================================================================
-- 1. ТАБЛИЦА: Предупреждения (Warnings/Alerts)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.water_quality_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Связь с результатом измерения
  result_id UUID NOT NULL REFERENCES public.analysis_results(id) ON DELETE CASCADE,
  analysis_id UUID NOT NULL REFERENCES public.water_analysis(id) ON DELETE CASCADE,
  norm_id UUID REFERENCES public.water_quality_norms(id) ON DELETE SET NULL,
  
  -- Тип предупреждения
  alert_type TEXT NOT NULL CHECK (alert_type IN ('warning', 'exceeded', 'deviation')),
  
  -- Параметры предупреждения
  parameter_name TEXT NOT NULL,
  parameter_label TEXT NOT NULL,
  value DECIMAL(10, 4) NOT NULL,
  unit TEXT NOT NULL,
  
  -- Детали превышения
  deviation_percent DECIMAL(10, 4),
  threshold_value DECIMAL(10, 4), -- Значение порога, который был превышен
  threshold_type TEXT, -- 'optimal_max', 'optimal_min', 'allowed_max', 'allowed_min', 'warning_max', 'warning_min'
  
  -- Статус предупреждения
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved', 'dismissed')),
  
  -- Сообщение
  message TEXT NOT NULL,
  
  -- Приоритет
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  
  -- Метаданные
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  acknowledged_by TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by TEXT,
  resolved_notes TEXT,
  
  -- Дополнительная информация
  details JSONB DEFAULT '{}'::jsonb
);

-- Индексы для water_quality_alerts
CREATE INDEX IF NOT EXISTS idx_alerts_result ON public.water_quality_alerts(result_id);
CREATE INDEX IF NOT EXISTS idx_alerts_analysis ON public.water_quality_alerts(analysis_id);
CREATE INDEX IF NOT EXISTS idx_alerts_norm ON public.water_quality_alerts(norm_id) WHERE norm_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_alerts_status ON public.water_quality_alerts(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_alerts_priority ON public.water_quality_alerts(priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_parameter ON public.water_quality_alerts(parameter_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_type ON public.water_quality_alerts(alert_type, created_at DESC);

-- Комментарии
COMMENT ON TABLE public.water_quality_alerts IS 'Предупреждения о превышении нормативов качества воды';
COMMENT ON COLUMN public.water_quality_alerts.alert_type IS 'Тип предупреждения: warning (предупреждение), exceeded (превышение), deviation (отклонение)';
COMMENT ON COLUMN public.water_quality_alerts.status IS 'Статус: active (активно), acknowledged (подтверждено), resolved (решено), dismissed (отклонено)';
COMMENT ON COLUMN public.water_quality_alerts.priority IS 'Приоритет: low, medium, high, critical';
COMMENT ON COLUMN public.water_quality_alerts.threshold_type IS 'Тип порога: optimal_max, optimal_min, allowed_max, allowed_min, warning_max, warning_min';

-- ============================================================================
-- 2. ТАБЛИЦА: Инциденты (Incidents)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.water_quality_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Связь с анализом
  analysis_id UUID NOT NULL REFERENCES public.water_analysis(id) ON DELETE CASCADE,
  sampling_point_id UUID REFERENCES public.sampling_points(id) ON DELETE SET NULL,
  equipment_id TEXT,
  
  -- Тип инцидента
  incident_type TEXT NOT NULL CHECK (incident_type IN ('exceeded_norm', 'multiple_exceeded', 'critical_exceeded', 'equipment_failure', 'sampling_error')),
  
  -- Описание
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  
  -- Параметры, связанные с инцидентом
  affected_parameters JSONB DEFAULT '[]'::jsonb, -- Массив параметров с превышениями
  
  -- Статус инцидента
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'closed')),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  
  -- Ответственные
  assigned_to TEXT,
  reported_by TEXT,
  
  -- Временные метки
  occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  closed_at TIMESTAMP WITH TIME ZONE,
  
  -- Решение
  resolution_notes TEXT,
  resolution_actions JSONB DEFAULT '[]'::jsonb, -- Массив действий по устранению
  
  -- Метаданные
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  
  -- Дополнительная информация
  attachments JSONB DEFAULT '[]'::jsonb, -- Массив URL вложений
  tags TEXT[] DEFAULT '{}'::text[],
  related_incidents UUID[] DEFAULT '{}'::uuid[]
);

-- Индексы для water_quality_incidents
CREATE INDEX IF NOT EXISTS idx_incidents_analysis ON public.water_quality_incidents(analysis_id);
CREATE INDEX IF NOT EXISTS idx_incidents_sampling_point ON public.water_quality_incidents(sampling_point_id) WHERE sampling_point_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_incidents_equipment ON public.water_quality_incidents(equipment_id) WHERE equipment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_incidents_status ON public.water_quality_incidents(status) WHERE status IN ('open', 'investigating');
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON public.water_quality_incidents(severity, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_type ON public.water_quality_incidents(incident_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_occurred_at ON public.water_quality_incidents(occurred_at DESC);

-- Комментарии
COMMENT ON TABLE public.water_quality_incidents IS 'Инциденты превышения нормативов качества воды';
COMMENT ON COLUMN public.water_quality_incidents.incident_type IS 'Тип инцидента: exceeded_norm (превышение нормы), multiple_exceeded (множественные превышения), critical_exceeded (критическое превышение), equipment_failure (отказ оборудования), sampling_error (ошибка отбора проб)';
COMMENT ON COLUMN public.water_quality_incidents.status IS 'Статус: open (открыт), investigating (расследуется), resolved (решен), closed (закрыт)';
COMMENT ON COLUMN public.water_quality_incidents.severity IS 'Серьезность: low, medium, high, critical';
COMMENT ON COLUMN public.water_quality_incidents.affected_parameters IS 'Массив параметров с превышениями: [{parameterName, value, normValue, deviation}]';

-- ============================================================================
-- 3. ФУНКЦИЯ: Оценка результата по нормативу
-- ============================================================================

CREATE OR REPLACE FUNCTION evaluate_result_against_norm(
  p_result_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_result RECORD;
  v_analysis RECORD;
  v_norm RECORD;
  v_evaluation JSONB;
  v_status TEXT;
  v_deviation DECIMAL(10, 4);
  v_optimal_center DECIMAL(10, 4);
  v_message TEXT;
BEGIN
  -- Получаем результат измерения
  SELECT * INTO v_result
  FROM public.analysis_results
  WHERE id = p_result_id;

  IF v_result IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Результат измерения не найден'
    );
  END IF;

  -- Получаем информацию об анализе
  SELECT 
    wa.sampling_point_id,
    wa.equipment_id,
    wa.sample_date
  INTO v_analysis
  FROM public.water_analysis wa
  WHERE wa.id = v_result.analysis_id;

  IF v_analysis IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Анализ не найден'
    );
  END IF;

  -- Получаем применимый норматив
  SELECT * INTO v_norm
  FROM get_applicable_norm(
    v_analysis.sampling_point_id,
    v_analysis.equipment_id,
    v_result.parameter_name
  );

  IF v_norm IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'hasNorm', false,
      'status', 'unknown',
      'message', 'Норматив для данного параметра не найден'
    );
  END IF;

  -- Проверяем единицы измерения
  IF v_norm.unit != v_result.unit THEN
    RETURN jsonb_build_object(
      'success', true,
      'hasNorm', true,
      'status', 'unknown',
      'message', format('Несоответствие единиц измерения: норматив в %s, результат в %s', v_norm.unit, v_result.unit),
      'norm', jsonb_build_object('id', v_norm.id, 'unit', v_norm.unit)
    );
  END IF;

  -- Вычисляем центр оптимального диапазона для расчета отклонения
  IF v_norm.optimal_min IS NOT NULL AND v_norm.optimal_max IS NOT NULL THEN
    v_optimal_center := (v_norm.optimal_min + v_norm.optimal_max) / 2.0;
    IF v_optimal_center > 0 THEN
      v_deviation := ((v_result.value - v_optimal_center) / v_optimal_center) * 100;
    ELSE
      v_deviation := NULL;
    END IF;
  ELSE
    v_deviation := NULL;
  END IF;

  -- Определяем статус и сообщение
  -- 1. Превышение допустимых значений (критично)
  IF (v_norm.max_allowed IS NOT NULL AND v_result.value > v_norm.max_allowed) OR
     (v_norm.min_allowed IS NOT NULL AND v_result.value < v_norm.min_allowed) THEN
    v_status := 'exceeded';
    v_message := format('КРИТИЧНО: Превышение допустимых значений - %s %s (допустимо: %s - %s %s)', 
      v_result.value, v_result.unit, 
      COALESCE(v_norm.min_allowed::text, 'не ограничено'), 
      COALESCE(v_norm.max_allowed::text, 'не ограничено'), 
      v_result.unit);
  -- 2. Предупреждение (близко к границам)
  ELSIF (v_norm.warning_max IS NOT NULL AND v_result.value > v_norm.warning_max) OR
        (v_norm.warning_min IS NOT NULL AND v_result.value < v_norm.warning_min) THEN
    v_status := 'warning';
    v_message := format('ПРЕДУПРЕЖДЕНИЕ: Значение близко к границам нормы - %s %s (оптимально: %s - %s %s)', 
      v_result.value, v_result.unit, 
      COALESCE(v_norm.optimal_min::text, 'не ограничено'), 
      COALESCE(v_norm.optimal_max::text, 'не ограничено'), 
      v_result.unit);
  -- 3. Оптимальное значение
  ELSIF (v_norm.optimal_min IS NOT NULL AND v_norm.optimal_max IS NOT NULL) AND
        (v_result.value >= v_norm.optimal_min AND v_result.value <= v_norm.optimal_max) THEN
    v_status := 'optimal';
    v_message := format('ОПТИМАЛЬНО: Значение в оптимальном диапазоне - %s %s', v_result.value, v_result.unit);
  -- 4. Норма (в допустимом диапазоне, но не оптимально)
  ELSIF (v_norm.min_allowed IS NOT NULL AND v_norm.max_allowed IS NOT NULL) AND
        (v_result.value >= v_norm.min_allowed AND v_result.value <= v_norm.max_allowed) THEN
    v_status := 'normal';
    v_message := format('НОРМА: Значение в допустимом диапазоне - %s %s (оптимально: %s - %s %s)', 
      v_result.value, v_result.unit, 
      COALESCE(v_norm.optimal_min::text, 'не ограничено'), 
      COALESCE(v_norm.optimal_max::text, 'не ограничено'), 
      v_result.unit);
  ELSE
    v_status := 'unknown';
    v_message := 'Не удалось определить статус соответствия';
  END IF;

  -- Формируем результат оценки
  v_evaluation := jsonb_build_object(
    'success', true,
    'hasNorm', true,
    'status', v_status,
    'message', v_message,
    'result', jsonb_build_object(
      'id', v_result.id,
      'value', v_result.value,
      'unit', v_result.unit,
      'parameterName', v_result.parameter_name
    ),
    'norm', jsonb_build_object(
      'id', v_norm.id,
      'optimalRange', jsonb_build_object('min', v_norm.optimal_min, 'max', v_norm.optimal_max),
      'allowedRange', jsonb_build_object('min', v_norm.min_allowed, 'max', v_norm.max_allowed),
      'warningRange', jsonb_build_object('min', v_norm.warning_min, 'max', v_norm.warning_max),
      'unit', v_norm.unit
    ),
    'deviation', v_deviation,
    'isExceeded', v_status = 'exceeded',
    'isWarning', v_status = 'warning',
    'isOptimal', v_status = 'optimal',
    'isNormal', v_status = 'normal'
  );

  RETURN v_evaluation;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION evaluate_result_against_norm IS 'Оценить результат измерения по нормативу и вернуть детальную информацию';

-- ============================================================================
-- 4. ФУНКЦИЯ: Генерация предупреждения
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_alert_for_result(
  p_result_id UUID,
  p_alert_type TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_result RECORD;
  v_analysis RECORD;
  v_norm RECORD;
  v_evaluation JSONB;
  v_alert_id UUID;
  v_alert_type TEXT;
  v_priority TEXT;
  v_message TEXT;
  v_threshold_value DECIMAL(10, 4);
  v_threshold_type TEXT;
BEGIN
  -- Получаем результат измерения
  SELECT * INTO v_result
  FROM public.analysis_results
  WHERE id = p_result_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Результат измерения не найден';
  END IF;

  -- Получаем информацию об анализе
  SELECT 
    wa.id,
    wa.sampling_point_id,
    wa.equipment_id
  INTO v_analysis
  FROM public.water_analysis wa
  WHERE wa.id = v_result.analysis_id;

  IF v_analysis IS NULL THEN
    RAISE EXCEPTION 'Анализ не найден';
  END IF;

  -- Оцениваем результат по нормативу
  v_evaluation := evaluate_result_against_norm(p_result_id);

  IF NOT (v_evaluation->>'success')::boolean THEN
    RAISE EXCEPTION 'Ошибка оценки результата: %', v_evaluation->>'error';
  END IF;

  -- Если норматив не найден или статус unknown, не создаем предупреждение
  IF NOT (v_evaluation->>'hasNorm')::boolean OR (v_evaluation->>'status') = 'unknown' THEN
    RETURN NULL;
  END IF;

  -- Определяем тип предупреждения, если не указан
  IF p_alert_type IS NULL THEN
    IF (v_evaluation->>'isExceeded')::boolean THEN
      v_alert_type := 'exceeded';
      v_priority := 'critical';
    ELSIF (v_evaluation->>'isWarning')::boolean THEN
      v_alert_type := 'warning';
      v_priority := 'high';
    ELSE
      -- Не создаем предупреждение для оптимальных и нормальных значений
      RETURN NULL;
    END IF;
  ELSE
    v_alert_type := p_alert_type;
    v_priority := CASE 
      WHEN p_alert_type = 'exceeded' THEN 'critical'
      WHEN p_alert_type = 'warning' THEN 'high'
      ELSE 'medium'
    END;
  END IF;

  -- Получаем норматив для определения порога
  SELECT * INTO v_norm
  FROM get_applicable_norm(
    v_analysis.sampling_point_id,
    v_analysis.equipment_id,
    v_result.parameter_name
  );

  -- Определяем порог и его тип
  IF v_norm.max_allowed IS NOT NULL AND v_result.value > v_norm.max_allowed THEN
    v_threshold_value := v_norm.max_allowed;
    v_threshold_type := 'allowed_max';
  ELSIF v_norm.min_allowed IS NOT NULL AND v_result.value < v_norm.min_allowed THEN
    v_threshold_value := v_norm.min_allowed;
    v_threshold_type := 'allowed_min';
  ELSIF v_norm.warning_max IS NOT NULL AND v_result.value > v_norm.warning_max THEN
    v_threshold_value := v_norm.warning_max;
    v_threshold_type := 'warning_max';
  ELSIF v_norm.warning_min IS NOT NULL AND v_result.value < v_norm.warning_min THEN
    v_threshold_value := v_norm.warning_min;
    v_threshold_type := 'warning_min';
  ELSE
    v_threshold_value := NULL;
    v_threshold_type := NULL;
  END IF;

  -- Формируем сообщение
  v_message := v_evaluation->>'message';

  -- Проверяем, нет ли уже активного предупреждения для этого результата
  SELECT id INTO v_alert_id
  FROM public.water_quality_alerts
  WHERE result_id = p_result_id
    AND status = 'active'
    AND alert_type = v_alert_type
  LIMIT 1;

  -- Если предупреждение уже существует, обновляем его
  IF v_alert_id IS NOT NULL THEN
    UPDATE public.water_quality_alerts
    SET 
      deviation_percent = (v_evaluation->>'deviation')::DECIMAL,
      threshold_value = v_threshold_value,
      threshold_type = v_threshold_type,
      message = v_message,
      priority = v_priority,
      details = v_evaluation,
      created_at = NOW() -- Обновляем время создания для сортировки
    WHERE id = v_alert_id;
    
    RETURN v_alert_id;
  END IF;

  -- Создаем новое предупреждение
  INSERT INTO public.water_quality_alerts (
    result_id,
    analysis_id,
    norm_id,
    alert_type,
    parameter_name,
    parameter_label,
    value,
    unit,
    deviation_percent,
    threshold_value,
    threshold_type,
    status,
    priority,
    message,
    details
  ) VALUES (
    p_result_id,
    v_analysis.id,
    v_norm.id,
    v_alert_type,
    v_result.parameter_name,
    v_result.parameter_label,
    v_result.value,
    v_result.unit,
    (v_evaluation->>'deviation')::DECIMAL,
    v_threshold_value,
    v_threshold_type,
    'active',
    v_priority,
    v_message,
    v_evaluation
  ) RETURNING id INTO v_alert_id;

  RETURN v_alert_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_alert_for_result IS 'Создать или обновить предупреждение для результата измерения';

-- ============================================================================
-- 5. ФУНКЦИЯ: Фиксация инцидента
-- ============================================================================

CREATE OR REPLACE FUNCTION create_incident_for_analysis(
  p_analysis_id UUID,
  p_incident_type TEXT DEFAULT 'exceeded_norm',
  p_title TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_severity TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_analysis RECORD;
  v_results RECORD;
  v_affected_params JSONB := '[]'::jsonb;
  v_incident_id UUID;
  v_title TEXT;
  v_description TEXT;
  v_severity TEXT := 'medium';
  v_has_critical BOOLEAN := false;
  v_exceeded_count INTEGER := 0;
BEGIN
  -- Получаем информацию об анализе
  SELECT 
    wa.id,
    wa.sampling_point_id,
    wa.equipment_id,
    wa.sample_date
  INTO v_analysis
  FROM public.water_analysis wa
  WHERE wa.id = p_analysis_id;

  IF v_analysis IS NULL THEN
    RAISE EXCEPTION 'Анализ не найден';
  END IF;

  -- Получаем все результаты с превышениями
  FOR v_results IN
    SELECT 
      ar.id,
      ar.parameter_name,
      ar.parameter_label,
      ar.value,
      ar.unit,
      ar.compliance_status,
      ar.deviation_percent,
      ar.norm_id,
      n.min_allowed,
      n.max_allowed,
      n.optimal_min,
      n.optimal_max
    FROM public.analysis_results ar
    LEFT JOIN public.water_quality_norms n ON n.id = ar.norm_id
    WHERE ar.analysis_id = p_analysis_id
      AND ar.compliance_status IN ('exceeded', 'warning')
    ORDER BY 
      CASE ar.compliance_status 
        WHEN 'exceeded' THEN 1 
        WHEN 'warning' THEN 2 
        ELSE 3 
      END,
      ABS(ar.deviation_percent) DESC NULLS LAST
  LOOP
    -- Добавляем параметр в список затронутых
    v_affected_params := v_affected_params || jsonb_build_object(
      'parameterName', v_results.parameter_name,
      'parameterLabel', v_results.parameter_label,
      'value', v_results.value,
      'unit', v_results.unit,
      'status', v_results.compliance_status,
      'deviation', v_results.deviation_percent,
      'normId', v_results.norm_id,
      'normRange', jsonb_build_object(
        'minAllowed', v_results.min_allowed,
        'maxAllowed', v_results.max_allowed,
        'optimalMin', v_results.optimal_min,
        'optimalMax', v_results.optimal_max
      )
    );

    -- Подсчитываем превышения
    IF v_results.compliance_status = 'exceeded' THEN
      v_exceeded_count := v_exceeded_count + 1;
      v_has_critical := true;
    END IF;
  END LOOP;

  -- Если нет превышений, не создаем инцидент
  IF jsonb_array_length(v_affected_params) = 0 THEN
    RETURN NULL;
  END IF;

  -- Определяем серьезность
  IF p_severity IS NULL THEN
    IF v_has_critical THEN
      v_severity := CASE 
        WHEN v_exceeded_count >= 3 THEN 'critical'
        WHEN v_exceeded_count >= 2 THEN 'high'
        ELSE 'high'
      END;
    ELSE
      v_severity := 'medium';
    END IF;
  ELSE
    v_severity := p_severity;
  END IF;

  -- Определяем тип инцидента
  IF p_incident_type IS NULL THEN
    IF v_exceeded_count >= 3 THEN
      p_incident_type := 'multiple_exceeded';
    ELSIF v_has_critical THEN
      p_incident_type := 'critical_exceeded';
    ELSE
      p_incident_type := 'exceeded_norm';
    END IF;
  END IF;

  -- Формируем заголовок
  IF p_title IS NULL THEN
    v_title := format('Превышение нормативов качества воды (%s параметр(ов))', v_exceeded_count);
  ELSE
    v_title := p_title;
  END IF;

  -- Формируем описание
  IF p_description IS NULL THEN
    v_description := format(
      'Обнаружено превышение нормативов качества воды в анализе от %s. Затронуто параметров: %s',
      v_analysis.sample_date::date,
      v_exceeded_count
    );
  ELSE
    v_description := p_description;
  END IF;

  -- Создаем инцидент
  INSERT INTO public.water_quality_incidents (
    analysis_id,
    sampling_point_id,
    equipment_id,
    incident_type,
    title,
    description,
    affected_parameters,
    status,
    severity,
    occurred_at,
    detected_at
  ) VALUES (
    p_analysis_id,
    v_analysis.sampling_point_id,
    v_analysis.equipment_id,
    p_incident_type,
    v_title,
    v_description,
    v_affected_params,
    'open',
    v_severity,
    v_analysis.sample_date,
    NOW()
  ) RETURNING id INTO v_incident_id;

  RETURN v_incident_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_incident_for_analysis IS 'Создать инцидент для анализа с превышениями нормативов';

-- ============================================================================
-- 6. ТРИГГЕР: Автоматическая генерация предупреждений при проверке соответствия
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_generate_alert_on_compliance_check()
RETURNS TRIGGER AS $$
BEGIN
  -- Генерируем предупреждение, если статус превышения или предупреждения
  IF NEW.compliance_status IN ('exceeded', 'warning') THEN
    PERFORM generate_alert_for_result(NEW.id, NEW.compliance_status);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION auto_generate_alert_on_compliance_check IS 'Автоматически генерировать предупреждение при проверке соответствия';

-- Создаем триггер
DROP TRIGGER IF EXISTS trigger_auto_generate_alert ON public.analysis_results;
CREATE TRIGGER trigger_auto_generate_alert
  AFTER INSERT OR UPDATE OF compliance_status ON public.analysis_results
  FOR EACH ROW
  WHEN (NEW.compliance_status IN ('exceeded', 'warning'))
  EXECUTE FUNCTION auto_generate_alert_on_compliance_check();

-- ============================================================================
-- 7. ТРИГГЕР: Автоматическое обновление updated_at для инцидентов
-- ============================================================================

CREATE TRIGGER update_water_quality_incidents_updated_at
  BEFORE UPDATE ON public.water_quality_incidents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 8. RLS ПОЛИТИКИ
-- ============================================================================

ALTER TABLE public.water_quality_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.water_quality_incidents ENABLE ROW LEVEL SECURITY;

-- Политика: Все авторизованные пользователи могут читать
CREATE POLICY "Users can read water_quality_alerts" ON public.water_quality_alerts
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can read water_quality_incidents" ON public.water_quality_incidents
  FOR SELECT USING (auth.role() = 'authenticated');

-- Политика: Авторизованные пользователи могут создавать/изменять
-- (Детальные политики нужно настроить в зависимости от требований к правам доступа)

-- ============================================================================
-- КОНЕЦ МИГРАЦИИ
-- ============================================================================

-- Для отката миграции выполните:
-- DROP TRIGGER IF EXISTS trigger_auto_generate_alert ON public.analysis_results;
-- DROP TRIGGER IF EXISTS update_water_quality_incidents_updated_at ON public.water_quality_incidents;
-- DROP FUNCTION IF EXISTS auto_generate_alert_on_compliance_check() CASCADE;
-- DROP FUNCTION IF EXISTS create_incident_for_analysis(UUID, TEXT, TEXT, TEXT, TEXT) CASCADE;
-- DROP FUNCTION IF EXISTS generate_alert_for_result(UUID, TEXT) CASCADE;
-- DROP FUNCTION IF EXISTS evaluate_result_against_norm(UUID) CASCADE;
-- DROP TABLE IF EXISTS public.water_quality_incidents CASCADE;
-- DROP TABLE IF EXISTS public.water_quality_alerts CASCADE;
