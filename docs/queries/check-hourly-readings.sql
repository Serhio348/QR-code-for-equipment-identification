-- ============================================================================
-- ПРОВЕРКА: Есть ли данные за каждый час
-- ============================================================================
-- Этот запрос показывает, сколько показаний сохранено за последние 24 часа
-- и есть ли пропуски по часам
-- ============================================================================

-- 1. Общая статистика за последние 24 часа
SELECT 
  COUNT(*) as total_readings,
  COUNT(DISTINCT device_id) as unique_devices,
  MIN(reading_date) as earliest_reading,
  MAX(reading_date) as latest_reading,
  MAX(reading_date) - MIN(reading_date) as time_span
FROM beliot_device_readings
WHERE reading_date >= date_trunc('hour', NOW() - INTERVAL '24 hours');

-- 2. Показания по часам (последние 24 часа)
SELECT 
  date_trunc('hour', reading_date) as hour,
  COUNT(*) as readings_count,
  COUNT(DISTINCT device_id) as devices_count,
  STRING_AGG(DISTINCT device_id, ', ') as device_ids
FROM beliot_device_readings
WHERE reading_date >= date_trunc('hour', NOW() - INTERVAL '24 hours')
GROUP BY date_trunc('hour', reading_date)
ORDER BY hour DESC;

-- 3. Пропущенные часы (где нет данных)
WITH hours AS (
  SELECT generate_series(
    date_trunc('hour', NOW() - INTERVAL '24 hours'),
    date_trunc('hour', NOW()),
    INTERVAL '1 hour'
  ) AS hour
),
devices AS (
  SELECT DISTINCT device_id 
  FROM beliot_device_readings
  WHERE reading_date >= date_trunc('hour', NOW() - INTERVAL '24 hours')
),
expected AS (
  SELECT h.hour, d.device_id
  FROM hours h
  CROSS JOIN devices d
),
actual AS (
  SELECT 
    date_trunc('hour', reading_date) as hour,
    device_id
  FROM beliot_device_readings
  WHERE reading_date >= date_trunc('hour', NOW() - INTERVAL '24 hours')
  GROUP BY date_trunc('hour', reading_date), device_id
)
SELECT 
  e.hour,
  e.device_id,
  CASE WHEN a.hour IS NULL THEN 'ПРОПУЩЕНО' ELSE 'ЕСТЬ' END as status
FROM expected e
LEFT JOIN actual a ON e.hour = a.hour AND e.device_id = a.device_id
WHERE a.hour IS NULL
ORDER BY e.hour DESC, e.device_id;

-- 4. Последние показания для каждого устройства
SELECT 
  device_id,
  reading_date,
  reading_value,
  unit,
  created_at,
  updated_at,
  NOW() - reading_date as hours_ago
FROM beliot_device_readings r1
WHERE reading_date = (
  SELECT MAX(reading_date)
  FROM beliot_device_readings r2
  WHERE r2.device_id = r1.device_id
)
ORDER BY reading_date DESC, device_id;

-- 5. Проверка работы cron job (должно быть ~10 записей каждый час)
SELECT 
  date_trunc('hour', reading_date) as hour,
  COUNT(*) as readings_count,
  CASE 
    WHEN COUNT(*) >= 8 THEN '✅ Нормально'
    WHEN COUNT(*) >= 5 THEN '⚠️ Мало данных'
    ELSE '❌ Проблема'
  END as status
FROM beliot_device_readings
WHERE reading_date >= date_trunc('hour', NOW() - INTERVAL '24 hours')
GROUP BY date_trunc('hour', reading_date)
ORDER BY hour DESC;

