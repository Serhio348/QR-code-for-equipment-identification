-- Проверка данных для счетчика 11013 за 7, 8, 9 января 2026

-- Вариант 1: Все данные за период 7-9 января по часам
SELECT 
  device_id,
  DATE_TRUNC('hour', reading_date) as hour,
  reading_value,
  unit,
  reading_date,
  created_at,
  updated_at,
  EXTRACT(DAY FROM reading_date) as day_number
FROM beliot_device_readings
WHERE device_id = '11013'
  AND reading_date >= '2026-01-07T00:00:00.000Z'
  AND reading_date < '2026-01-10T00:00:00.000Z'
  AND reading_type = 'hourly'
ORDER BY reading_date DESC;

-- Вариант 2: Статистика по дням для счетчика 11013
SELECT 
  DATE(reading_date) as date,
  COUNT(*) as readings_count,
  MIN(reading_date) as first_reading,
  MAX(reading_date) as last_reading,
  MIN(reading_value) as min_value,
  MAX(reading_value) as max_value,
  MAX(reading_value) - MIN(reading_value) as consumption_per_day,
  MIN(created_at) as first_created,
  MAX(created_at) as last_created
FROM beliot_device_readings
WHERE device_id = '11013'
  AND reading_date >= '2026-01-07T00:00:00.000Z'
  AND reading_date < '2026-01-10T00:00:00.000Z'
  AND reading_type = 'hourly'
GROUP BY DATE(reading_date)
ORDER BY date DESC;

-- Вариант 3: Детальная информация по каждому дню
SELECT 
  device_id,
  DATE(reading_date) as date,
  EXTRACT(HOUR FROM reading_date) as hour,
  reading_value,
  unit,
  reading_date,
  created_at,
  updated_at,
  CASE 
    WHEN DATE(reading_date) = '2026-01-07' THEN '7 января'
    WHEN DATE(reading_date) = '2026-01-08' THEN '8 января'
    WHEN DATE(reading_date) = '2026-01-09' THEN '9 января'
    ELSE 'Другой день'
  END as day_label
FROM beliot_device_readings
WHERE device_id = '11013'
  AND reading_date >= '2026-01-07T00:00:00.000Z'
  AND reading_date < '2026-01-10T00:00:00.000Z'
  AND reading_type = 'hourly'
ORDER BY reading_date DESC;

-- Вариант 4: Проверка наличия данных по каждому дню (есть/нет)
SELECT 
  '2026-01-07'::date as check_date,
  COUNT(*) as readings_count,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ Есть данные'
    ELSE '❌ Нет данных'
  END as status,
  MIN(reading_date) as first_reading,
  MAX(reading_date) as last_reading
FROM beliot_device_readings
WHERE device_id = '11013'
  AND reading_date >= '2026-01-07T00:00:00.000Z'
  AND reading_date < '2026-01-08T00:00:00.000Z'
  AND reading_type = 'hourly'

UNION ALL

SELECT 
  '2026-01-08'::date as check_date,
  COUNT(*) as readings_count,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ Есть данные'
    ELSE '❌ Нет данных'
  END as status,
  MIN(reading_date) as first_reading,
  MAX(reading_date) as last_reading
FROM beliot_device_readings
WHERE device_id = '11013'
  AND reading_date >= '2026-01-08T00:00:00.000Z'
  AND reading_date < '2026-01-09T00:00:00.000Z'
  AND reading_type = 'hourly'

UNION ALL

SELECT 
  '2026-01-09'::date as check_date,
  COUNT(*) as readings_count,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ Есть данные'
    ELSE '❌ Нет данных'
  END as status,
  MIN(reading_date) as first_reading,
  MAX(reading_date) as last_reading
FROM beliot_device_readings
WHERE device_id = '11013'
  AND reading_date >= '2026-01-09T00:00:00.000Z'
  AND reading_date < '2026-01-10T00:00:00.000Z'
  AND reading_type = 'hourly'

ORDER BY check_date DESC;

-- Вариант 5: Сравнение всех устройств за период 7-9 января
SELECT 
  device_id,
  DATE(reading_date) as date,
  COUNT(*) as readings_count,
  MIN(reading_date) as first_reading,
  MAX(reading_date) as last_reading
FROM beliot_device_readings
WHERE reading_date >= '2026-01-07T00:00:00.000Z'
  AND reading_date < '2026-01-10T00:00:00.000Z'
  AND reading_type = 'hourly'
GROUP BY device_id, DATE(reading_date)
ORDER BY device_id, date DESC;

-- Вариант 6: Сводная таблица по всем устройствам (есть ли данные за каждый день)
SELECT 
  device_id,
  COUNT(CASE WHEN DATE(reading_date) = '2026-01-07' THEN 1 END) as jan_7_count,
  COUNT(CASE WHEN DATE(reading_date) = '2026-01-08' THEN 1 END) as jan_8_count,
  COUNT(CASE WHEN DATE(reading_date) = '2026-01-09' THEN 1 END) as jan_9_count,
  COUNT(*) as total_readings,
  CASE 
    WHEN COUNT(CASE WHEN DATE(reading_date) = '2026-01-07' THEN 1 END) > 0 
     AND COUNT(CASE WHEN DATE(reading_date) = '2026-01-08' THEN 1 END) > 0
     AND COUNT(CASE WHEN DATE(reading_date) = '2026-01-09' THEN 1 END) > 0
    THEN '✅ Данные за все дни'
    WHEN COUNT(CASE WHEN DATE(reading_date) = '2026-01-07' THEN 1 END) = 0 
     AND COUNT(CASE WHEN DATE(reading_date) = '2026-01-08' THEN 1 END) = 0
     AND COUNT(CASE WHEN DATE(reading_date) = '2026-01-09' THEN 1 END) = 0
    THEN '❌ Нет данных'
    ELSE '⚠️ Данные частично'
  END as status
FROM beliot_device_readings
WHERE reading_date >= '2026-01-07T00:00:00.000Z'
  AND reading_date < '2026-01-10T00:00:00.000Z'
  AND reading_type = 'hourly'
GROUP BY device_id
ORDER BY device_id;

