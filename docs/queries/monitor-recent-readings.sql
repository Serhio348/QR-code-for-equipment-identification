-- Мониторинг последних записей для проверки корректности работы скрипта

-- Вариант 1: Последние 10 записей (все счетчики)
SELECT 
  device_id,
  DATE_TRUNC('hour', reading_date) as hour,
  reading_value,
  unit,
  reading_date as exact_reading_date,
  created_at,
  updated_at,
  EXTRACT(MINUTE FROM created_at) as minute_created,
  EXTRACT(HOUR FROM created_at) as hour_created,
  EXTRACT(HOUR FROM reading_date) as hour_reading,
  CASE 
    WHEN EXTRACT(HOUR FROM created_at) - EXTRACT(HOUR FROM reading_date) = 1 THEN '✅ Корректно (запись за предыдущий час)'
    WHEN EXTRACT(HOUR FROM created_at) = EXTRACT(HOUR FROM reading_date) THEN '⚠️ Запись за текущий час'
    ELSE '❌ Несоответствие'
  END as status
FROM beliot_device_readings
WHERE reading_type = 'hourly'
ORDER BY created_at DESC
LIMIT 10;

-- Вариант 2: Последние записи за последний час (для конкретного счетчика)
-- Замените '11013' на нужный device_id
SELECT 
  device_id,
  DATE_TRUNC('hour', reading_date) as hour,
  reading_value,
  unit,
  reading_date as exact_reading_date,
  created_at,
  updated_at,
  EXTRACT(MINUTE FROM created_at) as minute_created,
  EXTRACT(HOUR FROM created_at) as hour_created,
  EXTRACT(HOUR FROM reading_date) as hour_reading,
  CASE 
    WHEN EXTRACT(HOUR FROM created_at) - EXTRACT(HOUR FROM reading_date) = 1 THEN '✅ Корректно'
    WHEN EXTRACT(HOUR FROM created_at) = EXTRACT(HOUR FROM reading_date) THEN '⚠️ Проверить'
    ELSE '❌ Ошибка'
  END as status
FROM beliot_device_readings
WHERE device_id = '11013'
  AND reading_type = 'hourly'
  AND created_at >= NOW() - INTERVAL '2 hours'
ORDER BY created_at DESC;

-- Вариант 3: Статистика за последние 24 часа
SELECT 
  DATE_TRUNC('hour', reading_date) as hour,
  COUNT(*) as readings_count,
  COUNT(DISTINCT device_id) as devices_count,
  MIN(created_at) as first_created,
  MAX(created_at) as last_created,
  AVG(EXTRACT(MINUTE FROM created_at)) as avg_minute_created,
  CASE 
    WHEN AVG(EXTRACT(HOUR FROM created_at) - EXTRACT(HOUR FROM reading_date)) BETWEEN 0.8 AND 1.2 
    THEN '✅ Нормально'
    ELSE '⚠️ Проверить'
  END as status
FROM beliot_device_readings
WHERE reading_type = 'hourly'
  AND reading_date >= NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', reading_date)
ORDER BY hour DESC;

-- Вариант 4: Проверка конкретного счетчика за сегодня
-- Замените '11013' на нужный device_id
SELECT 
  device_id,
  DATE_TRUNC('hour', reading_date) as hour,
  reading_value,
  unit,
  created_at,
  EXTRACT(MINUTE FROM created_at) as minute_created,
  EXTRACT(HOUR FROM created_at) as hour_created,
  EXTRACT(HOUR FROM reading_date) as hour_reading,
  CASE 
    WHEN EXTRACT(HOUR FROM created_at) - EXTRACT(HOUR FROM reading_date) = 1 THEN '✅'
    WHEN EXTRACT(HOUR FROM created_at) = EXTRACT(HOUR FROM reading_date) THEN '⚠️'
    ELSE '❌'
  END as status
FROM beliot_device_readings
WHERE device_id = '11013'
  AND reading_date >= CURRENT_DATE
  AND reading_type = 'hourly'
ORDER BY hour DESC;

-- Вариант 5: Поиск потенциальных проблем (несоответствие времени)
SELECT 
  device_id,
  DATE_TRUNC('hour', reading_date) as hour_reading,
  reading_value,
  created_at,
  EXTRACT(HOUR FROM created_at) as hour_created,
  EXTRACT(MINUTE FROM created_at) as minute_created,
  EXTRACT(HOUR FROM created_at) - EXTRACT(HOUR FROM reading_date) as hour_diff,
  CASE 
    WHEN EXTRACT(HOUR FROM created_at) - EXTRACT(HOUR FROM reading_date) > 2 THEN '❌ Слишком большая разница'
    WHEN EXTRACT(HOUR FROM created_at) - EXTRACT(HOUR FROM reading_date) < 0 THEN '❌ Отрицательная разница'
    WHEN EXTRACT(HOUR FROM created_at) - EXTRACT(HOUR FROM reading_date) = 1 THEN '✅ Нормально'
    WHEN EXTRACT(HOUR FROM created_at) = EXTRACT(HOUR FROM reading_date) THEN '⚠️ Запись за текущий час'
    ELSE '⚠️ Проверить'
  END as status
FROM beliot_device_readings
WHERE reading_type = 'hourly'
  AND created_at >= NOW() - INTERVAL '6 hours'
ORDER BY created_at DESC;

