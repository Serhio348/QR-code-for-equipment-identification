/**
 * 20260928_latest_beliot_readings.sql
 *
 * Одно последнее показание на счётчик.
 * Список счётчиков и базовое значение дашборда больше не делают
 * отдельный запрос на каждый прибор.
 */

CREATE OR REPLACE FUNCTION public.get_latest_beliot_readings(
  p_device_ids TEXT[],
  p_before TIMESTAMPTZ DEFAULT NULL,
  p_reading_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  device_id TEXT,
  reading_value NUMERIC,
  reading_date TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT ON (r.device_id)
    r.device_id,
    r.reading_value,
    r.reading_date
  FROM public.beliot_device_readings AS r
  WHERE r.device_id = ANY (p_device_ids)
    AND (p_before IS NULL OR r.reading_date < p_before)
    AND (p_reading_type IS NULL OR r.reading_type = p_reading_type)
  ORDER BY r.device_id, r.reading_date DESC;
$$;

COMMENT ON FUNCTION public.get_latest_beliot_readings(TEXT[], TIMESTAMPTZ, TEXT) IS
  'Последнее показание каждого счётчика из списка. p_before — строго раньше этой метки.';

REVOKE ALL ON FUNCTION public.get_latest_beliot_readings(TEXT[], TIMESTAMPTZ, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_latest_beliot_readings(TEXT[], TIMESTAMPTZ, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_latest_beliot_readings(TEXT[], TIMESTAMPTZ, TEXT) TO service_role;
