-- Проверка устройств, которые не записываются в базу данных

-- Вариант 1: Список всех устройств из таблицы beliot_devices и их последние записи
SELECT 
  d.device_id,
  d.name as device_name,
  d.object_name,
  MAX(r.reading_date) as last_reading_date,
  MAX(r.reading_value) as last_reading_value,
  MAX(r.updated_at) as last_updated_at,
  CASE 
    WHEN MAX(r.reading_date) IS NULL THEN '❌ Никогда не записывалось'
    WHEN MAX(r.reading_date) < CURRENT_DATE THEN '⚠️ Нет данных за сегодня'
    WHEN MAX(r.reading_date) < NOW() - INTERVAL '2 hours' THEN '⚠️ Данные устарели (>2 часов)'
    ELSE '✅ Данные актуальны'
  END as status,
  NOW() - MAX(r.reading_date) as time_since_last_reading
FROM beliot_devices d
LEFT JOIN beliot_device_readings r 
  ON d.device_id = r.device_id 
  AND r.reading_type = 'hourly'
GROUP BY d.device_id, d.name, d.object_name
ORDER BY 
  CASE 
    WHEN MAX(r.reading_date) IS NULL THEN 1
    WHEN MAX(r.reading_date) < CURRENT_DATE THEN 2
    WHEN MAX(r.reading_date) < NOW() - INTERVAL '2 hours' THEN 3
    ELSE 4
  END,
  d.name;

-- Вариант 2: Устройства без записей за последние 24 часа
SELECT 
  d.device_id,
  d.name as device_name,
  d.object_name,
  MAX(r.reading_date) as last_reading_date,
  COUNT(r.id) as total_readings,
  CASE 
    WHEN MAX(r.reading_date) IS NULL THEN '❌ Никогда не записывалось'
    WHEN MAX(r.reading_date) < NOW() - INTERVAL '24 hours' THEN '⚠️ Нет данных за 24 часа'
    ELSE '✅ Есть данные'
  END as status
FROM beliot_devices d
LEFT JOIN beliot_device_readings r 
  ON d.device_id = r.device_id 
  AND r.reading_type = 'hourly'
  AND r.reading_date >= NOW() - INTERVAL '24 hours'
GROUP BY d.device_id, d.name, d.object_name
HAVING MAX(r.reading_date) IS NULL OR MAX(r.reading_date) < NOW() - INTERVAL '24 hours'
ORDER BY d.name;

-- Вариант 3: Статистика по устройствам за сегодня
SELECT 
  d.device_id,
  d.name as device_name,
  d.object_name,
  COUNT(r.id) as readings_today,
  MIN(r.reading_date) as first_reading_today,
  MAX(r.reading_date) as last_reading_today,
  CASE 
    WHEN COUNT(r.id) = 0 THEN '❌ Нет данных за сегодня'
    WHEN COUNT(r.id) < EXTRACT(HOUR FROM NOW()) THEN '⚠️ Не все часы записаны'
    ELSE '✅ Данные за сегодня есть'
  END as status
FROM beliot_devices d
LEFT JOIN beliot_device_readings r 
  ON d.device_id = r.device_id 
  AND r.reading_type = 'hourly'
  AND r.reading_date >= CURRENT_DATE
  AND r.reading_date < CURRENT_DATE + INTERVAL '1 day'
GROUP BY d.device_id, d.name, d.object_name
ORDER BY 
  CASE 
    WHEN COUNT(r.id) = 0 THEN 1
    WHEN COUNT(r.id) < EXTRACT(HOUR FROM NOW()) THEN 2
    ELSE 3
  END,
  d.name;

-- Вариант 4: Сравнение количества устройств в таблице и записей за сегодня
SELECT 
  (SELECT COUNT(DISTINCT device_id) FROM beliot_devices) as total_devices,
  (SELECT COUNT(DISTINCT device_id) FROM beliot_device_readings 
   WHERE reading_date >= CURRENT_DATE 
   AND reading_type = 'hourly') as devices_with_readings_today,
  (SELECT COUNT(DISTINCT device_id) FROM beliot_devices) - 
  (SELECT COUNT(DISTINCT device_id) FROM beliot_device_readings 
   WHERE reading_date >= CURRENT_DATE 
   AND reading_type = 'hourly') as missing_devices_count;

-- Вариант 5: Детальный список устройств без записей за сегодня
SELECT 
  d.device_id,
  d.name as device_name,
  d.object_name,
  d.serial_number,
  d.manufacturer,
  MAX(r.reading_date) as last_ever_reading,
  MAX(r.reading_value) as last_ever_value,
  COUNT(CASE WHEN r.reading_date >= CURRENT_DATE THEN 1 END) as readings_today
FROM beliot_devices d
LEFT JOIN beliot_device_readings r 
  ON d.device_id = r.device_id 
  AND r.reading_type = 'hourly'
GROUP BY d.device_id, d.name, d.object_name, d.serial_number, d.manufacturer
HAVING COUNT(CASE WHEN r.reading_date >= CURRENT_DATE THEN 1 END) = 0
ORDER BY d.name;

