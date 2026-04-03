-- ============================================================
-- Счётчик 11363 (умягчённая вода): дозаполнение накопленных м³ 31.03–02.04.2026
-- ============================================================
-- Дашборд: суточный расход = max(день) − max(предыдущий день)
--   (beliot_daily_readings_agg, WaterDashboard).
-- 83 м³ и 107 м³ — суточные объёмы за 01.04 и 02.04 (не показания счётчика).
-- Актуальное накопленное показание: 10152.8 м³ → назад:
--   10152.8 − 107 = 10045.8 (на конец 01.04),
--   10045.8 − 83  = 9962.8  (на конец 31.03 / начало учёта этих суток).
-- В таблице храним именно накопленные reading_value.
-- Время — вечер суток Europe/Moscow, чтобы reading_day в agg совпал с календарём.
-- ============================================================

INSERT INTO public.beliot_device_readings (
  device_id,
  reading_date,
  reading_value,
  unit,
  reading_type,
  source,
  period
) VALUES
  (
    '11363',
    timestamptz '2026-03-31 20:00:00+03',
    9962.800,
    'м³',
    'hourly',
    'operator_backfill',
    'current'
  ),
  (
    '11363',
    timestamptz '2026-04-01 20:00:00+03',
    10045.800,
    'м³',
    'hourly',
    'operator_backfill',
    'current'
  ),
  (
    '11363',
    timestamptz '2026-04-02 20:00:00+03',
    10152.800,
    'м³',
    'hourly',
    'operator_backfill',
    'current'
  )
ON CONFLICT (device_id, reading_date, reading_type)
DO UPDATE SET
  reading_value = EXCLUDED.reading_value,
  source = EXCLUDED.source,
  updated_at = NOW();
