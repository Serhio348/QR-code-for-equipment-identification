-- ============================================================================
-- МИГРАЦИЯ: Создание таблиц для учета лабораторных измерений качества воды
-- Версия: 2.0
-- Дата: 2024
-- ============================================================================

-- ============================================================================
-- 1. ТАБЛИЦА: Пункты отбора проб (Точки контроля)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sampling_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  equipment_id TEXT,
  location TEXT,
  
  -- Настройки отбора проб
  sampling_frequency TEXT CHECK (sampling_frequency IN ('daily', 'weekly', 'monthly', 'custom')),
  sampling_schedule JSONB,
  responsible_person TEXT,
  
  -- Метаданные
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT
);

-- Индексы для sampling_points
CREATE INDEX IF NOT EXISTS idx_sampling_point_code ON public.sampling_points(code);
CREATE INDEX IF NOT EXISTS idx_sampling_point_equipment ON public.sampling_points(equipment_id) WHERE equipment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sampling_point_active ON public.sampling_points(is_active) WHERE is_active = true;

-- Комментарии
COMMENT ON TABLE public.sampling_points IS 'Пункты отбора проб (точки контроля качества воды)';
COMMENT ON COLUMN public.sampling_points.code IS 'Уникальный код точки контроля (например, SP-001)';
COMMENT ON COLUMN public.sampling_points.name IS 'Название точки (например, "Входная вода", "После умягчителя")';
COMMENT ON COLUMN public.sampling_points.equipment_id IS 'Связь с оборудованием (может быть несколько точек на одном оборудовании)';
COMMENT ON COLUMN public.sampling_points.sampling_frequency IS 'Периодичность отбора проб: daily, weekly, monthly, custom';

-- ============================================================================
-- 2. ТАБЛИЦА: Лабораторные анализы (Записи в журнале)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.water_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sampling_point_id UUID NOT NULL,
  equipment_id TEXT,
  
  -- Временные метки
  sample_date TIMESTAMP WITH TIME ZONE NOT NULL,
  analysis_date TIMESTAMP WITH TIME ZONE,
  received_date TIMESTAMP WITH TIME ZONE,
  
  -- Ответственные лица
  sampled_by TEXT,
  analyzed_by TEXT,
  responsible_person TEXT,
  
  -- Статус анализа
  status TEXT NOT NULL DEFAULT 'in_progress' 
    CHECK (status IN ('in_progress', 'completed', 'deviation', 'cancelled')),
  
  -- Дополнительная информация
  notes TEXT,
  sample_condition TEXT CHECK (sample_condition IN ('normal', 'turbid', 'colored', 'odorous', NULL)),
  external_lab BOOLEAN DEFAULT false,
  external_lab_name TEXT,
  certificate_number TEXT,
  
  -- Файлы
  attachment_urls JSONB,
  
  -- Метаданные
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  
  -- Аудит изменений
  change_log JSONB DEFAULT '[]'::jsonb,
  
  CONSTRAINT fk_sampling_point FOREIGN KEY (sampling_point_id) 
    REFERENCES public.sampling_points(id) ON DELETE RESTRICT
);

