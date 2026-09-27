-- ============================================================================
-- Таблицы, которые раньше жили только в docs/migrations.
-- Файл новый и идёт после уже применённой истории: старые миграции не
-- переигрываются. На production CREATE TABLE IF NOT EXISTS ничего не стирает.
-- Политики добавляются только если на таблице их ещё нет, чтобы не ослабить
-- уже включённый доступ из SEC-05.
-- Чистая БД: ранние файлы пропускают отсутствующие таблицы, baseline создаёт
-- ядро, этот файл добирает роль счётчика, суточное представление и таблицы
-- качества воды, участков и логов.
-- ============================================================================

DO $device_role_forward$
BEGIN
  IF to_regclass('public.beliot_device_overrides') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.beliot_device_overrides
    ADD COLUMN IF NOT EXISTS device_role TEXT;

  ALTER TABLE public.beliot_device_overrides
    DROP CONSTRAINT IF EXISTS beliot_device_overrides_device_role_check;

  ALTER TABLE public.beliot_device_overrides
    ADD CONSTRAINT beliot_device_overrides_device_role_check
    CHECK (device_role IN ('source', 'production', 'domestic'));
END
$device_role_forward$;

DO $daily_view_forward$
BEGIN
  IF to_regclass('public.beliot_device_readings') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE $view$
    CREATE OR REPLACE VIEW public.beliot_daily_readings_agg AS
    SELECT
      device_id,
      reading_date::date AS reading_day,
      MIN(reading_value) AS min_value,
      MAX(reading_value) AS max_value,
      COUNT(*) AS reading_count
    FROM public.beliot_device_readings
    GROUP BY device_id, reading_date::date
  $view$;
END
$daily_view_forward$;

CREATE TABLE IF NOT EXISTS public.workshops (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workshops_name ON public.workshops(name);
ALTER TABLE public.workshops ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  error_code TEXT,
  error_message TEXT NOT NULL,
  user_message TEXT,
  error_type TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  url TEXT,
  user_agent TEXT,
  stack_trace TEXT,
  context JSONB,
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON public.error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_user_id ON public.error_logs(user_id);
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.sampling_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  equipment_id TEXT,
  location TEXT,
  sampling_frequency TEXT CHECK (sampling_frequency IN ('daily', 'weekly', 'monthly', 'custom')),
  sampling_schedule JSONB,
  responsible_person TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_sampling_point_code ON public.sampling_points(code);
ALTER TABLE public.sampling_points ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.water_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sampling_point_id UUID NOT NULL REFERENCES public.sampling_points(id) ON DELETE RESTRICT,
  equipment_id TEXT,
  sample_date TIMESTAMPTZ NOT NULL,
  analysis_date TIMESTAMPTZ,
  received_date TIMESTAMPTZ,
  sampled_by TEXT,
  analyzed_by TEXT,
  responsible_person TEXT,
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'deviation', 'cancelled')),
  notes TEXT,
  sample_condition TEXT CHECK (sample_condition IN ('normal', 'turbid', 'colored', 'odorous')),
  external_lab BOOLEAN DEFAULT false,
  external_lab_name TEXT,
  certificate_number TEXT,
  attachment_urls JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  change_log JSONB DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_analysis_date ON public.water_analysis(sample_date DESC);
ALTER TABLE public.water_analysis ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.analysis_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL REFERENCES public.water_analysis(id) ON DELETE CASCADE,
  parameter_name TEXT NOT NULL,
  parameter_label TEXT NOT NULL,
  value DECIMAL(10, 4) NOT NULL,
  unit TEXT NOT NULL,
  method TEXT,
  detection_limit DECIMAL(10, 4),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (analysis_id, parameter_name)
);

CREATE INDEX IF NOT EXISTS idx_results_analysis ON public.analysis_results(analysis_id);
ALTER TABLE public.analysis_results ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.water_quality_norms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sampling_point_id UUID,
  equipment_id TEXT,
  parameter_name TEXT NOT NULL,
  optimal_min DECIMAL(10, 4),
  optimal_max DECIMAL(10, 4),
  min_allowed DECIMAL(10, 4),
  max_allowed DECIMAL(10, 4),
  warning_min DECIMAL(10, 4),
  warning_max DECIMAL(10, 4),
  unit TEXT NOT NULL,
  regulation_reference TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  CONSTRAINT unique_sampling_point_param UNIQUE (sampling_point_id, parameter_name),
  CONSTRAINT unique_equipment_param UNIQUE (equipment_id, parameter_name)
);

ALTER TABLE public.water_quality_norms ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.water_quality_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id UUID NOT NULL REFERENCES public.analysis_results(id) ON DELETE CASCADE,
  analysis_id UUID NOT NULL REFERENCES public.water_analysis(id) ON DELETE CASCADE,
  norm_id UUID REFERENCES public.water_quality_norms(id) ON DELETE SET NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('warning', 'exceeded', 'deviation')),
  parameter_name TEXT NOT NULL,
  parameter_label TEXT NOT NULL,
  value DECIMAL(10, 4) NOT NULL,
  unit TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved', 'dismissed')),
  message TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.water_quality_alerts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.water_quality_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL REFERENCES public.water_analysis(id) ON DELETE CASCADE,
  sampling_point_id UUID REFERENCES public.sampling_points(id) ON DELETE SET NULL,
  equipment_id TEXT,
  incident_type TEXT NOT NULL CHECK (incident_type IN (
    'exceeded_norm', 'multiple_exceeded', 'critical_exceeded', 'equipment_failure', 'sampling_error'
  )),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'closed')),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.water_quality_incidents ENABLE ROW LEVEL SECURITY;

-- Пустую таблицу закрываем чтением для authenticated. Если политика уже есть, не трогаем.
DO $policies_if_empty$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'workshops',
    'sampling_points',
    'water_analysis',
    'analysis_results',
    'water_quality_norms',
    'water_quality_alerts',
    'water_quality_incidents'
  ]
  LOOP
    IF to_regclass('public.' || tbl) IS NULL THEN
      CONTINUE;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl
    ) THEN
      CONTINUE;
    END IF;
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
      'Authenticated read ' || tbl,
      tbl
    );
  END LOOP;

  IF to_regclass('public.error_logs') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'error_logs'
  ) THEN
    CREATE POLICY "Only admins can view error logs"
      ON public.error_logs
      FOR SELECT
      TO authenticated
      USING (public.is_admin());
  END IF;
END
$policies_if_empty$;
