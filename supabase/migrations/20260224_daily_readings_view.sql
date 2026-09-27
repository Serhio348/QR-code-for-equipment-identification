-- ============================================================
-- Миграция: Агрегированный вид суточных показаний счётчиков
-- Дата: 2026-02-24
-- Назначение: Оптимизация запросов в WaterDashboard — вместо
--   выборки тысяч сырых строк (1 на каждое измерение) возвращаем
--   1 строку на устройство в день (мин/макс значение).
--
-- Это решает проблему превышения лимита PostgREST в 1000 строк.
-- ============================================================

-- Представление создаётся здесь, только если таблица показаний уже есть.
-- Иначе его создаёт 20260327_app_tables_from_docs.sql после baseline.
DO $daily_view$
BEGIN
  IF to_regclass('public.beliot_device_readings') IS NULL THEN
    RAISE NOTICE 'beliot_device_readings ещё нет, представление создаст поздняя миграция';
    RETURN;
  END IF;

  EXECUTE $view$
    CREATE OR REPLACE VIEW public.beliot_daily_readings_agg AS
    SELECT
      device_id,
      reading_date::date          AS reading_day,
      MIN(reading_value)          AS min_value,
      MAX(reading_value)          AS max_value,
      COUNT(*)                    AS reading_count
    FROM public.beliot_device_readings
    GROUP BY device_id, reading_date::date
  $view$;
END
$daily_view$;

DO $daily_view_comment$
BEGIN
  IF to_regclass('public.beliot_daily_readings_agg') IS NULL THEN
    RETURN;
  END IF;
  COMMENT ON VIEW public.beliot_daily_readings_agg IS
    'Суточная агрегация показаний: мин/макс по каждому счётчику на каждый день. Расход за день = max_value − min_value.';
END
$daily_view_comment$;
