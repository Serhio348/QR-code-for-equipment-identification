-- ============================================================================
-- Автообнаружение и подтверждение замен счётчиков Beliot
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.beliot_meter_replacement_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL REFERENCES public.beliot_devices(device_id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'suspected'
    CHECK (status IN ('suspected', 'pending_review', 'confirmed', 'dismissed')),
  detection_source TEXT NOT NULL
    CHECK (detection_source IN ('reading_drop', 'serial_mismatch', 'manual')),
  old_reading_value NUMERIC(12, 3),
  old_reading_at TIMESTAMPTZ,
  new_reading_value NUMERIC(12, 3),
  new_reading_at TIMESTAMPTZ,
  drop_m3 NUMERIC(12, 3),
  drop_ratio NUMERIC(12, 6),
  suggested_replacement_day DATE,
  old_serial_number TEXT,
  provider_serial_number TEXT,
  confirmed_serial_number TEXT,
  first_day_volume_m3 NUMERIC(12, 3),
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  dismissed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_beliot_replacement_events_active
  ON public.beliot_meter_replacement_events(device_id)
  WHERE status IN ('suspected', 'pending_review');

CREATE INDEX IF NOT EXISTS idx_beliot_replacement_events_status_detected
  ON public.beliot_meter_replacement_events(status, detected_at DESC);

COMMENT ON TABLE public.beliot_meter_replacement_events IS
  'Кандидаты и подтверждённая история замен физических счётчиков Beliot';

DROP TRIGGER IF EXISTS update_beliot_meter_replacement_events_updated_at
  ON public.beliot_meter_replacement_events;
CREATE TRIGGER update_beliot_meter_replacement_events_updated_at
  BEFORE UPDATE ON public.beliot_meter_replacement_events
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================
-- Детекция сброса накопительных показаний
-- ============================================

CREATE OR REPLACE FUNCTION public.detect_beliot_meter_reading_drop(
  p_device_id TEXT,
  p_reading_date TIMESTAMPTZ,
  p_reading_value NUMERIC
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  previous_reading RECORD;
  active_event public.beliot_meter_replacement_events%ROWTYPE;
  replacement_day DATE;
  detected_drop NUMERIC;
  detected_ratio NUMERIC;
  event_id UUID;
BEGIN
  IF p_reading_value IS NULL OR p_reading_date IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT *
  INTO active_event
  FROM public.beliot_meter_replacement_events
  WHERE device_id = p_device_id
    AND status IN ('suspected', 'pending_review')
  ORDER BY detected_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF active_event.status = 'suspected'
      AND p_reading_date > active_event.new_reading_at
      AND p_reading_value >= active_event.new_reading_value
      AND p_reading_value <= active_event.old_reading_value * 0.95
    THEN
      UPDATE public.beliot_meter_replacement_events
      SET
        status = 'pending_review',
        new_reading_value = p_reading_value,
        new_reading_at = p_reading_date,
        metadata = metadata || jsonb_build_object(
          'confirmed_by_second_reading', true,
          'second_reading_at', p_reading_date
        )
      WHERE id = active_event.id;
    END IF;
    RETURN active_event.id;
  END IF;

  SELECT reading_value, reading_date
  INTO previous_reading
  FROM public.beliot_device_readings
  WHERE device_id = p_device_id
    AND reading_type = 'hourly'
    AND reading_date < p_reading_date
  ORDER BY reading_date DESC
  LIMIT 1;

  IF NOT FOUND OR previous_reading.reading_value <= 0
    OR p_reading_value >= previous_reading.reading_value
  THEN
    RETURN NULL;
  END IF;

  detected_drop := previous_reading.reading_value - p_reading_value;
  detected_ratio := detected_drop / previous_reading.reading_value;
  IF detected_drop < 10 OR detected_ratio < 0.05 THEN
    RETURN NULL;
  END IF;

  replacement_day := (p_reading_date AT TIME ZONE 'Europe/Moscow')::DATE;
  IF EXISTS (
    SELECT 1
    FROM public.beliot_device_rules
    WHERE device_id = p_device_id
      AND meter_replacement_day >= replacement_day
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.beliot_meter_replacement_events (
    device_id,
    status,
    detection_source,
    old_reading_value,
    old_reading_at,
    new_reading_value,
    new_reading_at,
    drop_m3,
    drop_ratio,
    suggested_replacement_day,
    old_serial_number,
    metadata
  )
  SELECT
    p_device_id,
    'suspected',
    'reading_drop',
    previous_reading.reading_value,
    previous_reading.reading_date,
    p_reading_value,
    p_reading_date,
    detected_drop,
    detected_ratio,
    replacement_day,
    overrides.serial_number,
    jsonb_build_object('minimum_drop_m3', 10, 'minimum_drop_ratio', 0.05)
  FROM (SELECT 1) AS seed
  LEFT JOIN public.beliot_device_overrides AS overrides
    ON overrides.device_id = p_device_id
  RETURNING id INTO event_id;

  RETURN event_id;
END;
$$;

-- ============================================
-- Сверка заводского номера при сканировании
-- ============================================

CREATE OR REPLACE FUNCTION public.detect_beliot_serial_mismatch(
  p_device_id TEXT,
  p_provider_serial_number TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  passport_serial TEXT;
  active_event_id UUID;
  event_id UUID;
BEGIN
  p_provider_serial_number := NULLIF(BTRIM(p_provider_serial_number), '');
  IF p_provider_serial_number IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT NULLIF(BTRIM(serial_number), '')
  INTO passport_serial
  FROM public.beliot_device_overrides
  WHERE device_id = p_device_id;

  IF passport_serial IS NULL OR passport_serial = p_provider_serial_number THEN
    RETURN NULL;
  END IF;

  SELECT id
  INTO active_event_id
  FROM public.beliot_meter_replacement_events
  WHERE device_id = p_device_id
    AND status IN ('suspected', 'pending_review')
  LIMIT 1;

  IF active_event_id IS NOT NULL THEN
    UPDATE public.beliot_meter_replacement_events
    SET
      status = 'pending_review',
      provider_serial_number = p_provider_serial_number,
      old_serial_number = COALESCE(old_serial_number, passport_serial),
      metadata = metadata || jsonb_build_object('serial_mismatch', true)
    WHERE id = active_event_id;
    RETURN active_event_id;
  END IF;

  INSERT INTO public.beliot_meter_replacement_events (
    device_id,
    status,
    detection_source,
    old_serial_number,
    provider_serial_number,
    suggested_replacement_day,
    metadata
  )
  VALUES (
    p_device_id,
    'pending_review',
    'serial_mismatch',
    passport_serial,
    p_provider_serial_number,
    (NOW() AT TIME ZONE 'Europe/Moscow')::DATE,
    jsonb_build_object('serial_mismatch', true)
  )
  RETURNING id INTO event_id;

  RETURN event_id;
END;
$$;

-- ============================================
-- Атомарное подтверждение замены
-- ============================================

CREATE OR REPLACE FUNCTION public.confirm_beliot_meter_replacement(
  p_event_id UUID,
  p_replacement_day DATE,
  p_new_serial_number TEXT,
  p_first_day_volume_m3 NUMERIC DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_confirmed_by UUID DEFAULT NULL
)
RETURNS SETOF public.beliot_meter_replacement_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  replacement_event public.beliot_meter_replacement_events%ROWTYPE;
  normalized_serial TEXT;
BEGIN
  normalized_serial := NULLIF(BTRIM(p_new_serial_number), '');
  IF normalized_serial IS NULL OR p_replacement_day IS NULL THEN
    RAISE EXCEPTION 'Дата замены и новый заводской номер обязательны';
  END IF;
  IF p_first_day_volume_m3 IS NOT NULL AND p_first_day_volume_m3 < 0 THEN
    RAISE EXCEPTION 'Расход в день замены не может быть отрицательным';
  END IF;

  SELECT *
  INTO replacement_event
  FROM public.beliot_meter_replacement_events
  WHERE id = p_event_id
    AND status IN ('suspected', 'pending_review')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Активное событие замены не найдено';
  END IF;

  INSERT INTO public.beliot_device_overrides (
    device_id,
    serial_number,
    last_modified,
    updated_at
  )
  VALUES (
    replacement_event.device_id,
    normalized_serial,
    NOW(),
    NOW()
  )
  ON CONFLICT (device_id) DO UPDATE
  SET
    serial_number = EXCLUDED.serial_number,
    last_modified = NOW(),
    updated_at = NOW();

  INSERT INTO public.beliot_device_rules (device_id, meter_replacement_day)
  VALUES (replacement_event.device_id, p_replacement_day)
  ON CONFLICT (device_id) DO UPDATE
  SET
    meter_replacement_day = EXCLUDED.meter_replacement_day,
    updated_at = NOW();

  IF p_first_day_volume_m3 IS NOT NULL THEN
    INSERT INTO public.beliot_reading_day_corrections (
      device_id,
      correction_day,
      volume_m3,
      reason
    )
    VALUES (
      replacement_event.device_id,
      p_replacement_day,
      p_first_day_volume_m3,
      COALESCE(NULLIF(BTRIM(p_reason), ''), 'Подтверждённая замена счётчика')
    )
    ON CONFLICT (device_id, correction_day) DO UPDATE
    SET
      volume_m3 = EXCLUDED.volume_m3,
      reason = EXCLUDED.reason,
      updated_at = NOW();
  END IF;

  UPDATE public.beliot_meter_replacement_events
  SET
    status = 'confirmed',
    suggested_replacement_day = p_replacement_day,
    confirmed_serial_number = normalized_serial,
    first_day_volume_m3 = p_first_day_volume_m3,
    reason = NULLIF(BTRIM(p_reason), ''),
    confirmed_by = p_confirmed_by,
    confirmed_at = NOW()
  WHERE id = p_event_id;

  RETURN QUERY
  SELECT *
  FROM public.beliot_meter_replacement_events
  WHERE id = p_event_id;
END;
$$;

-- ============================================
-- История известной замены 11363
-- ============================================

INSERT INTO public.beliot_meter_replacement_events (
  device_id,
  status,
  detection_source,
  suggested_replacement_day,
  old_reading_value,
  new_reading_value,
  old_serial_number,
  confirmed_serial_number,
  reason,
  confirmed_at,
  metadata
)
SELECT
  '11363',
  'confirmed',
  'manual',
  DATE '2026-07-31',
  52061.810,
  14382.100,
  '13001986',
  '13001660',
  'Физическая замена счётчика',
  NOW(),
  jsonb_build_object('backfilled', true)
WHERE EXISTS (
  SELECT 1 FROM public.beliot_devices WHERE device_id = '11363'
)
AND NOT EXISTS (
  SELECT 1
  FROM public.beliot_meter_replacement_events
  WHERE device_id = '11363'
    AND status = 'confirmed'
    AND suggested_replacement_day = DATE '2026-07-31'
);

-- ============================================
-- RLS и права
-- ============================================

ALTER TABLE public.beliot_meter_replacement_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view Beliot replacement events"
  ON public.beliot_meter_replacement_events;
CREATE POLICY "Admins can view Beliot replacement events"
  ON public.beliot_meter_replacement_events
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

REVOKE ALL ON TABLE public.beliot_meter_replacement_events FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.beliot_meter_replacement_events TO authenticated;
GRANT ALL ON TABLE public.beliot_meter_replacement_events TO service_role;

REVOKE ALL ON FUNCTION public.detect_beliot_meter_reading_drop(TEXT, TIMESTAMPTZ, NUMERIC)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.detect_beliot_meter_reading_drop(TEXT, TIMESTAMPTZ, NUMERIC)
  TO service_role;

REVOKE ALL ON FUNCTION public.detect_beliot_serial_mismatch(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.detect_beliot_serial_mismatch(TEXT, TEXT)
  TO service_role;

REVOKE ALL ON FUNCTION public.confirm_beliot_meter_replacement(
  UUID, DATE, TEXT, NUMERIC, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_beliot_meter_replacement(
  UUID, DATE, TEXT, NUMERIC, TEXT, UUID
) TO service_role;
