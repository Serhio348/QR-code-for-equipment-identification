-- ============================================================================
-- МИГРАЦИЯ: Добавление связи нормативов с результатами измерений
-- Версия: 2.2
-- Дата: 2024
-- ============================================================================
-- 
-- Эта миграция добавляет поля для хранения статуса соответствия результатов
-- измерений нормативам и автоматическую проверку превышений.
-- ============================================================================

-- ============================================================================
-- 1. ДОБАВЛЕНИЕ ПОЛЕЙ В analysis_results
-- ============================================================================

-- Добавляем поля для статуса соответствия нормативам
ALTER TABLE public.analysis_results
  ADD COLUMN IF NOT EXISTS compliance_status TEXT CHECK (compliance_status IN ('optimal', 'normal', 'warning', 'exceeded', 'unknown')),
  ADD COLUMN IF NOT EXISTS norm_id UUID REFERENCES public.water_quality_norms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deviation_percent DECIMAL(10, 4),
  ADD COLUMN IF NOT EXISTS checked_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS compliance_details JSONB DEFAULT '{}'::jsonb;

-- Комментарии к новым полям
COMMENT ON COLUMN public.analysis_results.compliance_status IS 'Статус соответствия нормативам: optimal (оптимально), normal (норма), warning (предупреждение), exceeded (превышение), unknown (не проверено)';
COMMENT ON COLUMN public.analysis_results.norm_id IS 'ID норматива, использованного для проверки';
COMMENT ON COLUMN public.analysis_results.deviation_percent IS 'Процент отклонения от оптимального значения (положительный - превышение, отрицательный - ниже нормы)';
COMMENT ON COLUMN public.analysis_results.checked_at IS 'Время последней проверки соответствия нормативам';
COMMENT ON COLUMN public.analysis_results.compliance_details IS 'Детали проверки: {optimalRange, allowedRange, warningRange, deviation, message}';

-- Индекс для быстрого поиска по статусу соответствия
CREATE INDEX IF NOT EXISTS idx_results_compliance_status 
  ON public.analysis_results(compliance_status) 
  WHERE compliance_status IS NOT NULL;

-- Индекс для связи с нормативами
CREATE INDEX IF NOT EXISTS idx_results_norm_id 
  ON public.analysis_results(norm_id) 
  WHERE norm_id IS NOT NULL;

-- ============================================================================
-- 2. ФУНКЦИЯ ДЛЯ ПОЛУЧЕНИЯ НОРМАТИВА ДЛЯ ПРОВЕРКИ
-- ============================================================================

