-- ============================================================================
-- СОЗДАНИЕ ТАБЛИЦЫ beliot_device_readings
-- Показания счетчиков Beliot
-- 
-- Дата создания: 2026-01-07
-- Обновлено: 2026-01-08 (точность до 3 знаков после запятой)
-- Статус: Этап 1 миграции Beliot на Supabase
-- 
-- ВАЖНО: 
-- - Точность reading_value: NUMERIC(12, 3) - до 0.001 м³
-- - Функция insert_beliot_reading всегда обновляет updated_at при каждом вызове
-- ============================================================================

-- ============================================================================
-- ТАБЛИЦА: beliot_device_readings
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.beliot_device_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  reading_date TIMESTAMPTZ NOT NULL,
  reading_value NUMERIC(12, 3) NOT NULL,
  unit TEXT DEFAULT 'м³',
  reading_type TEXT DEFAULT 'hourly' CHECK (reading_type IN ('hourly', 'daily')),
  source TEXT DEFAULT 'api',
  period TEXT DEFAULT 'current' CHECK (period IN ('current', 'previous')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Уникальность: одно показание за период для устройства
  CONSTRAINT unique_device_reading UNIQUE (device_id, reading_date, reading_type)
);

-- ============================================================================
-- ИНДЕКСЫ
-- ============================================================================

-- Удаляем индексы, если они существуют (для повторного запуска)
DROP INDEX IF EXISTS idx_beliot_readings_device_date;
DROP INDEX IF EXISTS idx_beliot_readings_date;
DROP INDEX IF EXISTS idx_beliot_readings_device_type;

-- Составной индекс для быстрого поиска по устройству и дате
CREATE INDEX idx_beliot_readings_device_date 
  ON public.beliot_device_readings(device_id, reading_date DESC);

-- Индекс для сортировки по дате (для общих запросов)
CREATE INDEX idx_beliot_readings_date 
  ON public.beliot_device_readings(reading_date DESC);

-- Индекс для поиска по устройству и типу показания
CREATE INDEX idx_beliot_readings_device_type 
  ON public.beliot_device_readings(device_id, reading_type);

-- ============================================================================
-- RLS ПОЛИТИКИ (Row Level Security)
-- ============================================================================

-- Включаем RLS
ALTER TABLE public.beliot_device_readings ENABLE ROW LEVEL SECURITY;

-- Все авторизованные пользователи могут читать показания
CREATE POLICY "Users can read readings"
  ON public.beliot_device_readings FOR SELECT
  USING (auth.role() = 'authenticated');

-- Только система (через Service Role) может вставлять показания
-- Пользователи не могут вставлять показания напрямую
-- Вставка возможна только через функцию insert_beliot_reading (SECURITY DEFINER)
CREATE POLICY "Only system can insert readings"
  ON public.beliot_device_readings FOR INSERT
  WITH CHECK (false); -- Блокируем прямые вставки, только через функцию

-- Пользователи не могут обновлять показания
CREATE POLICY "Users cannot update readings"
  ON public.beliot_device_readings FOR UPDATE
  USING (false)
  WITH CHECK (false);

-- Пользователи не могут удалять показания
CREATE POLICY "Users cannot delete readings"
  ON public.beliot_device_readings FOR DELETE
  USING (false);

-- ============================================================================
-- ФУНКЦИИ
-- ============================================================================

