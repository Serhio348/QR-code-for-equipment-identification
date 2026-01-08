-- ============================================================================
-- ЗАПРОС: Данные по определенному счетчику за определенный период
-- ============================================================================
-- Этот запрос показывает все показания конкретного счетчика за выбранный период
-- ============================================================================

-- ШАГ 1: Найдите device_id вашего счетчика
-- В клиентском приложении:
-- 1. Откройте таблицу со счетчиками
-- 2. Наведите курсор на нужный счетчик
-- 3. В правой панели найдите поле "device_id" или "ID устройства"
-- 4. Скопируйте значение (например: "12345" или "67890")

-- ШАГ 2: Замените значения ниже на ваши

-- ============================================================================
-- ПРИМЕР 1: Данные за конкретный день
-- ============================================================================

SELECT 
  device_id,
  reading_date,
  reading_value,
  unit,
  updated_at
FROM beliot_device_readings
WHERE device_id = '12345'  -- ⬅️ ЗАМЕНИТЕ на ваш device_id
  AND reading_date >= '2026-01-08 00:00:00+00'  -- ⬅️ Начало периода
  AND reading_date < '2026-01-09 00:00:00+00'   -- ⬅️ Конец периода (не включительно)
ORDER BY reading_date DESC;

-- ============================================================================
-- ПРИМЕР 2: Данные за последние 7 дней (динамически)
-- ============================================================================

SELECT 
  device_id,
  reading_date,
  reading_value,
  unit,
  updated_at,
  reading_date::date AS date_only
FROM beliot_device_readings
WHERE device_id = '12345'  -- ⬅️ ЗАМЕНИТЕ на ваш device_id
  AND reading_date >= date_trunc('day', NOW() - INTERVAL '7 days')
ORDER BY reading_date DESC;

-- ============================================================================
-- ПРИМЕР 3: Данные за конкретный месяц
-- ============================================================================

SELECT 
  device_id,
  reading_date,
  reading_value,
  unit,
  updated_at
FROM beliot_device_readings
WHERE device_id = '12345'  -- ⬅️ ЗАМЕНИТЕ на ваш device_id
  AND reading_date >= '2026-01-01 00:00:00+00'  -- Начало месяца
  AND reading_date < '2026-02-01 00:00:00+00'   -- Начало следующего месяца
ORDER BY reading_date DESC;

-- ============================================================================
-- ПРИМЕР 4: Данные за последние 24 часа (по часам)
-- ============================================================================

SELECT 
  device_id,
  reading_date,
  reading_value,
  unit,
  updated_at,
  EXTRACT(HOUR FROM reading_date) AS hour
FROM beliot_device_readings
WHERE device_id = '12345'  -- ⬅️ ЗАМЕНИТЕ на ваш device_id
  AND reading_date >= date_trunc('hour', NOW() - INTERVAL '24 hours')
ORDER BY reading_date DESC;

-- ============================================================================
-- ПРИМЕР 5: Данные за произвольный период (с параметрами)
-- ============================================================================

-- Замените значения в WHERE:
-- '12345' - device_id счетчика
-- '2026-01-01 00:00:00+00' - начало периода
-- '2026-01-31 23:59:59+00' - конец периода

SELECT 
  device_id,
  reading_date,
  reading_value,
  unit,
  updated_at
FROM beliot_device_readings
WHERE device_id = '12345'  -- ⬅️ ЗАМЕНИТЕ
  AND reading_date >= '2026-01-01 00:00:00+00'  -- ⬅️ ЗАМЕНИТЕ
  AND reading_date <= '2026-01-31 23:59:59+00'  -- ⬅️ ЗАМЕНИТЕ
ORDER BY reading_date DESC;

-- ============================================================================
-- ПРИМЕР 6: Данные с расчетом потребления (объема) за период
-- ============================================================================

WITH ordered_readings AS (
  SELECT 
    device_id,
    reading_date,
    reading_value,
    unit,
    LAG(reading_value) OVER (ORDER BY reading_date) AS previous_value,
    reading_value - LAG(reading_value) OVER (ORDER BY reading_date) AS consumption
  FROM beliot_device_readings
  WHERE device_id = '12345'  -- ⬅️ ЗАМЕНИТЕ на ваш device_id
    AND reading_date >= '2026-01-01 00:00:00+00'  -- ⬅️ Начало периода
    AND reading_date <= '2026-01-31 23:59:59+00'  -- ⬅️ Конец периода
)
SELECT 
  device_id,
  reading_date,
  reading_value,
  previous_value,
  consumption,
  unit
FROM ordered_readings
ORDER BY reading_date DESC;

-- ============================================================================
-- ПРИМЕР 7: Статистика по счетчику за период
-- ============================================================================

SELECT 
  device_id,
  COUNT(*) AS total_readings,
  MIN(reading_date) AS first_reading,
  MAX(reading_date) AS last_reading,
  MIN(reading_value) AS min_value,
  MAX(reading_value) AS max_value,
  MAX(reading_value) - MIN(reading_value) AS total_consumption,
  AVG(reading_value) AS avg_value
FROM beliot_device_readings
WHERE device_id = '12345'  -- ⬅️ ЗАМЕНИТЕ на ваш device_id
  AND reading_date >= '2026-01-01 00:00:00+00'  -- ⬅️ Начало периода
  AND reading_date <= '2026-01-31 23:59:59+00'  -- ⬅️ Конец периода
GROUP BY device_id;

-- ============================================================================
-- ПРИМЕР 8: Все device_id в базе (чтобы найти нужный счетчик)
-- ============================================================================

SELECT DISTINCT device_id
FROM beliot_device_readings
ORDER BY device_id;

-- ============================================================================
-- ПРИМЕР 9: Список всех счетчиков с последним показанием
-- ============================================================================

SELECT DISTINCT ON (device_id)
  device_id,
  reading_date,
  reading_value,
  unit,
  updated_at
FROM beliot_device_readings
ORDER BY device_id, reading_date DESC;