CREATE OR REPLACE FUNCTION get_applicable_norm(
  p_sampling_point_id UUID,
  p_equipment_id TEXT,
  p_parameter_name TEXT
) RETURNS TABLE (
  id UUID,
  sampling_point_id UUID,
  equipment_id TEXT,
  parameter_name TEXT,
  optimal_min DECIMAL(10, 4),
  optimal_max DECIMAL(10, 4),
  min_allowed DECIMAL(10, 4),
  max_allowed DECIMAL(10, 4),
  warning_min DECIMAL(10, 4),
  warning_max DECIMAL(10, 4),
  unit TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    n.id,
    n.sampling_point_id,
    n.equipment_id,
    n.parameter_name,
    n.optimal_min,
    n.optimal_max,
    n.min_allowed,
    n.max_allowed,
    n.warning_min,
    n.warning_max,
    n.unit
  FROM public.water_quality_norms n
  WHERE n.parameter_name = p_parameter_name
    AND n.is_active = true
    AND (
      -- Приоритет 1: Норматив для конкретной точки отбора проб
      (p_sampling_point_id IS NOT NULL AND n.sampling_point_id = p_sampling_point_id)
      OR
      -- Приоритет 2: Норматив для конкретного оборудования
      (p_equipment_id IS NOT NULL AND n.equipment_id = p_equipment_id AND n.sampling_point_id IS NULL)
      OR
      -- Приоритет 3: Глобальный норматив (для всех точек и оборудования)
      (n.sampling_point_id IS NULL AND n.equipment_id IS NULL)
    )
  ORDER BY
    -- Приоритет: сначала специфичные нормативы
    CASE 
      WHEN n.sampling_point_id IS NOT NULL THEN 1
      WHEN n.equipment_id IS NOT NULL THEN 2
      ELSE 3
    END
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_applicable_norm IS 'Получить применимый норматив для проверки результата измерения. Приоритет: точка отбора проб > оборудование > глобальный';

-- ============================================================================
-- 3. ФУНКЦИЯ ДЛЯ ПРОВЕРКИ СООТВЕТСТВИЯ НОРМАТИВАМ
-- ============================================================================

CREATE OR REPLACE FUNCTION check_norm_compliance(
  p_result_id UUID,
  p_value DECIMAL(10, 4),
  p_unit TEXT,
  p_sampling_point_id UUID,
  p_equipment_id TEXT,
  p_parameter_name TEXT
) RETURNS JSONB AS $$
DECLARE
  v_norm RECORD;
  v_status TEXT;
  v_deviation_percent DECIMAL(10, 4);
  v_details JSONB;
  v_optimal_center DECIMAL(10, 4);
BEGIN
  -- Получаем применимый норматив
  SELECT * INTO v_norm
  FROM get_applicable_norm(p_sampling_point_id, p_equipment_id, p_parameter_name);

  -- Если норматив не найден
  IF v_norm IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'unknown',
      'message', 'Норматив для данного параметра не найден',
      'norm_id', NULL,
      'deviation_percent', NULL
    );
  END IF;

  -- Проверяем единицы измерения
  IF v_norm.unit != p_unit THEN
    RETURN jsonb_build_object(
      'status', 'unknown',
      'message', format('Несоответствие единиц измерения: норматив в %s, результат в %s', v_norm.unit, p_unit),
      'norm_id', v_norm.id,
      'deviation_percent', NULL
    );
  END IF;

  -- Вычисляем центр оптимального диапазона для расчета отклонения
  IF v_norm.optimal_min IS NOT NULL AND v_norm.optimal_max IS NOT NULL THEN
    v_optimal_center := (v_norm.optimal_min + v_norm.optimal_max) / 2.0;
    IF v_optimal_center > 0 THEN
      v_deviation_percent := ((p_value - v_optimal_center) / v_optimal_center) * 100;
    ELSE
      v_deviation_percent := NULL;
    END IF;
  ELSE
    v_deviation_percent := NULL;
  END IF;

  -- Определяем статус соответствия
  -- 1. Превышение допустимых значений (критично)
  IF (v_norm.max_allowed IS NOT NULL AND p_value > v_norm.max_allowed) OR
     (v_norm.min_allowed IS NOT NULL AND p_value < v_norm.min_allowed) THEN
    v_status := 'exceeded';
    v_details := jsonb_build_object(
      'optimalRange', jsonb_build_object('min', v_norm.optimal_min, 'max', v_norm.optimal_max),
      'allowedRange', jsonb_build_object('min', v_norm.min_allowed, 'max', v_norm.max_allowed),
      'warningRange', jsonb_build_object('min', v_norm.warning_min, 'max', v_norm.warning_max),
      'value', p_value,
      'deviation', v_deviation_percent,
      'message', format('Превышение допустимых значений: %s %s (допустимо: %s - %s %s)', 
        p_value, p_unit, 
        COALESCE(v_norm.min_allowed::text, 'не ограничено'), 
        COALESCE(v_norm.max_allowed::text, 'не ограничено'), 
        p_unit)
    );
  -- 2. Предупреждение (близко к границам)
  ELSIF (v_norm.warning_max IS NOT NULL AND p_value > v_norm.warning_max) OR
        (v_norm.warning_min IS NOT NULL AND p_value < v_norm.warning_min) THEN
    v_status := 'warning';
    v_details := jsonb_build_object(
      'optimalRange', jsonb_build_object('min', v_norm.optimal_min, 'max', v_norm.optimal_max),
      'allowedRange', jsonb_build_object('min', v_norm.min_allowed, 'max', v_norm.max_allowed),
      'warningRange', jsonb_build_object('min', v_norm.warning_min, 'max', v_norm.warning_max),
      'value', p_value,
      'deviation', v_deviation_percent,
      'message', format('Значение близко к границам нормы: %s %s (оптимально: %s - %s %s)', 
        p_value, p_unit, 
        COALESCE(v_norm.optimal_min::text, 'не ограничено'), 
        COALESCE(v_norm.optimal_max::text, 'не ограничено'), 
        p_unit)
    );
  -- 3. Оптимальное значение
  ELSIF (v_norm.optimal_min IS NOT NULL AND v_norm.optimal_max IS NOT NULL) AND
        (p_value >= v_norm.optimal_min AND p_value <= v_norm.optimal_max) THEN
    v_status := 'optimal';
    v_details := jsonb_build_object(
      'optimalRange', jsonb_build_object('min', v_norm.optimal_min, 'max', v_norm.optimal_max),
      'allowedRange', jsonb_build_object('min', v_norm.min_allowed, 'max', v_norm.max_allowed),
      'warningRange', jsonb_build_object('min', v_norm.warning_min, 'max', v_norm.warning_max),
      'value', p_value,
      'deviation', v_deviation_percent,
      'message', format('Значение в оптимальном диапазоне: %s %s', p_value, p_unit)
    );
  -- 4. Норма (в допустимом диапазоне, но не оптимально)
  ELSIF (v_norm.min_allowed IS NOT NULL AND v_norm.max_allowed IS NOT NULL) AND
        (p_value >= v_norm.min_allowed AND p_value <= v_norm.max_allowed) THEN
    v_status := 'normal';
    v_details := jsonb_build_object(
      'optimalRange', jsonb_build_object('min', v_norm.optimal_min, 'max', v_norm.optimal_max),
      'allowedRange', jsonb_build_object('min', v_norm.min_allowed, 'max', v_norm.max_allowed),
      'warningRange', jsonb_build_object('min', v_norm.warning_min, 'max', v_norm.warning_max),
      'value', p_value,
      'deviation', v_deviation_percent,
      'message', format('Значение в допустимом диапазоне: %s %s (оптимально: %s - %s %s)', 
        p_value, p_unit, 
        COALESCE(v_norm.optimal_min::text, 'не ограничено'), 
        COALESCE(v_norm.optimal_max::text, 'не ограничено'), 
        p_unit)
    );
  -- 5. Неизвестно (нет нормативов для проверки)
  ELSE
    v_status := 'unknown';
    v_details := jsonb_build_object(
      'optimalRange', jsonb_build_object('min', v_norm.optimal_min, 'max', v_norm.optimal_max),
      'allowedRange', jsonb_build_object('min', v_norm.min_allowed, 'max', v_norm.max_allowed),
      'warningRange', jsonb_build_object('min', v_norm.warning_min, 'max', v_norm.warning_max),
      'value', p_value,
      'deviation', v_deviation_percent,
      'message', 'Не удалось определить статус соответствия'
    );
  END IF;

  -- Обновляем запись результата
  UPDATE public.analysis_results
  SET 
    compliance_status = v_status,
    norm_id = v_norm.id,
    deviation_percent = v_deviation_percent,
    checked_at = NOW(),
    compliance_details = v_details
  WHERE id = p_result_id;

  -- Возвращаем результат проверки
  RETURN jsonb_build_object(
    'status', v_status,
    'norm_id', v_norm.id,
    'deviation_percent', v_deviation_percent,
    'details', v_details
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_norm_compliance IS 'Проверить соответствие результата измерения нормативам и обновить статус';

-- ============================================================================
-- 4. ТРИГГЕР ДЛЯ АВТОМАТИЧЕСКОЙ ПРОВЕРКИ ПРИ СОЗДАНИИ/ОБНОВЛЕНИИ РЕЗУЛЬТАТОВ
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_check_norm_compliance()
RETURNS TRIGGER AS $$
DECLARE
  v_analysis RECORD;
BEGIN
  -- Получаем информацию об анализе для определения точки отбора проб и оборудования
  SELECT 
    wa.sampling_point_id,
    wa.equipment_id
  INTO v_analysis
  FROM public.water_analysis wa
  WHERE wa.id = NEW.analysis_id;

  -- Выполняем проверку соответствия нормативам
  PERFORM check_norm_compliance(
    NEW.id,
    NEW.value,
    NEW.unit,
    v_analysis.sampling_point_id,
    v_analysis.equipment_id,
    NEW.parameter_name
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION auto_check_norm_compliance IS 'Автоматическая проверка соответствия нормативам при создании/обновлении результата';

-- Создаем триггер
DROP TRIGGER IF EXISTS trigger_auto_check_norm_compliance ON public.analysis_results;
CREATE TRIGGER trigger_auto_check_norm_compliance
  AFTER INSERT OR UPDATE OF value, unit, parameter_name ON public.analysis_results
  FOR EACH ROW
  EXECUTE FUNCTION auto_check_norm_compliance();

-- ============================================================================
-- 5. ФУНКЦИЯ ДЛЯ ПЕРЕПРОВЕРКИ ВСЕХ РЕЗУЛЬТАТОВ (при изменении нормативов)
-- ============================================================================

CREATE OR REPLACE FUNCTION recheck_all_results_for_parameter(
  p_parameter_name TEXT
) RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_result RECORD;
  v_analysis RECORD;
BEGIN
  -- Перепроверяем все результаты для указанного параметра
  FOR v_result IN 
    SELECT ar.id, ar.analysis_id, ar.value, ar.unit, ar.parameter_name
    FROM public.analysis_results ar
    WHERE ar.parameter_name = p_parameter_name
  LOOP
    -- Получаем информацию об анализе
    SELECT 
      wa.sampling_point_id,
      wa.equipment_id
    INTO v_analysis
    FROM public.water_analysis wa
    WHERE wa.id = v_result.analysis_id;

    -- Выполняем проверку
    PERFORM check_norm_compliance(
      v_result.id,
      v_result.value,
      v_result.unit,
      v_analysis.sampling_point_id,
      v_analysis.equipment_id,
      v_result.parameter_name
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION recheck_all_results_for_parameter IS 'Перепроверить все результаты измерений для указанного параметра (используется при изменении нормативов)';

-- ============================================================================
-- 6. ТРИГГЕР ДЛЯ ПЕРЕПРОВЕРКИ ПРИ ИЗМЕНЕНИИ НОРМАТИВОВ
-- ============================================================================

CREATE OR REPLACE FUNCTION recheck_results_on_norm_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Перепроверяем все результаты для измененного параметра
  PERFORM recheck_all_results_for_parameter(
    COALESCE(NEW.parameter_name, OLD.parameter_name)
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION recheck_results_on_norm_change IS 'Перепроверить результаты при изменении нормативов';

-- Создаем триггер
DROP TRIGGER IF EXISTS trigger_recheck_results_on_norm_change ON public.water_quality_norms;
CREATE TRIGGER trigger_recheck_results_on_norm_change
  AFTER INSERT OR UPDATE OF optimal_min, optimal_max, min_allowed, max_allowed, warning_min, warning_max, is_active ON public.water_quality_norms
  FOR EACH ROW
  WHEN (NEW.is_active = true)
  EXECUTE FUNCTION recheck_results_on_norm_change();

-- ============================================================================
-- КОНЕЦ МИГРАЦИИ
-- ============================================================================

-- Для отката миграции выполните:
-- DROP TRIGGER IF EXISTS trigger_recheck_results_on_norm_change ON public.water_quality_norms;
-- DROP TRIGGER IF EXISTS trigger_auto_check_norm_compliance ON public.analysis_results;
-- DROP FUNCTION IF EXISTS recheck_results_on_norm_change() CASCADE;
-- DROP FUNCTION IF EXISTS recheck_all_results_for_parameter(TEXT) CASCADE;
-- DROP FUNCTION IF EXISTS auto_check_norm_compliance() CASCADE;
-- DROP FUNCTION IF EXISTS check_norm_compliance(UUID, DECIMAL, TEXT, UUID, TEXT, TEXT) CASCADE;
-- DROP FUNCTION IF EXISTS get_applicable_norm(UUID, TEXT, TEXT) CASCADE;
-- ALTER TABLE public.analysis_results 
--   DROP COLUMN IF EXISTS compliance_status,
--   DROP COLUMN IF EXISTS norm_id,
--   DROP COLUMN IF EXISTS deviation_percent,
--   DROP COLUMN IF EXISTS checked_at,
--   DROP COLUMN IF EXISTS compliance_details;
