-- Пользователь с доступом к воде может сохранить суточную сводку производства.
-- Удаление строки остаётся у администратора.

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
