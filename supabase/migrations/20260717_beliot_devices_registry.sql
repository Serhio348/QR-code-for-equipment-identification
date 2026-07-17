-- ============================================================================
-- Реестр устройств Beliot и история сканирований провайдера
-- ============================================================================
-- Миграция только добавляет новые сущности и паспортные поля. Существующие
-- показания и пользовательские overrides не изменяются.
-- ============================================================================

-- ============================================
-- Паспортные поля пользовательских overrides
-- ============================================

ALTER TABLE public.beliot_device_overrides
  ADD COLUMN IF NOT EXISTS manufacture_date DATE,
  ADD COLUMN IF NOT EXISTS manufacturer TEXT,
  ADD COLUMN IF NOT EXISTS verification_date DATE,
  ADD COLUMN IF NOT EXISTS next_verification_date DATE;

COMMENT ON COLUMN public.beliot_device_overrides.manufacture_date IS
  'Дата выпуска счётчика из пользовательского паспорта';
COMMENT ON COLUMN public.beliot_device_overrides.manufacturer IS
  'Производитель счётчика из пользовательского паспорта';
COMMENT ON COLUMN public.beliot_device_overrides.verification_date IS
  'Дата последней поверки счётчика';
COMMENT ON COLUMN public.beliot_device_overrides.next_verification_date IS
  'Дата следующей поверки счётчика';

-- ============================================
-- Реестр устройств
-- ============================================

