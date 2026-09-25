/**
 * 20260925_sec05_app_access_rls.sql
 *
 * SEC-05: единая проверка доступа к разделам (equipment / water) в RLS.
 *
 * Что меняет:
 * 1. public.has_app_access(app) — admin OR user_app_access.<app> = true
 * 2. beliot_device_readings / overrides / production summaries — SELECT только water
 * 3. sampling_points, water_analysis, analysis_results, water_quality_norms —
 *    SELECT/INSERT/UPDATE/DELETE только water (вместо любого authenticated)
 */

-- ============================================
-- has_app_access
-- ============================================

CREATE OR REPLACE FUNCTION public.has_app_access(p_app TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_admin() THEN
    RETURN true;
  END IF;

  IF p_app = 'water' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.user_app_access AS access
      WHERE access.user_id = auth.uid()
        AND access.water = true
    );
  END IF;

  IF p_app = 'equipment' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.user_app_access AS access
      WHERE access.user_id = auth.uid()
        AND access.equipment = true
    );
  END IF;

  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.has_app_access(TEXT) IS
  'SEC-05: true если admin или user_app_access для app (water|equipment).';

GRANT EXECUTE ON FUNCTION public.has_app_access(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_app_access(TEXT) TO service_role;

-- ============================================
-- beliot_device_readings (SELECT)
-- ============================================

DROP POLICY IF EXISTS "Users can read readings" ON public.beliot_device_readings;
DROP POLICY IF EXISTS "Authenticated users can view readings" ON public.beliot_device_readings;

CREATE POLICY "Water users can read readings"
  ON public.beliot_device_readings
  FOR SELECT
  TO authenticated
  USING (public.has_app_access('water'));

-- ============================================
-- beliot_device_overrides (SELECT)
-- ============================================

DROP POLICY IF EXISTS "Authenticated users can view overrides" ON public.beliot_device_overrides;

CREATE POLICY "Water users can view overrides"
  ON public.beliot_device_overrides
  FOR SELECT
  TO authenticated
  USING (public.has_app_access('water'));

-- ============================================
-- water_production_day_summaries (SELECT)
-- ============================================

DROP POLICY IF EXISTS "Authenticated users can read production day summaries"
  ON public.water_production_day_summaries;

CREATE POLICY "Water users can read production day summaries"
  ON public.water_production_day_summaries
  FOR SELECT
  TO authenticated
  USING (public.has_app_access('water'));

-- ============================================
-- sampling_points
-- ============================================

DROP POLICY IF EXISTS "Users can read sampling_points" ON public.sampling_points;
DROP POLICY IF EXISTS "Users can insert sampling_points" ON public.sampling_points;
DROP POLICY IF EXISTS "Users can update sampling_points" ON public.sampling_points;
DROP POLICY IF EXISTS "Users can delete sampling_points" ON public.sampling_points;

CREATE POLICY "Water users can read sampling_points"
  ON public.sampling_points FOR SELECT TO authenticated
  USING (public.has_app_access('water'));

CREATE POLICY "Water users can insert sampling_points"
  ON public.sampling_points FOR INSERT TO authenticated
  WITH CHECK (public.has_app_access('water'));

CREATE POLICY "Water users can update sampling_points"
  ON public.sampling_points FOR UPDATE TO authenticated
  USING (public.has_app_access('water'))
  WITH CHECK (public.has_app_access('water'));

CREATE POLICY "Water users can delete sampling_points"
  ON public.sampling_points FOR DELETE TO authenticated
  USING (public.has_app_access('water'));

-- ============================================
-- water_analysis
-- ============================================

DROP POLICY IF EXISTS "Users can read water_analysis" ON public.water_analysis;
DROP POLICY IF EXISTS "Users can insert water_analysis" ON public.water_analysis;
DROP POLICY IF EXISTS "Users can update water_analysis" ON public.water_analysis;
DROP POLICY IF EXISTS "Users can delete water_analysis" ON public.water_analysis;

CREATE POLICY "Water users can read water_analysis"
  ON public.water_analysis FOR SELECT TO authenticated
  USING (public.has_app_access('water'));

CREATE POLICY "Water users can insert water_analysis"
  ON public.water_analysis FOR INSERT TO authenticated
  WITH CHECK (public.has_app_access('water'));

CREATE POLICY "Water users can update water_analysis"
  ON public.water_analysis FOR UPDATE TO authenticated
  USING (public.has_app_access('water'))
  WITH CHECK (public.has_app_access('water'));

CREATE POLICY "Water users can delete water_analysis"
  ON public.water_analysis FOR DELETE TO authenticated
  USING (public.has_app_access('water'));

-- ============================================
-- analysis_results
-- ============================================

DROP POLICY IF EXISTS "Users can read analysis_results" ON public.analysis_results;
DROP POLICY IF EXISTS "Users can insert analysis_results" ON public.analysis_results;
DROP POLICY IF EXISTS "Users can update analysis_results" ON public.analysis_results;
DROP POLICY IF EXISTS "Users can delete analysis_results" ON public.analysis_results;

CREATE POLICY "Water users can read analysis_results"
  ON public.analysis_results FOR SELECT TO authenticated
  USING (public.has_app_access('water'));

CREATE POLICY "Water users can insert analysis_results"
  ON public.analysis_results FOR INSERT TO authenticated
  WITH CHECK (public.has_app_access('water'));

CREATE POLICY "Water users can update analysis_results"
  ON public.analysis_results FOR UPDATE TO authenticated
  USING (public.has_app_access('water'))
  WITH CHECK (public.has_app_access('water'));

CREATE POLICY "Water users can delete analysis_results"
  ON public.analysis_results FOR DELETE TO authenticated
  USING (public.has_app_access('water'));

-- ============================================
-- water_quality_norms
-- ============================================

DROP POLICY IF EXISTS "Users can read water_quality_norms" ON public.water_quality_norms;
DROP POLICY IF EXISTS "Users can insert water_quality_norms" ON public.water_quality_norms;
DROP POLICY IF EXISTS "Users can update water_quality_norms" ON public.water_quality_norms;
DROP POLICY IF EXISTS "Users can delete water_quality_norms" ON public.water_quality_norms;

CREATE POLICY "Water users can read water_quality_norms"
  ON public.water_quality_norms FOR SELECT TO authenticated
  USING (public.has_app_access('water'));

CREATE POLICY "Water users can insert water_quality_norms"
  ON public.water_quality_norms FOR INSERT TO authenticated
  WITH CHECK (public.has_app_access('water'));

CREATE POLICY "Water users can update water_quality_norms"
  ON public.water_quality_norms FOR UPDATE TO authenticated
  USING (public.has_app_access('water'))
  WITH CHECK (public.has_app_access('water'));

CREATE POLICY "Water users can delete water_quality_norms"
  ON public.water_quality_norms FOR DELETE TO authenticated
  USING (public.has_app_access('water'));
