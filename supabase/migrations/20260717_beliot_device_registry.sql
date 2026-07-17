-- ============================================================
-- Реестр устройств Beliot
-- ============================================================
-- Назначение:
-- - хранить все устройства, обнаруженные при сканировании Beliot;
-- - отдельно управлять включением устройств в сбор показаний;
-- - сохранить текущую работу приложения во время перехода с
--   клиентского реестра на реестр в базе данных.
--
-- Миграция не изменяет и не удаляет существующие показания,
-- overrides или клиентский реестр.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.beliot_devices (
  device_id TEXT PRIMARY KEY,
  beliot_name TEXT,
  beliot_serial_number TEXT,
  beliot_address TEXT,
  beliot_object_name TEXT,
  tracking_status TEXT NOT NULL DEFAULT 'discovered',
  provider_data JSONB NOT NULL DEFAULT '{}'::JSONB,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ,
  last_scanned_at TIMESTAMPTZ,
  missing_since TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT beliot_devices_tracking_status_check
    CHECK (tracking_status IN ('discovered', 'tracked', 'ignored', 'missing', 'retired'))
);

COMMENT ON TABLE public.beliot_devices IS
  'Реестр устройств, обнаруженных в Beliot. Пользовательские названия, группы и роли остаются в beliot_device_overrides.';
COMMENT ON COLUMN public.beliot_devices.tracking_status IS
  'Состояние устройства: discovered, tracked, ignored, missing или retired.';
COMMENT ON COLUMN public.beliot_devices.provider_data IS
  'Последний исходный объект устройства, полученный от Beliot API.';
COMMENT ON COLUMN public.beliot_devices.last_seen_at IS
  'Последний момент, когда устройство присутствовало в ответе Beliot.';
COMMENT ON COLUMN public.beliot_devices.missing_since IS
  'Момент первого сканирования, при котором ранее известное устройство не найдено.';

CREATE INDEX IF NOT EXISTS idx_beliot_devices_tracking_status
  ON public.beliot_devices(tracking_status);
CREATE INDEX IF NOT EXISTS idx_beliot_devices_last_seen_at
  ON public.beliot_devices(last_seen_at DESC);

-- Все устройства, для которых уже есть настройки или показания,
-- считаются отслеживаемыми. Это сохраняет текущее поведение после миграции.
INSERT INTO public.beliot_devices (device_id, tracking_status)
SELECT known_devices.device_id, 'tracked'
FROM (
  SELECT device_id
  FROM public.beliot_device_overrides
  WHERE device_id IS NOT NULL AND BTRIM(device_id) <> ''

  UNION

  SELECT device_id
  FROM public.beliot_device_readings
  WHERE device_id IS NOT NULL AND BTRIM(device_id) <> ''
) AS known_devices
ON CONFLICT (device_id) DO NOTHING;

-- Устройства из действующего клиентского реестра также включаются
-- автоматически, даже если для них пока нет overrides или показаний.
INSERT INTO public.beliot_devices (device_id, tracking_status)
VALUES
  ('10597', 'tracked'),
  ('10596', 'tracked'),
  ('10598', 'tracked'),
  ('11363', 'tracked'),
  ('10586', 'tracked'),
  ('11015', 'tracked'),
  ('11016', 'tracked'),
  ('11019', 'tracked'),
  ('11018', 'tracked'),
  ('11013', 'tracked'),
  ('11078', 'tracked'),
  ('11365', 'tracked'),
  ('11366', 'tracked')
ON CONFLICT (device_id) DO NOTHING;

ALTER TABLE public.beliot_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view Beliot devices"
  ON public.beliot_devices;
DROP POLICY IF EXISTS "Only admins can modify Beliot devices"
  ON public.beliot_devices;

CREATE POLICY "Authenticated users can view Beliot devices"
  ON public.beliot_devices
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only admins can modify Beliot devices"
  ON public.beliot_devices
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

REVOKE ALL ON TABLE public.beliot_devices FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.beliot_devices TO authenticated;
GRANT ALL ON TABLE public.beliot_devices TO service_role;

DROP TRIGGER IF EXISTS update_beliot_devices_updated_at
  ON public.beliot_devices;
CREATE TRIGGER update_beliot_devices_updated_at
  BEFORE UPDATE ON public.beliot_devices
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