-- Индексы для water_analysis
CREATE INDEX IF NOT EXISTS idx_analysis_date ON public.water_analysis(sample_date DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_sampling_point ON public.water_analysis(sampling_point_id, sample_date DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_status ON public.water_analysis(status);
CREATE INDEX IF NOT EXISTS idx_analysis_equipment ON public.water_analysis(equipment_id) WHERE equipment_id IS NOT NULL;

-- Комментарии
COMMENT ON TABLE public.water_analysis IS 'Лабораторные анализы качества воды';
COMMENT ON COLUMN public.water_analysis.status IS 'Статус: in_progress (в работе), completed (завершен), deviation (отклонение), cancelled (отменен)';
COMMENT ON COLUMN public.water_analysis.change_log IS 'История изменений в формате JSON: [{user, timestamp, field, old_value, new_value}]';

-- ============================================================================
-- 3. ТАБЛИЦА: Результаты анализа (Нормализованная структура)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.analysis_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL,
  
  -- Параметр измерения
  parameter_name TEXT NOT NULL,
  parameter_label TEXT NOT NULL,
  
  -- Значение и единица измерения
  value DECIMAL(10, 4) NOT NULL,
  unit TEXT NOT NULL,
  
  -- Метод измерения
  method TEXT,
  detection_limit DECIMAL(10, 4),
  
  -- Метаданные
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT fk_analysis FOREIGN KEY (analysis_id) 
    REFERENCES public.water_analysis(id) ON DELETE CASCADE,
  
  UNIQUE(analysis_id, parameter_name)
);

-- Индексы для analysis_results
CREATE INDEX IF NOT EXISTS idx_results_analysis ON public.analysis_results(analysis_id);
CREATE INDEX IF NOT EXISTS idx_results_parameter ON public.analysis_results(parameter_name);
CREATE INDEX IF NOT EXISTS idx_results_value ON public.analysis_results(parameter_name, value);

-- Комментарии
COMMENT ON TABLE public.analysis_results IS 'Результаты измерений параметров качества воды (нормализованная структура)';
COMMENT ON COLUMN public.analysis_results.parameter_name IS 'Код параметра: iron, alkalinity, hardness, oxidizability, ph, temperature';
COMMENT ON COLUMN public.analysis_results.parameter_label IS 'Человекочитаемое название: Железо, Щелочность, Жесткость, Окисляемость, pH, Температура';

-- ============================================================================
-- 4. ТАБЛИЦА: Нормативы (Граничные условия) - Улучшенная версия
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.water_quality_norms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sampling_point_id UUID,
  equipment_id TEXT,
  parameter_name TEXT NOT NULL,
  
  -- Оптимальные значения (целевой диапазон)
  optimal_min DECIMAL(10, 4),
  optimal_max DECIMAL(10, 4),
  
  -- Допустимые значения (границы нормы)
  min_allowed DECIMAL(10, 4),
  max_allowed DECIMAL(10, 4),
  
  -- Пороги предупреждений
  warning_min DECIMAL(10, 4),
  warning_max DECIMAL(10, 4),
  
  unit TEXT NOT NULL,
  
  -- Регламент
  regulation_reference TEXT,
  regulation_document_url TEXT,
  
  -- Настройки оповещений
  enable_notifications BOOLEAN DEFAULT true,
  warning_threshold_percent DECIMAL(5, 2) DEFAULT 10.0,
  alarm_threshold_percent DECIMAL(5, 2) DEFAULT 5.0,
  
  -- Метаданные
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  
  -- Приоритет: более специфичные нормативы имеют приоритет
  CONSTRAINT unique_sampling_point_param UNIQUE(sampling_point_id, parameter_name),
  -- Важно: constraint НЕ должен быть DEFERRABLE, иначе INSERT ... ON CONFLICT DO NOTHING
  -- не сможет использовать его как arbiter и миграция упадёт (ошибка 55000).
  CONSTRAINT unique_equipment_param UNIQUE(equipment_id, parameter_name)
);

-- Индексы для water_quality_norms
CREATE INDEX IF NOT EXISTS idx_norms_sampling_point ON public.water_quality_norms(sampling_point_id);
CREATE INDEX IF NOT EXISTS idx_norms_equipment ON public.water_quality_norms(equipment_id) WHERE equipment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_norms_parameter ON public.water_quality_norms(parameter_name);
CREATE INDEX IF NOT EXISTS idx_norms_active ON public.water_quality_norms(is_active) WHERE is_active = true;

-- Комментарии
COMMENT ON TABLE public.water_quality_norms IS 'Нормативы качества воды (граничные условия)';
COMMENT ON COLUMN public.water_quality_norms.optimal_min IS 'Минимальное оптимальное значение (целевой диапазон)';
COMMENT ON COLUMN public.water_quality_norms.optimal_max IS 'Максимальное оптимальное значение (целевой диапазон)';
COMMENT ON COLUMN public.water_quality_norms.min_allowed IS 'Минимальное допустимое значение (граница нормы)';
COMMENT ON COLUMN public.water_quality_norms.max_allowed IS 'Максимальное допустимое значение (граница нормы)';
COMMENT ON COLUMN public.water_quality_norms.regulation_reference IS 'Ссылка на регламент: СанПиН, ТР ТС, ГОСТ, внутренний стандарт';

-- ============================================================================
-- 5. ВЕРСИЯ MVP: таблицы alerts/statistics/schedule пока НЕ создаем
-- (water_quality_alerts, water_quality_statistics, sampling_schedule будут добавлены на следующем этапе)

-- ============================================================================
-- 6. НАЧАЛЬНЫЕ ДАННЫЕ: Глобальные нормативы по умолчанию
-- ============================================================================

