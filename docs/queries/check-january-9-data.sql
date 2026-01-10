-- Проверка данных за 9 января 2026 (вчера)

-- Вариант 1: Все данные за 9 января (по UTC)
SELECT 
  device_id,
  DATE_TRUNC('hour', reading_date) as hour,
  reading_value,
  unit,
  reading_date,
  created_at,
  updated_at
FROM beliot_device_readings
WHERE reading_date >= '2026-01-09T00:00:00.000Z'
  AND reading_date < '2026-01-10T00:00:00.000Z'
  AND reading_type = 'hourly'
ORDER BY device_id, hour DESC;

-- Вариант 2: Данные за 9 января для конкретного устройства (замените '11013' на нужный device_id)
SELECT 
  device_id,
  DATE_TRUNC('hour', reading_date) as hour,
  reading_value,
  unit,
  reading_date,
  created_at,
  updated_at
FROM beliot_device_readings
WHERE device_id = '11013'
  AND reading_date >= '2026-01-09T00:00:00.000Z'
  AND reading_date < '2026-01-10T00:00:00.000Z'
  AND reading_type = 'hourly'
ORDER BY hour DESC;

-- Вариант 3: Статистика по дням (последние 3 дня)
SELECT 
  DATE(reading_date) as date,
  COUNT(*) as readings_count,
  COUNT(DISTINCT device_id) as devices_count,
  MIN(reading_date) as first_reading,
  MAX(reading_date) as last_reading,
  MIN(created_at) as first_created,
  MAX(created_at) as last_created
FROM beliot_device_readings
WHERE reading_date >= '2026-01-08T00:00:00.000Z'
  AND reading_date < '2026-01-11T00:00:00.000Z'
  AND reading_type = 'hourly'
GROUP BY DATE(reading_date)
ORDER BY date DESC;

-- Вариант 4: Проверка всех записей за последние 3 дня (с группировкой по дням и устройствам)
SELECT 
  DATE(reading_date) as date,
  device_id,
  COUNT(*) as readings_count,
  MIN(reading_date) as first_reading,
  MAX(reading_date) as last_reading
FROM beliot_device_readings
WHERE reading_date >= '2026-01-08T00:00:00.000Z'
  AND reading_date < '2026-01-11T00:00:00.000Z'
  AND reading_type = 'hourly'
GROUP BY DATE(reading_date), device_id
ORDER BY date DESC, device_id;

-- Вариант 5: Проверка времени создания записей (когда они были записаны в базу)
SELECT 
  DATE(reading_date) as reading_date_only,
  DATE(created_at) as created_date,
  COUNT(*) as readings_count,
  MIN(created_at) as first_created,
  MAX(created_at) as last_created,
  CASE 
    WHEN DATE(reading_date) = DATE(created_at) THEN '✅ Записано в тот же день'
    WHEN DATE(reading_date) < DATE(created_at) THEN '⚠️ Записано позже (возможно, пропуск)'
    ELSE '❓ Записано раньше'
  END as status
FROM beliot_device_readings
WHERE reading_date >= '2026-01-08T00:00:00.000Z'
  AND reading_date < '2026-01-11T00:00:00.000Z'
  AND reading_type = 'hourly'
GROUP BY DATE(reading_date), DATE(created_at)
ORDER BY reading_date_only DESC, created_date DESC;

