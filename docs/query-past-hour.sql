-- ============================================================================
-- ЗАПРОС: Данные за прошлый час
-- ============================================================================
-- Этот запрос показывает все показания счетчиков за прошлый час
-- (относительно текущего времени)
-- ============================================================================

SELECT 
  device_id,
  reading_date,
  reading_value,
  unit,
  updated_at,
  NOW() - reading_date AS hours_ago
FROM beliot_device_readings
WHERE reading_date >= date_trunc('hour', NOW() - INTERVAL '1 hour')
  AND reading_date < date_trunc('hour', NOW())
ORDER BY reading_date DESC, device_id;

-- ============================================================================
-- АЛЬТЕРНАТИВНЫЙ ЗАПРОС: Данные за конкретный час
-- ============================================================================
-- Если нужно посмотреть данные за конкретный час, замените дату ниже
-- Пример: данные за 08.01.2026 13:00

/*
SELECT 
  device_id,
  reading_date,
  reading_value,
  unit,
  updated_at
FROM beliot_device_readings
WHERE reading_date >= '2026-01-08 13:00:00+00'
  AND reading_date < '2026-01-08 14:00:00+00'
ORDER BY reading_date DESC, device_id;
*/

-- ============================================================================
-- ЗАПРОС: Последние 24 часа (для проверки работы cron)
-- ============================================================================

/*
SELECT 
  device_id,
  reading_date,
  reading_value,
  unit,
  updated_at,
  NOW() - updated_at AS time_since_update
FROM beliot_device_readings
WHERE reading_date >= date_trunc('hour', NOW() - INTERVAL '24 hours')
ORDER BY reading_date DESC, device_id;
*/

