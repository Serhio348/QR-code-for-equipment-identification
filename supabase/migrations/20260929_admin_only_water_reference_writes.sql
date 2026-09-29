-- Нормативы и точки отбора меняет только администратор.
-- Чтение остаётся у пользователей с доступом к воде.

DROP POLICY IF EXISTS "Water users can insert sampling_points" ON public.sampling_points;
DROP POLICY IF EXISTS "Water users can update sampling_points" ON public.sampling_points;
DROP POLICY IF EXISTS "Water users can delete sampling_points" ON public.sampling_points;
DROP POLICY IF EXISTS "Admins can insert sampling_points" ON public.sampling_points;
DROP POLICY IF EXISTS "Admins can update sampling_points" ON public.sampling_points;
DROP POLICY IF EXISTS "Admins can delete sampling_points" ON public.sampling_points;

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

DROP POLICY IF EXISTS "Water users can insert water_quality_norms" ON public.water_quality_norms;
DROP POLICY IF EXISTS "Water users can update water_quality_norms" ON public.water_quality_norms;
DROP POLICY IF EXISTS "Water users can delete water_quality_norms" ON public.water_quality_norms;
DROP POLICY IF EXISTS "Admins can insert water_quality_norms" ON public.water_quality_norms;
DROP POLICY IF EXISTS "Admins can update water_quality_norms" ON public.water_quality_norms;
DROP POLICY IF EXISTS "Admins can delete water_quality_norms" ON public.water_quality_norms;

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