-- Вставляем глобальные нормативы (для всех точек, если не заданы специфичные)
INSERT INTO public.water_quality_norms (
  sampling_point_id, 
  equipment_id,
  parameter_name, 
  optimal_min, 
  optimal_max, 
  min_allowed, 
  max_allowed, 
  warning_min, 
  warning_max, 
  unit, 
  regulation_reference
) VALUES
  (NULL, NULL, 'iron', 0.0, 0.1, 0.0, 0.3, 0.05, 0.25, 'мг/л', 'СанПиН 2.1.4.1074-01'),
  (NULL, NULL, 'alkalinity', 1.5, 4.5, 0.5, 6.5, 1.0, 5.5, 'мг-экв/л', 'СанПиН 2.1.4.1074-01'),
  (NULL, NULL, 'hardness', 2.0, 5.0, 1.0, 7.0, 1.5, 6.0, 'мг-экв/л', 'СанПиН 2.1.4.1074-01'),
  (NULL, NULL, 'oxidizability', 1.0, 3.0, 0.0, 5.0, 1.0, 4.0, 'мг O₂/л', 'СанПиН 2.1.4.1074-01'),
  (NULL, NULL, 'ph', 6.5, 8.5, 6.0, 9.0, 6.2, 8.8, 'pH', 'СанПиН 2.1.4.1074-01'),
  (NULL, NULL, 'temperature', 5.0, 25.0, 2.0, 30.0, 5.0, 25.0, '°C', 'СанПиН 2.1.4.1074-01')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 7. ТРИГГЕРЫ: Автоматическое обновление updated_at
-- ============================================================================

-- Функция для обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггеры для автоматического обновления updated_at
-- Используем DROP IF EXISTS для идемпотентности миграции
DROP TRIGGER IF EXISTS update_sampling_points_updated_at ON public.sampling_points;
CREATE TRIGGER update_sampling_points_updated_at
  BEFORE UPDATE ON public.sampling_points
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_water_analysis_updated_at ON public.water_analysis;
CREATE TRIGGER update_water_analysis_updated_at
  BEFORE UPDATE ON public.water_analysis
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_water_quality_norms_updated_at ON public.water_quality_norms;
CREATE TRIGGER update_water_quality_norms_updated_at
  BEFORE UPDATE ON public.water_quality_norms
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 8. ТРИГГЕР: Автоматическое логирование изменений в water_analysis
-- ============================================================================

CREATE OR REPLACE FUNCTION log_water_analysis_changes()
RETURNS TRIGGER AS $$
DECLARE
  change_record JSONB;
BEGIN
  -- Создаем запись об изменении
  change_record := jsonb_build_object(
    'user', COALESCE(NEW.created_by, 'system'),
    'timestamp', NOW(),
    'field', TG_ARGV[0],
    'old_value', OLD,
    'new_value', NEW
  );
  
  -- Добавляем в change_log
  NEW.change_log := COALESCE(OLD.change_log, '[]'::jsonb) || change_record;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггер для логирования изменений
-- Используем DROP IF EXISTS для идемпотентности миграции
DROP TRIGGER IF EXISTS log_water_analysis_changes_trigger ON public.water_analysis;
CREATE TRIGGER log_water_analysis_changes_trigger
  BEFORE UPDATE ON public.water_analysis
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION log_water_analysis_changes();

-- ============================================================================
-- 9. RLS ПОЛИТИКИ (Row Level Security)
-- ============================================================================

-- Включаем RLS для всех таблиц
ALTER TABLE public.sampling_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.water_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.water_quality_norms ENABLE ROW LEVEL SECURITY;

-- Политика: Все авторизованные пользователи могут читать
-- Используем DROP IF EXISTS для идемпотентности миграции
DROP POLICY IF EXISTS "Users can read sampling_points" ON public.sampling_points;
CREATE POLICY "Users can read sampling_points" ON public.sampling_points
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can read water_analysis" ON public.water_analysis;
CREATE POLICY "Users can read water_analysis" ON public.water_analysis
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can read analysis_results" ON public.analysis_results;
CREATE POLICY "Users can read analysis_results" ON public.analysis_results
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can read water_quality_norms" ON public.water_quality_norms;
CREATE POLICY "Users can read water_quality_norms" ON public.water_quality_norms
  FOR SELECT USING (auth.role() = 'authenticated');

-- Политика: Только авторизованные пользователи могут создавать/изменять
-- (Администраторы могут удалять, обычные пользователи - только создавать/изменять свои записи)
-- Примечание: Детальные политики нужно настроить в зависимости от требований к правам доступа

-- ============================================================================
-- 10. ПРИМЕЧАНИЕ
-- ============================================================================
-- Функции/представления для расчетов, а также таблицы alerts/statistics/schedule
-- добавим отдельной миграцией, когда дойдем до этапа оповещений/аналитики.

-- ============================================================================
-- КОНЕЦ МИГРАЦИИ
-- ============================================================================

-- Для отката миграции выполните:
-- DROP TABLE IF EXISTS public.water_quality_norms CASCADE;
-- DROP TABLE IF EXISTS public.analysis_results CASCADE;
-- DROP TABLE IF EXISTS public.water_analysis CASCADE;
-- DROP TABLE IF EXISTS public.sampling_points CASCADE;
-- DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
-- DROP FUNCTION IF EXISTS log_water_analysis_changes() CASCADE;