CREATE TABLE IF NOT EXISTS public.beliot_devices (
  device_id TEXT PRIMARY KEY,
  provider_name TEXT,
  provider_serial_number TEXT,
  provider_address TEXT,
  provider_object_name TEXT,
  provider_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  bootstrap_group_name TEXT,
  tracking_status TEXT NOT NULL DEFAULT 'discovered'
    CHECK (tracking_status IN ('discovered', 'tracked', 'ignored', 'retired')),
  provider_status TEXT NOT NULL DEFAULT 'available'
    CHECK (provider_status IN ('available', 'missing')),
  consecutive_misses INTEGER NOT NULL DEFAULT 0
    CHECK (consecutive_misses >= 0),
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_beliot_devices_tracking_status
  ON public.beliot_devices(tracking_status);
CREATE INDEX IF NOT EXISTS idx_beliot_devices_provider_status
  ON public.beliot_devices(provider_status);
CREATE INDEX IF NOT EXISTS idx_beliot_devices_last_seen_at
  ON public.beliot_devices(last_seen_at DESC);

COMMENT ON TABLE public.beliot_devices IS
  'Реестр обнаруженных устройств Beliot и состояние их отслеживания';
COMMENT ON COLUMN public.beliot_devices.device_id IS 'Уникальный ID устройства в Beliot';
COMMENT ON COLUMN public.beliot_devices.provider_name IS 'Название устройства из последнего ответа Beliot';
COMMENT ON COLUMN public.beliot_devices.provider_serial_number IS 'Серийный номер из последнего ответа Beliot';
COMMENT ON COLUMN public.beliot_devices.provider_address IS 'Адрес из последнего ответа Beliot';
COMMENT ON COLUMN public.beliot_devices.provider_object_name IS 'Название объекта или начальная группа устройства';
COMMENT ON COLUMN public.beliot_devices.provider_data IS 'Полный нормализованный снимок данных устройства от провайдера';
COMMENT ON COLUMN public.beliot_devices.bootstrap_group_name IS
  'Переходная группа из legacy-реестра; используется только если override device_group не задан';
COMMENT ON COLUMN public.beliot_devices.tracking_status IS
  'Состояние отслеживания: discovered, tracked, ignored или retired';
COMMENT ON COLUMN public.beliot_devices.provider_status IS
  'Наличие в последнем полном сканировании: available или missing';
COMMENT ON COLUMN public.beliot_devices.consecutive_misses IS
  'Количество последовательных полных сканирований без устройства';
COMMENT ON COLUMN public.beliot_devices.discovered_at IS 'Время первого обнаружения устройства';
COMMENT ON COLUMN public.beliot_devices.last_seen_at IS 'Время последнего обнаружения устройства у провайдера';
COMMENT ON COLUMN public.beliot_devices.created_at IS 'Время создания строки реестра';
COMMENT ON COLUMN public.beliot_devices.updated_at IS 'Время последнего изменения строки реестра';

-- ============================================
-- История сканирований
-- ============================================

CREATE TABLE IF NOT EXISTS public.beliot_scan_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'scheduled', 'bootstrap')),
  found_count INTEGER NOT NULL DEFAULT 0 CHECK (found_count >= 0),
  new_count INTEGER NOT NULL DEFAULT 0 CHECK (new_count >= 0),
  updated_count INTEGER NOT NULL DEFAULT 0 CHECK (updated_count >= 0),
  missing_count INTEGER NOT NULL DEFAULT 0 CHECK (missing_count >= 0),
  error TEXT,
  started_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_beliot_scan_runs_started_at
  ON public.beliot_scan_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_beliot_scan_runs_status
  ON public.beliot_scan_runs(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_beliot_scan_runs_single_running
  ON public.beliot_scan_runs(status)
  WHERE status = 'running';

COMMENT ON TABLE public.beliot_scan_runs IS
  'История полных сканирований списка устройств Beliot';
COMMENT ON COLUMN public.beliot_scan_runs.id IS 'Уникальный ID запуска сканирования';
COMMENT ON COLUMN public.beliot_scan_runs.status IS 'Состояние запуска: running, completed или failed';
COMMENT ON COLUMN public.beliot_scan_runs.source IS 'Источник запуска: manual, scheduled или bootstrap';
COMMENT ON COLUMN public.beliot_scan_runs.found_count IS 'Количество устройств в ответе провайдера';
COMMENT ON COLUMN public.beliot_scan_runs.new_count IS 'Количество впервые обнаруженных устройств';
COMMENT ON COLUMN public.beliot_scan_runs.updated_count IS 'Количество обновлённых строк реестра';
COMMENT ON COLUMN public.beliot_scan_runs.missing_count IS 'Количество отсутствующих у провайдера устройств';
COMMENT ON COLUMN public.beliot_scan_runs.error IS 'Текст ошибки неуспешного сканирования';
COMMENT ON COLUMN public.beliot_scan_runs.started_by IS 'Пользователь, запустивший ручное сканирование';
COMMENT ON COLUMN public.beliot_scan_runs.started_at IS 'Время начала сканирования';
COMMENT ON COLUMN public.beliot_scan_runs.finished_at IS 'Время завершения сканирования';
COMMENT ON COLUMN public.beliot_scan_runs.created_at IS 'Время создания строки запуска';
COMMENT ON COLUMN public.beliot_scan_runs.updated_at IS 'Время последнего изменения строки запуска';

-- ============================================
-- Правила расчёта и документированные корректировки
-- ============================================

CREATE TABLE IF NOT EXISTS public.beliot_device_rules (
  device_id TEXT PRIMARY KEY REFERENCES public.beliot_devices(device_id) ON DELETE CASCADE,
  is_hvo_aggregate BOOLEAN NOT NULL DEFAULT false,
  combine_group_key TEXT,
  combine_group_label TEXT,
  meter_replacement_day DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.beliot_reading_day_corrections (
  device_id TEXT NOT NULL REFERENCES public.beliot_devices(device_id) ON DELETE RESTRICT,
  correction_day DATE NOT NULL,
  volume_m3 NUMERIC(12, 3) NOT NULL,
  reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (device_id, correction_day)
);

COMMENT ON TABLE public.beliot_device_rules IS
  'Настройки специальных расчётов водного баланса и замен счётчиков';
COMMENT ON TABLE public.beliot_reading_day_corrections IS
  'Документированные суточные корректировки расхода вместо хардкода frontend';

-- ============================================
-- Автоматическое обновление updated_at
-- ============================================

DROP TRIGGER IF EXISTS update_beliot_devices_updated_at ON public.beliot_devices;
CREATE TRIGGER update_beliot_devices_updated_at
  BEFORE UPDATE ON public.beliot_devices
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS update_beliot_scan_runs_updated_at ON public.beliot_scan_runs;
CREATE TRIGGER update_beliot_scan_runs_updated_at
  BEFORE UPDATE ON public.beliot_scan_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS update_beliot_device_rules_updated_at ON public.beliot_device_rules;
CREATE TRIGGER update_beliot_device_rules_updated_at
  BEFORE UPDATE ON public.beliot_device_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS update_beliot_reading_day_corrections_updated_at
  ON public.beliot_reading_day_corrections;
CREATE TRIGGER update_beliot_reading_day_corrections_updated_at
  BEFORE UPDATE ON public.beliot_reading_day_corrections
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================
-- Начальное заполнение реестра
-- ============================================
-- Приоритет пользовательских названий используется только для первоначального
-- снимка реестра. Сами строки beliot_device_overrides не обновляются.

WITH explicit_devices(device_id, device_group) AS (
  VALUES
    ('10597', 'ХВО'),
    ('10596', 'ХВО'),
    ('10598', 'ХВО'),
    ('11363', 'ХВО'),
    ('10586', 'Ввод, ул. Орджоникидзе'),
    ('11015', 'АБК по ул.Советская, 2'),
    ('11016', 'АБК по ул.Советская, 2'),
    ('11019', 'АБК по ул.Советская, 2/1'),
    ('11018', 'АБК по ул.Советская, 2/1'),
    ('11013', 'Скважина'),
    ('11078', 'Посудо-тарный участок'),
    ('11365', 'Пожаротушение'),
    ('11366', 'Пожаротушение')
),
reading_devices AS (
  SELECT
    device_id,
    MIN(reading_date) AS first_reading_at,
    MAX(reading_date) AS last_reading_at
  FROM public.beliot_device_readings
  GROUP BY device_id
),
all_device_ids AS (
  SELECT device_id FROM public.beliot_device_overrides
  UNION
  SELECT device_id FROM reading_devices
  UNION
  SELECT device_id FROM explicit_devices
)
INSERT INTO public.beliot_devices (
  device_id,
  provider_name,
  provider_serial_number,
  provider_address,
  provider_object_name,
  provider_data,
  bootstrap_group_name,
  tracking_status,
  provider_status,
  consecutive_misses,
  discovered_at,
  last_seen_at
)
SELECT
  ids.device_id,
  overrides.name,
  overrides.serial_number,
  overrides.address,
  COALESCE(overrides.object_name, explicit.device_group),
  CASE
    WHEN explicit.device_group IS NULL THEN '{}'::jsonb
    ELSE jsonb_build_object('bootstrap_group', explicit.device_group)
  END,
  explicit.device_group,
  'tracked',
  'available',
  0,
  COALESCE(readings.first_reading_at, NOW()),
  COALESCE(readings.last_reading_at, NOW())
FROM all_device_ids AS ids
LEFT JOIN public.beliot_device_overrides AS overrides
  ON overrides.device_id = ids.device_id
LEFT JOIN reading_devices AS readings
  ON readings.device_id = ids.device_id
LEFT JOIN explicit_devices AS explicit
  ON explicit.device_id = ids.device_id
ON CONFLICT (device_id) DO NOTHING;

INSERT INTO public.beliot_device_rules (
  device_id,
  is_hvo_aggregate,
  combine_group_key,
  combine_group_label,
  meter_replacement_day
)
VALUES
  ('11363', true, NULL, NULL, NULL),
  ('11365', false, 'fire-suppression', 'Пожаротушение', NULL),
  ('11366', false, 'fire-suppression', 'Пожаротушение', NULL),
  ('11078', false, NULL, NULL, DATE '2026-05-04')
ON CONFLICT (device_id) DO NOTHING;

INSERT INTO public.beliot_reading_day_corrections (
  device_id,
  correction_day,
  volume_m3,
  reason
)
VALUES
  ('11363', DATE '2026-05-01', 0, 'Первый день новой шкалы'),
  ('11078', DATE '2026-05-04', 3.48, 'Замена физического счётчика')
ON CONFLICT (device_id, correction_day) DO NOTHING;

-- ============================================
-- Служебная функция tracked-устройств
-- ============================================

CREATE OR REPLACE FUNCTION public.get_tracked_beliot_device_ids()
RETURNS TABLE(device_id TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT devices.device_id
  FROM public.beliot_devices AS devices
  WHERE devices.tracking_status = 'tracked'
  ORDER BY devices.device_id;
$$;

COMMENT ON FUNCTION public.get_tracked_beliot_device_ids() IS
  'Возвращает ID отслеживаемых устройств Beliot только серверной роли';

REVOKE ALL ON FUNCTION public.get_tracked_beliot_device_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_tracked_beliot_device_ids() FROM anon;
REVOKE ALL ON FUNCTION public.get_tracked_beliot_device_ids() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_tracked_beliot_device_ids() TO service_role;

-- ============================================
-- RLS и права
-- ============================================

ALTER TABLE public.beliot_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beliot_scan_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beliot_device_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beliot_reading_day_corrections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view Beliot registry"
  ON public.beliot_devices;
DROP POLICY IF EXISTS "Admins can manage Beliot registry"
  ON public.beliot_devices;
DROP POLICY IF EXISTS "Admins can view Beliot scan runs"
  ON public.beliot_scan_runs;
DROP POLICY IF EXISTS "Water users can view Beliot device rules"
  ON public.beliot_device_rules;
DROP POLICY IF EXISTS "Admins can manage Beliot device rules"
  ON public.beliot_device_rules;
DROP POLICY IF EXISTS "Water users can view Beliot corrections"
  ON public.beliot_reading_day_corrections;
DROP POLICY IF EXISTS "Admins can manage Beliot corrections"
  ON public.beliot_reading_day_corrections;

CREATE POLICY "Authenticated users can view Beliot registry"
  ON public.beliot_devices
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_app_access AS access
      WHERE access.user_id = auth.uid()
        AND access.water = true
    )
  );

CREATE POLICY "Admins can manage Beliot registry"
  ON public.beliot_devices
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can view Beliot scan runs"
  ON public.beliot_scan_runs
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Water users can view Beliot device rules"
  ON public.beliot_device_rules FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_app_access AS access
      WHERE access.user_id = auth.uid() AND access.water = true
    )
  );

