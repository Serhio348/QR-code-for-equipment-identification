-- ============================================================
-- beliot_manual_archive_corrections_may2026.sql
--
-- Корректировки в текущей таблице показаний после замены счётчиков:
-- 1) 11363 (умягчённая вода), 01-03.05.2026: расход должен быть 0 м³.
-- 2) 11078 (посудо-тарный участок), 04.05.2026: расход должен быть 3.48 м³.
--
-- Важно: это правит именно beliot_device_readings и ставит guard,
-- чтобы импорт из Beliot не вернул исходные ошибочные значения.
-- ============================================================

-- Сначала отключаем старые guards, иначе они перехватывают UPDATE ниже.
DROP TRIGGER IF EXISTS trg_normalize_zero_consumption_11363_may01 ON public.beliot_device_readings;
DROP TRIGGER IF EXISTS trg_normalize_manual_beliot_archive_days ON public.beliot_device_readings;
DROP FUNCTION IF EXISTS public.normalize_zero_consumption_11363_may01();

-- ============================================
-- 1) 11363: 01-03.05.2026 = 0 м³
-- ============================================
UPDATE public.beliot_device_readings r
SET
  reading_value = 49299.99,
  source = 'manual',
  updated_at = now()
WHERE r.device_id = '11363'
  AND (r.reading_date AT TIME ZONE 'Europe/Moscow')::date BETWEEN date '2026-05-01' AND date '2026-05-03';

-- ============================================
-- 2) 11078: 04.05.2026 = 3.48 м³
-- ============================================
WITH previous_value AS (
  SELECT reading_value
  FROM public.beliot_device_readings
  WHERE device_id = '11078'
    AND (reading_date AT TIME ZONE 'Europe/Moscow')::date < date '2026-05-04'
  ORDER BY reading_date DESC
  LIMIT 1
),
target_day_rows AS (
  SELECT
    id,
    row_number() OVER (ORDER BY reading_date ASC, id ASC) AS rn
  FROM public.beliot_device_readings
  WHERE device_id = '11078'
    AND (reading_date AT TIME ZONE 'Europe/Moscow')::date = date '2026-05-04'
)
UPDATE public.beliot_device_readings r
SET
  reading_value = CASE
    WHEN target_day_rows.rn = 1 THEN previous_value.reading_value
    ELSE previous_value.reading_value + 3.48
  END,
  source = 'manual',
  updated_at = now()
FROM previous_value, target_day_rows
WHERE r.id = target_day_rows.id;

-- ============================================
-- Guard: не давать Beliot API вернуть значения обратно
-- ============================================
CREATE OR REPLACE FUNCTION public.normalize_manual_beliot_archive_days()
RETURNS trigger AS $$
DECLARE
  v_previous_value numeric;
  v_has_earlier_same_day boolean;
BEGIN
  IF NEW.device_id = '11363'
     AND (NEW.reading_date AT TIME ZONE 'Europe/Moscow')::date BETWEEN date '2026-05-01' AND date '2026-05-03'
  THEN
    NEW.reading_value := 49299.99;
    NEW.source := 'manual';
  END IF;

  IF NEW.device_id = '11078'
     AND (NEW.reading_date AT TIME ZONE 'Europe/Moscow')::date = date '2026-05-04'
  THEN
    SELECT reading_value INTO v_previous_value
    FROM public.beliot_device_readings
    WHERE device_id = '11078'
      AND (reading_date AT TIME ZONE 'Europe/Moscow')::date < date '2026-05-04'
    ORDER BY reading_date DESC
    LIMIT 1;

    IF v_previous_value IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.beliot_device_readings r
        WHERE r.device_id = '11078'
          AND (r.reading_date AT TIME ZONE 'Europe/Moscow')::date = date '2026-05-04'
          AND r.reading_date < NEW.reading_date
          AND r.id IS DISTINCT FROM NEW.id
      ) INTO v_has_earlier_same_day;

      NEW.reading_value := CASE
        WHEN v_has_earlier_same_day THEN v_previous_value + 3.48
        ELSE v_previous_value
      END;
      NEW.source := 'manual';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_normalize_manual_beliot_archive_days ON public.beliot_device_readings;

CREATE TRIGGER trg_normalize_manual_beliot_archive_days
BEFORE INSERT OR UPDATE ON public.beliot_device_readings
FOR EACH ROW
EXECUTE FUNCTION public.normalize_manual_beliot_archive_days();