-- Функция для безопасной вставки показаний (используется Railway скриптом)
-- SECURITY DEFINER: обходит RLS, позволяя вставлять записи через Service Role
-- ВАЖНО: Поддерживает точность до 0.001 м³ (NUMERIC(12, 3))
-- Всегда обновляет updated_at при каждом вызове для отслеживания последнего опроса
CREATE OR REPLACE FUNCTION public.insert_beliot_reading(
  p_device_id TEXT,
  p_reading_date TIMESTAMPTZ,
  p_reading_value NUMERIC,
  p_unit TEXT DEFAULT 'м³',
  p_reading_type TEXT DEFAULT 'hourly',
  p_source TEXT DEFAULT 'api',
  p_period TEXT DEFAULT 'current'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id UUID;
BEGIN
  -- Защита от атак через подмену схемы (schema injection)
  SET search_path = public, pg_temp;
  
  -- Вставляем или обновляем показание
  -- ВАЖНО: Всегда обновляем updated_at, даже если значение не изменилось
  -- Это позволяет отслеживать последний успешный опрос устройства
  INSERT INTO public.beliot_device_readings (
    device_id,
    reading_date,
    reading_value,
    unit,
    reading_type,
    source,
    period
  )
  VALUES (
    p_device_id,
    p_reading_date,
    p_reading_value,
    p_unit,
    p_reading_type,
    p_source,
    p_period
  )
  ON CONFLICT (device_id, reading_date, reading_type) 
  DO UPDATE SET
    -- Обновляем значение (даже если оно изменилось на 0.001)
    reading_value = EXCLUDED.reading_value,
    -- ВСЕГДА обновляем updated_at, чтобы отслеживать последний опрос
    updated_at = NOW()
  RETURNING id INTO v_id;
  
  -- Если это обновление существующей записи, но RETURNING не вернул ID
  -- (что не должно происходить, но на всякий случай)
  IF v_id IS NULL THEN
    SELECT id INTO v_id
    FROM public.beliot_device_readings
    WHERE device_id = p_device_id
      AND reading_date = p_reading_date
      AND reading_type = p_reading_type
    LIMIT 1;
  END IF;
  
  RETURN v_id;
END;
$$;

-- Комментарий к функции
COMMENT ON FUNCTION public.insert_beliot_reading IS 
  'Безопасная вставка показания счетчика. Используется Railway cron job. 
   Предотвращает дубликаты через ON CONFLICT. 
   Всегда обновляет updated_at при каждом вызове для отслеживания последнего опроса. 
   Поддерживает точность до 0.001 м³ (NUMERIC(12, 3)).';

-- Настройка search_path для функции
ALTER FUNCTION public.insert_beliot_reading(TEXT, TIMESTAMPTZ, NUMERIC, TEXT, TEXT, TEXT, TEXT) 
  SET search_path = public, pg_temp;

-- Функция для получения последнего показания устройства
CREATE OR REPLACE FUNCTION public.get_last_beliot_reading(
  p_device_id TEXT,
  p_reading_type TEXT DEFAULT 'hourly'
)
RETURNS TABLE (
  id UUID,
  device_id TEXT,
  reading_date TIMESTAMPTZ,
  reading_value NUMERIC,
  unit TEXT,
  reading_type TEXT,
  source TEXT,
  period TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Защита от атак через подмену схемы (schema injection)
  SET search_path = public, pg_temp;
  
  RETURN QUERY
  SELECT 
    r.id,
    r.device_id,
    r.reading_date,
    r.reading_value,
    r.unit,
    r.reading_type,
    r.source,
    r.period,
    r.created_at
  FROM public.beliot_device_readings r
  WHERE r.device_id = p_device_id
    AND r.reading_type = p_reading_type
  ORDER BY r.reading_date DESC
  LIMIT 1;
END;
$$;

-- Комментарий к функции
COMMENT ON FUNCTION public.get_last_beliot_reading IS 'Получение последнего показания устройства. Используется для отображения текущих значений.';

-- Настройка search_path для функции
ALTER FUNCTION public.get_last_beliot_reading(TEXT, TEXT) 
  SET search_path = public, pg_temp;

-- ============================================================================
-- ТРИГГЕРЫ
-- ============================================================================

-- Триггер для автоматического обновления updated_at
CREATE TRIGGER update_beliot_readings_updated_at
  BEFORE UPDATE ON public.beliot_device_readings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- КОММЕНТАРИИ К ТАБЛИЦЕ И КОЛОНКАМ
-- ============================================================================

COMMENT ON TABLE public.beliot_device_readings IS 'Показания счетчиков Beliot. Автоматически собираются через Railway cron job.';
COMMENT ON COLUMN public.beliot_device_readings.device_id IS 'ID устройства из Beliot API';
COMMENT ON COLUMN public.beliot_device_readings.reading_date IS 'Дата и время снятия показания';
COMMENT ON COLUMN public.beliot_device_readings.reading_value IS 'Значение показания (точность до 0.001 м³)';
COMMENT ON COLUMN public.beliot_device_readings.unit IS 'Единица измерения (по умолчанию: м³)';
COMMENT ON COLUMN public.beliot_device_readings.reading_type IS 'Тип показания: hourly (почасовой) или daily (ежедневный)';
COMMENT ON COLUMN public.beliot_device_readings.source IS 'Источник данных: всегда "api" (из Beliot API)';
COMMENT ON COLUMN public.beliot_device_readings.period IS 'Период: current (текущее) или previous (предыдущее)';
COMMENT ON COLUMN public.beliot_device_readings.created_at IS 'Дата и время создания записи';
COMMENT ON COLUMN public.beliot_device_readings.updated_at IS 'Дата и время последнего обновления записи';

-- ============================================================================
-- ПРОВЕРКА СОЗДАНИЯ
-- ============================================================================

-- Проверяем, что таблица создана
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'beliot_device_readings'
  ) THEN
    RAISE EXCEPTION 'Таблица beliot_device_readings не создана!';
  END IF;
END $$;

-- Проверяем, что функции созданы
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    AND proname = 'insert_beliot_reading'
  ) THEN
    RAISE EXCEPTION 'Функция insert_beliot_reading не создана!';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    AND proname = 'get_last_beliot_reading'
  ) THEN
    RAISE EXCEPTION 'Функция get_last_beliot_reading не создана!';
  END IF;
