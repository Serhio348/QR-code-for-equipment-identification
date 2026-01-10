-- Проверка данных за сегодня по часам для всех счетчиков
-- Показывает данные за каждый час сегодняшнего дня

SELECT 
  device_id,
  DATE_TRUNC('hour', reading_date) as hour,
  reading_value,
  unit,
  reading_type,
  created_at,
  updated_at,
  COUNT(*) OVER (PARTITION BY device_id, DATE_TRUNC('hour', reading_date)) as readings_count
FROM beliot_device_readings
WHERE reading_date >= CURRENT_DATE
  AND reading_date < CURRENT_DATE + INTERVAL '1 day'
  AND reading_type = 'hourly'
ORDER BY device_id, hour DESC;

-- Альтернативный вариант: сгруппированные данные по часам
-- Показывает последнее показание для каждого часа каждого счетчика

SELECT 
  device_id,
  DATE_TRUNC('hour', reading_date) as hour,
  MAX(reading_value) as last_reading_value,
  MAX(reading_date) as last_reading_date,
  MAX(updated_at) as last_updated_at,
  COUNT(*) as readings_count
FROM beliot_device_readings
WHERE reading_date >= CURRENT_DATE
  AND reading_date < CURRENT_DATE + INTERVAL '1 day'
  AND reading_type = 'hourly'
GROUP BY device_id, DATE_TRUNC('hour', reading_date)
ORDER BY device_id, hour DESC;

-- Вариант 3: Проверка конкретного счетчика за сегодня

-- Замените 'YOUR_DEVICE_ID' на ID нужного счетчика
-- Например: '10586', '10596', '10597' и т.д.

SELECT 
  device_id,
  DATE_TRUNC('hour', reading_date) as hour,
  reading_value,
  unit,
  reading_date,
  created_at,
  updated_at
FROM beliot_device_readings
WHERE device_id = '10586'  -- Замените на нужный device_id
  AND reading_date >= CURRENT_DATE
  AND reading_date < CURRENT_DATE + INTERVAL '1 day'
  AND reading_type = 'hourly'
ORDER BY hour DESC;

-- Вариант 4: Таблица с часами (даже если данных нет)
-- Показывает все часы сегодняшнего дня и данные для каждого счетчика

WITH hours_today AS (
  SELECT generate_series(
    DATE_TRUNC('hour', CURRENT_DATE),
    DATE_TRUNC('hour', CURRENT_DATE) + INTERVAL '23 hours',
    INTERVAL '1 hour'
  )::timestamp as hour
),
devices AS (
  SELECT DISTINCT device_id
  FROM beliot_device_readings
  WHERE reading_date >= CURRENT_DATE - INTERVAL '7 days'  -- Устройства за последние 7 дней
),
all_combinations AS (
  SELECT d.device_id, h.hour
  FROM devices d
  CROSS JOIN hours_today h
)
SELECT 
  ac.device_id,
  ac.hour,
  r.reading_value,
  r.unit,
  r.reading_date as actual_reading_date,
  r.created_at,
  r.updated_at,
  CASE WHEN r.id IS NULL THEN 'Нет данных' ELSE 'Есть данные' END as status
FROM all_combinations ac
LEFT JOIN beliot_device_readings r 
  ON r.device_id = ac.device_id
  AND DATE_TRUNC('hour', r.reading_date) = ac.hour
  AND r.reading_type = 'hourly'
ORDER BY ac.device_id, ac.hour DESC;

-- Вариант 5: Сводка по всем счетчикам за сегодня
-- Показывает количество записей и диапазон часов для каждого счетчика

SELECT 
  device_id,
  COUNT(*) as total_readings,
  MIN(DATE_TRUNC('hour', reading_date)) as first_hour,
  MAX(DATE_TRUNC('hour', reading_date)) as last_hour,
  COUNT(DISTINCT DATE_TRUNC('hour', reading_date)) as unique_hours,
  MIN(reading_value) as min_value,
  MAX(reading_value) as max_value,
  MAX(reading_value) - MIN(reading_value) as consumption_today
FROM beliot_device_readings
WHERE reading_date >= CURRENT_DATE
  AND reading_date < CURRENT_DATE + INTERVAL '1 day'
  AND reading_type = 'hourly'
GROUP BY device_id
ORDER BY device_id;

-- Вариант 6: Детальная проверка конкретного часа
-- Показывает все записи за конкретный час (например, 16:00)

SELECT 
  device_id,
  reading_date,
  reading_value,
  unit,
  created_at,
  updated_at,
  EXTRACT(HOUR FROM reading_date) as hour,
  EXTRACT(MINUTE FROM reading_date) as minute
FROM beliot_device_readings
WHERE DATE_TRUNC('hour', reading_date) = DATE_TRUNC('hour', CURRENT_TIMESTAMP) - INTERVAL '1 hour'  -- Предыдущий час
  AND reading_type = 'hourly'
ORDER BY device_id, reading_date DESC;

