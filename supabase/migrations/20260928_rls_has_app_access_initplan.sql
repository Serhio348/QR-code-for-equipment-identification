/**
 * 20260928_rls_has_app_access_initplan.sql
 *
 * SEC-05 уже применён с вызовом has_app_access() на каждую строку.
 * У роли authenticated statement_timeout = 8s, поэтому выборка
 * beliot_daily_readings_agg для обычного пользователя обрывается,
 * а админ (ранний выход из is_admin) успевает.
 *
 * Скалярный подзапрос считает доступ один раз на запрос.
 */

-- ============================================
-- beliot_device_readings (SELECT)
-- ============================================

DROP POLICY IF EXISTS "Water users can read readings" ON public.beliot_device_readings;

CREATE POLICY "Water users can read readings"
  ON public.beliot_device_readings
  FOR SELECT
  TO authenticated
  USING ((SELECT public.has_app_access('water')));

-- ============================================
-- beliot_device_overrides (SELECT)
-- ============================================

DROP POLICY IF EXISTS "Water users can view overrides" ON public.beliot_device_overrides;

CREATE POLICY "Water users can view overrides"
  ON public.beliot_device_overrides
  FOR SELECT
  TO authenticated
  USING ((SELECT public.has_app_access('water')));

-- ============================================
-- water_production_day_summaries (SELECT)
-- ============================================

DROP POLICY IF EXISTS "Water users can read production day summaries"
  ON public.water_production_day_summaries;

CREATE POLICY "Water users can read production day summaries"
  ON public.water_production_day_summaries
  FOR SELECT
  TO authenticated
  USING ((SELECT public.has_app_access('water')));

DROP POLICY IF EXISTS "Only admins can modify production day summaries"
  ON public.water_production_day_summaries;
DROP POLICY IF EXISTS "Water users can insert production day summaries"
  ON public.water_production_day_summaries;
DROP POLICY IF EXISTS "Water users can update production day summaries"
  ON public.water_production_day_summaries;
DROP POLICY IF EXISTS "Admins can delete production day summaries"
  ON public.water_production_day_summaries;

CREATE POLICY "Water users can insert production day summaries"
  ON public.water_production_day_summaries FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.has_app_access('water')));

CREATE POLICY "Water users can update production day summaries"
  ON public.water_production_day_summaries FOR UPDATE
  TO authenticated
  USING ((SELECT public.has_app_access('water')))
  WITH CHECK ((SELECT public.has_app_access('water')));

CREATE POLICY "Admins can delete production day summaries"
  ON public.water_production_day_summaries FOR DELETE
  TO authenticated
  USING ((SELECT public.is_admin()));

-- ============================================
-- sampling_points
-- ============================================

DROP POLICY IF EXISTS "Water users can read sampling_points" ON public.sampling_points;
DROP POLICY IF EXISTS "Water users can insert sampling_points" ON public.sampling_points;
DROP POLICY IF EXISTS "Water users can update sampling_points" ON public.sampling_points;
DROP POLICY IF EXISTS "Water users can delete sampling_points" ON public.sampling_points;
DROP POLICY IF EXISTS "Admins can insert sampling_points" ON public.sampling_points;
DROP POLICY IF EXISTS "Admins can update sampling_points" ON public.sampling_points;
DROP POLICY IF EXISTS "Admins can delete sampling_points" ON public.sampling_points;

CREATE POLICY "Water users can read sampling_points"
  ON public.sampling_points FOR SELECT TO authenticated
  USING ((SELECT public.has_app_access('water')));

CREATE POLICY "Admins can insert sampling_points"
  ON public.sampling_points FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "Admins can update sampling_points"
  ON public.sampling_points FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "Admins can delete sampling_points"
  ON public.sampling_points FOR DELETE TO authenticated
  USING ((SELECT public.is_admin()));

-- ============================================
-- water_analysis
-- ============================================

DROP POLICY IF EXISTS "Water users can read water_analysis" ON public.water_analysis;
DROP POLICY IF EXISTS "Water users can insert water_analysis" ON public.water_analysis;
DROP POLICY IF EXISTS "Water users can update water_analysis" ON public.water_analysis;
DROP POLICY IF EXISTS "Water users can delete water_analysis" ON public.water_analysis;

CREATE POLICY "Water users can read water_analysis"
  ON public.water_analysis FOR SELECT TO authenticated
  USING ((SELECT public.has_app_access('water')));

CREATE POLICY "Water users can insert water_analysis"
  ON public.water_analysis FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_app_access('water')));

CREATE POLICY "Water users can update water_analysis"
  ON public.water_analysis FOR UPDATE TO authenticated
  USING ((SELECT public.has_app_access('water')))
  WITH CHECK ((SELECT public.has_app_access('water')));

CREATE POLICY "Water users can delete water_analysis"
  ON public.water_analysis FOR DELETE TO authenticated
  USING ((SELECT public.has_app_access('water')));

-- ============================================
-- analysis_results
-- ============================================

DROP POLICY IF EXISTS "Water users can read analysis_results" ON public.analysis_results;
DROP POLICY IF EXISTS "Water users can insert analysis_results" ON public.analysis_results;
DROP POLICY IF EXISTS "Water users can update analysis_results" ON public.analysis_results;
DROP POLICY IF EXISTS "Water users can delete analysis_results" ON public.analysis_results;

CREATE POLICY "Water users can read analysis_results"
  ON public.analysis_results FOR SELECT TO authenticated
  USING ((SELECT public.has_app_access('water')));

CREATE POLICY "Water users can insert analysis_results"
  ON public.analysis_results FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_app_access('water')));

CREATE POLICY "Water users can update analysis_results"
  ON public.analysis_results FOR UPDATE TO authenticated
  USING ((SELECT public.has_app_access('water')))
  WITH CHECK ((SELECT public.has_app_access('water')));

CREATE POLICY "Water users can delete analysis_results"
  ON public.analysis_results FOR DELETE TO authenticated
  USING ((SELECT public.has_app_access('water')));

-- ============================================
-- water_quality_norms
-- ============================================

DROP POLICY IF EXISTS "Water users can read water_quality_norms" ON public.water_quality_norms;
DROP POLICY IF EXISTS "Water users can insert water_quality_norms" ON public.water_quality_norms;
DROP POLICY IF EXISTS "Water users can update water_quality_norms" ON public.water_quality_norms;
DROP POLICY IF EXISTS "Water users can delete water_quality_norms" ON public.water_quality_norms;
DROP POLICY IF EXISTS "Admins can insert water_quality_norms" ON public.water_quality_norms;
DROP POLICY IF EXISTS "Admins can update water_quality_norms" ON public.water_quality_norms;
DROP POLICY IF EXISTS "Admins can delete water_quality_norms" ON public.water_quality_norms;

CREATE POLICY "Water users can read water_quality_norms"
  ON public.water_quality_norms FOR SELECT TO authenticated
  USING ((SELECT public.has_app_access('water')));

CREATE POLICY "Admins can insert water_quality_norms"
  ON public.water_quality_norms FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "Admins can update water_quality_norms"
  ON public.water_quality_norms FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "Admins can delete water_quality_norms"
  ON public.water_quality_norms FOR DELETE TO authenticated
  USING ((SELECT public.is_admin()));
