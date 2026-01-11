-- ============================================================================
-- СОЗДАНИЕ ТАБЛИЦЫ error_logs
-- Логирование ошибок приложения
-- 
-- Дата создания: 2024
-- Статус: Система мониторинга и логирования ошибок
-- 
-- ВАЖНО: 
-- - Только администраторы могут просматривать логи
-- - Логи автоматически записываются при возникновении ошибок
-- ============================================================================

-- ============================================================================
-- ТАБЛИЦА: error_logs
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  error_code TEXT,
  error_message TEXT NOT NULL,
  user_message TEXT,
  error_type TEXT, -- 'error', 'warning', 'info'
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  url TEXT,
  user_agent TEXT,
  stack_trace TEXT,
  context JSONB, -- Дополнительный контекст (параметры функции, состояние и т.д.)
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- ИНДЕКСЫ
-- ============================================================================

DROP INDEX IF EXISTS idx_error_logs_created_at;
DROP INDEX IF EXISTS idx_error_logs_user_id;
DROP INDEX IF EXISTS idx_error_logs_error_code;
DROP INDEX IF EXISTS idx_error_logs_severity;
DROP INDEX IF EXISTS idx_error_logs_resolved;
DROP INDEX IF EXISTS idx_error_logs_user_email;

-- Индекс для сортировки по дате (основной запрос)
CREATE INDEX idx_error_logs_created_at ON public.error_logs(created_at DESC);

-- Индекс для поиска по пользователю
CREATE INDEX idx_error_logs_user_id ON public.error_logs(user_id);

-- Индекс для поиска по email пользователя
CREATE INDEX idx_error_logs_user_email ON public.error_logs(user_email);

-- Индекс для поиска по коду ошибки
CREATE INDEX idx_error_logs_error_code ON public.error_logs(error_code);

-- Индекс для фильтрации по серьезности
CREATE INDEX idx_error_logs_severity ON public.error_logs(severity);

-- Индекс для фильтрации нерешенных ошибок
CREATE INDEX idx_error_logs_resolved ON public.error_logs(resolved) WHERE resolved = false;

-- Составной индекс для частых запросов (дата + серьезность)
CREATE INDEX idx_error_logs_created_severity ON public.error_logs(created_at DESC, severity);

-- ============================================================================
-- RLS ПОЛИТИКИ
-- ============================================================================

-- Включаем RLS
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

-- Удаляем существующие политики
DROP POLICY IF EXISTS "Only admins can view error logs" ON public.error_logs;
DROP POLICY IF EXISTS "System can insert error logs" ON public.error_logs;
DROP POLICY IF EXISTS "Only admins can update error logs" ON public.error_logs;

-- Политика: Только администраторы могут просматривать логи
CREATE POLICY "Only admins can view error logs"
  ON public.error_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Политика: Система может записывать логи (любой авторизованный пользователь)
-- Это нужно для записи ошибок от имени пользователя
CREATE POLICY "System can insert error logs"
  ON public.error_logs
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Политика: Только администраторы могут обновлять логи (например, помечать как решенные)
CREATE POLICY "Only admins can update error logs"
  ON public.error_logs
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Политика: Никто не может удалять логи (только через SQL для администраторов)
-- Логи должны храниться для аудита

-- ============================================================================
-- ФУНКЦИИ
-- ============================================================================

-- Функция для получения количества нерешенных ошибок
CREATE OR REPLACE FUNCTION public.get_unresolved_errors_count()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  count_result INTEGER;
BEGIN
  -- Проверяем, что пользователь - администратор
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Access denied. Admin role required.';
  END IF;

  SELECT COUNT(*) INTO count_result
  FROM public.error_logs
  WHERE resolved = false;

  RETURN count_result;
END;
$$;

-- Функция для получения статистики ошибок
CREATE OR REPLACE FUNCTION public.get_error_statistics(
  days_back INTEGER DEFAULT 7
)
RETURNS TABLE (
  total_errors BIGINT,
  critical_errors BIGINT,
  high_errors BIGINT,
  medium_errors BIGINT,
  low_errors BIGINT,
  unresolved_errors BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Проверяем, что пользователь - администратор
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Access denied. Admin role required.';
  END IF;

  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_errors,
    COUNT(*) FILTER (WHERE severity = 'critical')::BIGINT as critical_errors,
    COUNT(*) FILTER (WHERE severity = 'high')::BIGINT as high_errors,
    COUNT(*) FILTER (WHERE severity = 'medium')::BIGINT as medium_errors,
    COUNT(*) FILTER (WHERE severity = 'low')::BIGINT as low_errors,
    COUNT(*) FILTER (WHERE resolved = false)::BIGINT as unresolved_errors
  FROM public.error_logs
  WHERE created_at >= NOW() - (days_back || ' days')::INTERVAL;
END;
$$;

-- ============================================================================
-- КОММЕНТАРИИ
-- ============================================================================

COMMENT ON TABLE public.error_logs IS 'Логи ошибок приложения. Доступны только администраторам.';
COMMENT ON COLUMN public.error_logs.error_code IS 'Код ошибки из ErrorCode enum';
COMMENT ON COLUMN public.error_logs.error_message IS 'Техническое сообщение об ошибке';
COMMENT ON COLUMN public.error_logs.user_message IS 'Понятное сообщение для пользователя';
COMMENT ON COLUMN public.error_logs.context IS 'Дополнительный контекст (JSON объект)';
COMMENT ON COLUMN public.error_logs.severity IS 'Уровень серьезности ошибки';
COMMENT ON COLUMN public.error_logs.resolved IS 'Помечена ли ошибка как решенная';
COMMENT ON COLUMN public.error_logs.resolved_by IS 'ID администратора, который пометил ошибку как решенную';
