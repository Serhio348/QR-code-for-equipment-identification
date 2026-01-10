-- Проверка данных за вчерашнее число

-- Вариант 1: Все данные за вчера (по UTC)
SELECT 
  device_id,
  DATE_TRUNC('hour', reading_date) as hour,
  reading_value,
  unit,
  reading_date,
  created_at,
  updated_at
FROM beliot_device_readings
WHERE reading_date >= CURRENT_DATE - INTERVAL '1 day'
  AND reading_date < CURRENT_DATE
  AND reading_type = 'hourly'
ORDER BY device_id, hour DESC;

-- Вариант 2: Данные за вчера для конкретного устройства (замените '11013' на нужный device_id)
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
  AND reading_date >= CURRENT_DATE - INTERVAL '1 day'
  AND reading_date < CURRENT_DATE
  AND reading_type = 'hourly'
ORDER BY hour DESC;

-- Вариант 3: Проверка последних записей (последние 48 часов)
SELECT 
  device_id,
  DATE_TRUNC('hour', reading_date) as hour,
  reading_value,
  unit,
  reading_date,
  EXTRACT(EPOCH FROM (NOW() - reading_date)) / 3600 as hours_ago,
  CASE 
    WHEN reading_date >= CURRENT_DATE THEN 'Сегодня'
    WHEN reading_date >= CURRENT_DATE - INTERVAL '1 day' THEN 'Вчера'
    ELSE 'Ранее'
  END as period
FROM beliot_device_readings
WHERE reading_date >= NOW() - INTERVAL '48 hours'
  AND reading_type = 'hourly'
ORDER BY reading_date DESC
LIMIT 100;

-- Вариант 4: Статистика по дням (последние 7 дней)
SELECT 
  DATE(reading_date) as date,
  COUNT(*) as readings_count,
  COUNT(DISTINCT device_id) as devices_count,
  MIN(reading_date) as first_reading,
  MAX(reading_date) as last_reading
FROM beliot_device_readings
WHERE reading_date >= CURRENT_DATE - INTERVAL '7 days'
  AND reading_type = 'hourly'
GROUP BY DATE(reading_date)
ORDER BY date DESC;

-- Вариант 5: Проверка наличия данных за вчера для всех устройств
-- Примечание: Устройства не хранятся в базе, они загружаются из Beliot API
-- Поэтому показываем только устройства, для которых есть данные
SELECT 
  r.device_id,
  COUNT(r.id) as readings_yesterday,
  MIN(r.reading_date) as first_reading_yesterday,
  MAX(r.reading_date) as last_reading_yesterday,
  MIN(r.reading_value) as min_value,
  MAX(r.reading_value) as max_value
FROM beliot_device_readings r
WHERE r.reading_date >= CURRENT_DATE - INTERVAL '1 day'
  AND r.reading_date < CURRENT_DATE
  AND r.reading_type = 'hourly'
GROUP BY r.device_id
ORDER BY readings_yesterday DESC, r.device_id;

-- Вариант 6: Проверка часовых поясов и времени записи
SELECT 
  device_id,
  reading_date as reading_date_utc,
  reading_date AT TIME ZONE 'UTC' as reading_date_utc_display,
  reading_date AT TIME ZONE 'Europe/Minsk' as reading_date_local,
  reading_value,
  created_at,
  updated_at,
  EXTRACT(HOUR FROM reading_date AT TIME ZONE 'Europe/Minsk') as local_hour
FROM beliot_device_readings
WHERE reading_date >= CURRENT_DATE - INTERVAL '2 days'
  AND reading_type = 'hourly'
ORDER BY reading_date DESC
LIMIT 50;