CREATE POLICY "Admins can manage Beliot device rules"
  ON public.beliot_device_rules FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Water users can view Beliot corrections"
  ON public.beliot_reading_day_corrections FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_app_access AS access
      WHERE access.user_id = auth.uid() AND access.water = true
    )
  );

CREATE POLICY "Admins can manage Beliot corrections"
  ON public.beliot_reading_day_corrections FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

REVOKE ALL ON TABLE public.beliot_devices FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.beliot_devices TO authenticated;
GRANT ALL ON TABLE public.beliot_devices TO service_role;

REVOKE ALL ON TABLE public.beliot_scan_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.beliot_scan_runs TO authenticated;
GRANT ALL ON TABLE public.beliot_scan_runs TO service_role;

REVOKE ALL ON TABLE public.beliot_device_rules FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.beliot_device_rules TO authenticated;
GRANT ALL ON TABLE public.beliot_device_rules TO service_role;

REVOKE ALL ON TABLE public.beliot_reading_day_corrections FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.beliot_reading_day_corrections TO authenticated;
GRANT ALL ON TABLE public.beliot_reading_day_corrections TO service_role;

-- ============================================
-- Немутационные проверки после применения
-- ============================================

-- 1. Количество устройств по состояниям:
-- SELECT tracking_status, provider_status, COUNT(*)
-- FROM public.beliot_devices
-- GROUP BY tracking_status, provider_status
-- ORDER BY tracking_status, provider_status;

-- 2. Явные ID из beliotDeviceRegistry.ts, отсутствующие в реестре (ожидается 0 строк):
-- WITH expected(device_id) AS (
--   VALUES
--     ('10597'), ('10596'), ('10598'), ('11363'), ('10586'),
--     ('11015'), ('11016'), ('11019'), ('11018'), ('11013'),
--     ('11078'), ('11365'), ('11366')
-- )
-- SELECT expected.device_id
-- FROM expected
-- LEFT JOIN public.beliot_devices AS devices USING (device_id)
-- WHERE devices.device_id IS NULL;

-- 3. ID с показаниями, отсутствующие в реестре (ожидается 0 строк):
-- SELECT DISTINCT readings.device_id
-- FROM public.beliot_device_readings AS readings
-- LEFT JOIN public.beliot_devices AS devices USING (device_id)
-- WHERE devices.device_id IS NULL
-- ORDER BY readings.device_id;

-- 4. Покрытие показаний реестром:
-- SELECT
--   COUNT(DISTINCT readings.device_id) AS reading_device_count,
--   COUNT(DISTINCT devices.device_id) AS registered_reading_device_count
-- FROM public.beliot_device_readings AS readings
-- LEFT JOIN public.beliot_devices AS devices USING (device_id);
