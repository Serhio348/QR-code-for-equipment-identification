-- ============================================================================
-- МИГРАЦИЯ: Дополнительные индексы для оптимизации запросов
-- Версия: 2.1
-- Дата: 2024
-- ============================================================================
-- 
-- Эта миграция добавляет индексы для улучшения производительности запросов
-- с фильтрацией по часто используемым полям.
-- ============================================================================

-- ============================================================================
-- ИНДЕКСЫ ДЛЯ water_analysis
-- ============================================================================

-- Индекс для фильтрации по пункту отбора проб (уже существует, но проверим)
-- CREATE INDEX IF NOT EXISTS idx_water_analysis_sampling_point ON public.water_analysis(sampling_point_id);
-- Примечание: Индекс idx_analysis_sampling_point уже существует в основной миграции

-- Индекс для фильтрации по статусу (уже существует, но проверим)
-- CREATE INDEX IF NOT EXISTS idx_water_analysis_status ON public.water_analysis(status);
-- Примечание: Индекс idx_analysis_status уже существует в основной миграции

-- Индекс для фильтрации по дате отбора пробы (уже существует, но проверим)
-- CREATE INDEX IF NOT EXISTS idx_water_analysis_sample_date ON public.water_analysis(sample_date);
-- Примечание: Индекс idx_analysis_date уже существует в основной миграции

-- Композитный индекс для частого запроса: пункт отбора + статус + дата
CREATE INDEX IF NOT EXISTS idx_water_analysis_sampling_point_status_date 
  ON public.water_analysis(sampling_point_id, status, sample_date DESC);

-- Индекс для фильтрации по дате анализа (для сортировки)
CREATE INDEX IF NOT EXISTS idx_water_analysis_analysis_date 
  ON public.water_analysis(analysis_date DESC) 
  WHERE analysis_date IS NOT NULL;

-- Индекс для фильтрации по оборудованию + дата (если часто используется)
CREATE INDEX IF NOT EXISTS idx_water_analysis_equipment_date 
  ON public.water_analysis(equipment_id, sample_date DESC) 
  WHERE equipment_id IS NOT NULL;

-- ============================================================================
-- ИНДЕКСЫ ДЛЯ analysis_results
-- ============================================================================

-- Композитный индекс для фильтрации по анализу и параметру (для быстрого поиска)
CREATE INDEX IF NOT EXISTS idx_analysis_results_analysis_parameter 
  ON public.analysis_results(analysis_id, parameter_name);

-- Индекс для фильтрации по значению (для поиска отклонений)
CREATE INDEX IF NOT EXISTS idx_analysis_results_value 
  ON public.analysis_results(value) 
  WHERE value IS NOT NULL;

-- Композитный индекс для фильтрации по параметру и значению (для поиска по диапазону)
CREATE INDEX IF NOT EXISTS idx_analysis_results_parameter_value 
  ON public.analysis_results(parameter_name, value);

-- ============================================================================
-- ИНДЕКСЫ ДЛЯ sampling_points
-- ============================================================================

-- Композитный индекс для активных точек с сортировкой по имени
CREATE INDEX IF NOT EXISTS idx_sampling_points_active_name 
  ON public.sampling_points(is_active, name) 
  WHERE is_active = true;

-- ============================================================================
-- ИНДЕКСЫ ДЛЯ water_quality_norms
-- ============================================================================

-- Композитный индекс для поиска нормативов по точке и параметру
CREATE INDEX IF NOT EXISTS idx_water_quality_norms_point_parameter 
  ON public.water_quality_norms(sampling_point_id, parameter_name) 
  WHERE sampling_point_id IS NOT NULL;

-- Композитный индекс для поиска нормативов по оборудованию и параметру
CREATE INDEX IF NOT EXISTS idx_water_quality_norms_equipment_parameter 
  ON public.water_quality_norms(equipment_id, parameter_name) 
  WHERE equipment_id IS NOT NULL;

-- Индекс для активных нормативов
CREATE INDEX IF NOT EXISTS idx_water_quality_norms_active_parameter 
  ON public.water_quality_norms(is_active, parameter_name) 
  WHERE is_active = true;

-- ============================================================================
-- АНАЛИЗ ПРОИЗВОДИТЕЛЬНОСТИ
-- ============================================================================

-- После создания индексов рекомендуется выполнить ANALYZE для обновления статистики:
-- ANALYZE public.water_analysis;
-- ANALYZE public.analysis_results;
-- ANALYZE public.sampling_points;
-- ANALYZE public.water_quality_norms;

-- ============================================================================
-- ПРИМЕЧАНИЯ
-- ============================================================================
-- 1. Индексы с WHERE условиями (partial indexes) более эффективны для фильтров
-- 2. Композитные индексы помогают при запросах с несколькими условиями
-- 3. Индексы на DESC колонках оптимизируют сортировку по убыванию
-- 4. Регулярно проверяйте использование индексов через EXPLAIN ANALYZE
-- 5. При необходимости удаляйте неиспользуемые индексы для экономии места

-- ============================================================================
-- КОНЕЦ МИГРАЦИИ
-- ============================================================================
