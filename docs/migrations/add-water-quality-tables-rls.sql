-- ============================================================================
-- МИГРАЦИЯ: Добавление RLS политик для таблиц качества воды (INSERT/UPDATE/DELETE)
-- Версия: 2.0
-- Дата: 2024
-- ============================================================================
-- 
-- Эта миграция добавляет политики INSERT, UPDATE и DELETE для таблиц:
-- - sampling_points
-- - water_analysis
-- - analysis_results
--
-- Политики для water_quality_norms уже добавлены в add-water-quality-norms-rls.sql
-- ============================================================================

-- ============================================================================
-- 1. ПОЛИТИКИ ДЛЯ sampling_points
-- ============================================================================

-- Убеждаемся, что RLS включен
ALTER TABLE public.sampling_points ENABLE ROW LEVEL SECURITY;

-- INSERT: Авторизованные пользователи могут создавать точки отбора проб
DROP POLICY IF EXISTS "Users can insert sampling_points" ON public.sampling_points;
CREATE POLICY "Users can insert sampling_points" ON public.sampling_points
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- UPDATE: Авторизованные пользователи могут изменять точки отбора проб
DROP POLICY IF EXISTS "Users can update sampling_points" ON public.sampling_points;
CREATE POLICY "Users can update sampling_points" ON public.sampling_points
  FOR UPDATE USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- DELETE: Авторизованные пользователи могут удалять точки отбора проб
DROP POLICY IF EXISTS "Users can delete sampling_points" ON public.sampling_points;
CREATE POLICY "Users can delete sampling_points" ON public.sampling_points
  FOR DELETE USING (auth.role() = 'authenticated');

-- ============================================================================
-- 2. ПОЛИТИКИ ДЛЯ water_analysis
-- ============================================================================

-- Убеждаемся, что RLS включен
ALTER TABLE public.water_analysis ENABLE ROW LEVEL SECURITY;

-- INSERT: Авторизованные пользователи могут создавать анализы
DROP POLICY IF EXISTS "Users can insert water_analysis" ON public.water_analysis;
CREATE POLICY "Users can insert water_analysis" ON public.water_analysis
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- UPDATE: Авторизованные пользователи могут изменять анализы
DROP POLICY IF EXISTS "Users can update water_analysis" ON public.water_analysis;
CREATE POLICY "Users can update water_analysis" ON public.water_analysis
  FOR UPDATE USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- DELETE: Авторизованные пользователи могут удалять анализы
DROP POLICY IF EXISTS "Users can delete water_analysis" ON public.water_analysis;
CREATE POLICY "Users can delete water_analysis" ON public.water_analysis
  FOR DELETE USING (auth.role() = 'authenticated');

-- ============================================================================
-- 3. ПОЛИТИКИ ДЛЯ analysis_results
-- ============================================================================

-- Убеждаемся, что RLS включен
ALTER TABLE public.analysis_results ENABLE ROW LEVEL SECURITY;

-- INSERT: Авторизованные пользователи могут создавать результаты
DROP POLICY IF EXISTS "Users can insert analysis_results" ON public.analysis_results;
CREATE POLICY "Users can insert analysis_results" ON public.analysis_results
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- UPDATE: Авторизованные пользователи могут изменять результаты
DROP POLICY IF EXISTS "Users can update analysis_results" ON public.analysis_results;
CREATE POLICY "Users can update analysis_results" ON public.analysis_results
  FOR UPDATE USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- DELETE: Авторизованные пользователи могут удалять результаты
DROP POLICY IF EXISTS "Users can delete analysis_results" ON public.analysis_results;
CREATE POLICY "Users can delete analysis_results" ON public.analysis_results
  FOR DELETE USING (auth.role() = 'authenticated');

-- ============================================================================
-- КОНЕЦ МИГРАЦИИ
-- ============================================================================
--
-- Для отката миграции выполните:
-- DROP POLICY IF EXISTS "Users can insert sampling_points" ON public.sampling_points;
-- DROP POLICY IF EXISTS "Users can update sampling_points" ON public.sampling_points;
-- DROP POLICY IF EXISTS "Users can delete sampling_points" ON public.sampling_points;
-- DROP POLICY IF EXISTS "Users can insert water_analysis" ON public.water_analysis;
-- DROP POLICY IF EXISTS "Users can update water_analysis" ON public.water_analysis;
-- DROP POLICY IF EXISTS "Users can delete water_analysis" ON public.water_analysis;
-- DROP POLICY IF EXISTS "Users can insert analysis_results" ON public.analysis_results;
-- DROP POLICY IF EXISTS "Users can update analysis_results" ON public.analysis_results;
-- DROP POLICY IF EXISTS "Users can delete analysis_results" ON public.analysis_results;
