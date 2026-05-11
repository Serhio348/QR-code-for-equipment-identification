-- ============================================================
-- beliot_fix_11363_swap_guard_and_msk_agg.sql
--
-- Фикс после замены счётчика (11363, умягчённая вода):
-- 1) Суточная агрегация по Europe/Moscow (а не по UTC), чтобы reading_day совпадал с календарём.
-- 2) Защита от "возврата" старых показаний (10xxx) после 2026-05-04:
--    импортёр с source='api' делает upsert и может перезаписывать ручные правки.
--    Триггер блокирует insert/update строк со старой шкалой после даты замены.
-- ============================================================

-- ============================================
-- 1) Суточная агрегация по Europe/Moscow
-- ============================================
CREATE OR REPLACE VIEW public.beliot_daily_readings_agg AS
SELECT
  device_id,
  (reading_date AT TIME ZONE 'Europe/Moscow')::date AS reading_day,
  MIN(reading_value) AS min_value,
  MAX(reading_value) AS max_value,
  COUNT(*) AS reading_count
FROM public.beliot_device_readings
GROUP BY device_id, (reading_date AT TIME ZONE 'Europe/Moscow')::date;

COMMENT ON VIEW public.beliot_daily_readings_agg IS
  'Суточная агрегация показаний: мин/макс по каждому счётчику на каждый день (Europe/Moscow).';

-- ============================================
-- 2) Guard: блокировать старую шкалу после swap
-- ============================================
CREATE OR REPLACE FUNCTION public.block_old_meter_11363()
RETURNS trigger AS $$
BEGIN
  IF NEW.device_id = '11363'
     AND NEW.reading_date >= timestamptz '2026-05-04 00:00:00+00'
     AND NEW.reading_value < 20000
  THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_block_old_meter_11363 ON public.beliot_device_readings;

CREATE TRIGGER trg_block_old_meter_11363
BEFORE INSERT OR UPDATE ON public.beliot_device_readings
FOR EACH ROW
EXECUTE FUNCTION public.block_old_meter_11363();

