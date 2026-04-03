-- ============================================================
-- История "Производство за день" (последние 30 дней)
-- ============================================================
-- Назначение:
-- - сохранять итоговые суточные объёмы производства (ЛУ/АЛПО/очистное и др.)
-- - хранить часы работы по каждому учёту (час считается рабочим, если за час есть потребление)
-- Источник расчёта: WaterDashboard (клиент), upsert при открытии/выборе дня.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.water_production_day_summaries (
  summary_date DATE PRIMARY KEY,
  total_m3 NUMERIC(12, 2) NOT NULL DEFAULT 0,
  totals_by_name JSONB NOT NULL DEFAULT '{}'::jsonb,
  work_hours_by_name JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.water_production_day_summaries IS
  'История суточного расхода производства (агрегаты ЛУ/АЛПО/очистное и др.) и часы работы по учётам. Заполняется клиентом WaterDashboard.';

COMMENT ON COLUMN public.water_production_day_summaries.summary_date IS 'Календарная дата (локальная), ключ записи';
COMMENT ON COLUMN public.water_production_day_summaries.total_m3 IS 'Суммарный расход производства за сутки, м³';
COMMENT ON COLUMN public.water_production_day_summaries.totals_by_name IS 'JSON: {label: m3} — суточные итоги по учётам';
COMMENT ON COLUMN public.water_production_day_summaries.work_hours_by_name IS 'JSON: {label: hours} — рабочие часы по учётам';

-- RLS
ALTER TABLE public.water_production_day_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read production day summaries"
  ON public.water_production_day_summaries;
DROP POLICY IF EXISTS "Only admins can modify production day summaries"
  ON public.water_production_day_summaries;

CREATE POLICY "Authenticated users can read production day summaries"
  ON public.water_production_day_summaries FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Only admins can modify production day summaries"
  ON public.water_production_day_summaries FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- updated_at trigger (если общий триггер уже существует — не переопределяем)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_water_production_day_summaries_updated_at'
  ) THEN
    CREATE TRIGGER update_water_production_day_summaries_updated_at
      BEFORE UPDATE ON public.water_production_day_summaries
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END$$;