END $$;

-- Выводим информацию о созданных объектах
SELECT 
  'Таблица beliot_device_readings создана успешно' AS status,
  COUNT(*) AS column_count
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'beliot_device_readings';

SELECT 
  'Функции созданы успешно' AS status,
  COUNT(*) AS function_count
FROM pg_proc 
WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  AND proname IN ('insert_beliot_reading', 'get_last_beliot_reading');

-- ============================================================================
-- ПРОВЕРКА ТОЧНОСТИ ДАННЫХ
-- ============================================================================

-- Проверяем, что reading_value имеет точность до 3 знаков после запятой
SELECT 
  'Проверка точности reading_value' AS check_name,
  column_name,
  data_type,
  numeric_precision,
  numeric_scale,
  CASE 
    WHEN numeric_scale = 3 THEN '✅ Правильно (3 знака после запятой)'
    WHEN numeric_scale = 2 THEN '⚠️ Нужно обновить до 3 знаков (см. раздел МИГРАЦИЯ ниже)'
    ELSE '❌ Неожиданная точность'
  END AS status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'beliot_device_readings'
  AND column_name = 'reading_value';

-- ============================================================================
-- МИГРАЦИЯ: Обновление существующей таблицы до точности 3 знака
-- ============================================================================
-- Если таблица уже создана с NUMERIC(12, 2), выполните этот блок для обновления:
-- ============================================================================

/*
-- 1. Изменяем тип колонки reading_value на NUMERIC(12, 3)
ALTER TABLE public.beliot_device_readings 
  ALTER COLUMN reading_value TYPE NUMERIC(12, 3);

-- 2. Обновляем комментарий к колонке
COMMENT ON COLUMN public.beliot_device_readings.reading_value IS 
  'Значение показания (точность до 0.001 м³)';

-- 3. Обновляем функцию insert_beliot_reading (уже включена выше, но можно пересоздать)
-- Функция уже обновлена в разделе ФУНКЦИИ выше
*/

