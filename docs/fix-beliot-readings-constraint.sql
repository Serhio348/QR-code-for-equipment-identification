-- ============================================================================
-- ИСПРАВЛЕНИЕ УНИКАЛЬНОГО ОГРАНИЧЕНИЯ ДЛЯ beliot_device_readings
-- 
-- Проблема: ON CONFLICT не работает, так как ограничение отсутствует
-- Решение: Создаем уникальное ограничение, если его нет
-- ============================================================================

-- Проверяем, существует ли ограничение
DO $$
BEGIN
  -- Проверяем, существует ли ограничение unique_device_reading
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_constraint 
    WHERE conname = 'unique_device_reading'
    AND conrelid = 'public.beliot_device_readings'::regclass
  ) THEN
    -- Создаем уникальное ограничение
    ALTER TABLE public.beliot_device_readings
    ADD CONSTRAINT unique_device_reading 
    UNIQUE (device_id, reading_date, reading_type);
    
    RAISE NOTICE 'Уникальное ограничение unique_device_reading создано';
  ELSE
    RAISE NOTICE 'Уникальное ограничение unique_device_reading уже существует';
  END IF;
END $$;

-- Проверяем, что ограничение работает
SELECT 
  conname AS constraint_name,
  contype AS constraint_type,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.beliot_device_readings'::regclass
  AND conname = 'unique_device_reading';

-- Проверяем функцию insert_beliot_reading
SELECT 
  proname AS function_name,
  pg_get_functiondef(oid) AS function_definition
FROM pg_proc
WHERE proname = 'insert_beliot_reading'
  AND pronamespace = 'public'::regnamespace;

