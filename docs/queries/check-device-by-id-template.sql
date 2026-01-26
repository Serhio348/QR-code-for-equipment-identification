-- Шаблон: Проверка данных за каждый час сегодня для конкретного счетчика
-- 
-- ИСПОЛЬЗОВАНИЕ:
-- 1. Замените 'YOUR_DEVICE_ID' на нужный device_id
-- 2. При необходимости измените дату (CURRENT_DATE можно заменить на конкретную дату)
--
-- ПРИМЕР:
-- WHERE device_id = '11013'  -- замените на ваш device_id

-- Вариант 1: Все записи за сегодня по часам
SELECT 
  device_id,
  DATE_TRUNC('hour', reading_date) as hour,
  reading_value,
  unit,
  reading_date as exact_reading_date,
  created_at,
  updated_at
FROM beliot_device_readings
WHERE device_id = 'YOUR_DEVICE_ID'  -- ЗАМЕНИТЕ на нужный device_id
  AND reading_date >= CURRENT_DATE
  AND reading_date < CURRENT_DATE + INTERVAL '1 day'
  AND reading_type = 'hourly'
ORDER BY hour DESC;

-- Вариант 2: Сгруппированные данные (последнее показание для каждого часа)
SELECT 
  device_id,
  DATE_TRUNC('hour', reading_date) as hour,
  MAX(reading_value) as reading_value,
  MAX(unit) as unit,
  MAX(reading_date) as last_reading_date,
  MAX(updated_at) as last_updated_at,
  COUNT(*) as readings_count
FROM beliot_device_readings
WHERE device_id = 'YOUR_DEVICE_ID'  -- ЗАМЕНИТЕ на нужный device_id
  AND reading_date >= CURRENT_DATE
  AND reading_date < CURRENT_DATE + INTERVAL '1 day'
  AND reading_type = 'hourly'
GROUP BY device_id, DATE_TRUNC('hour', reading_date)
ORDER BY hour DESC;

-- Вариант 3: Таблица со всеми часами (даже если данных нет)
-- Показывает все 24 часа сегодня и данные для счетчика
WITH hours_today AS (
  SELECT generate_series(
    DATE_TRUNC('hour', CURRENT_DATE),
    DATE_TRUNC('hour', CURRENT_DATE) + INTERVAL '23 hours',
    INTERVAL '1 hour'
  )::timestamp as hour
)
SELECT 
  'YOUR_DEVICE_ID' as device_id,  -- ЗАМЕНИТЕ на нужный device_id
  h.hour,
  r.reading_value,
  r.unit,
  r.reading_date as actual_reading_date,
  r.created_at,
  r.updated_at,
  CASE 
    WHEN r.id IS NULL THEN 'Нет данных' 
    ELSE 'Есть данные' 
  END as status,
  EXTRACT(HOUR FROM h.hour) as hour_number
FROM hours_today h
LEFT JOIN beliot_device_readings r 
  ON r.device_id = 'YOUR_DEVICE_ID'  -- ЗАМЕНИТЕ на нужный device_id
  AND DATE_TRUNC('hour', r.reading_date) = h.hour
  AND r.reading_type = 'hourly'
ORDER BY h.hour DESC;

-- Вариант 4: Сводка за сегодня
SELECT 
  device_id,
  COUNT(*) as total_readings,
  MIN(DATE_TRUNC('hour', reading_date)) as first_hour,
  MAX(DATE_TRUNC('hour', reading_date)) as last_hour,
  COUNT(DISTINCT DATE_TRUNC('hour', reading_date)) as unique_hours,
  MIN(reading_value) as min_value,
  MAX(reading_value) as max_value,
  MAX(reading_value) - MIN(reading_value) as consumption_today,
  ROUND(AVG(reading_value), 3) as avg_value
FROM beliot_device_readings
WHERE device_id = 'YOUR_DEVICE_ID'  -- ЗАМЕНИТЕ на нужный device_id
  AND reading_date >= CURRENT_DATE
  AND reading_date < CURRENT_DATE + INTERVAL '1 day'
  AND reading_type = 'hourly'
GROUP BY device_id;
