-- ============================================
-- Миграция: Создание таблицы user_activity_logs
-- Описание: Таблица для логирования активности пользователей в системе
-- Дата: 2026-02-08
-- Идемпотентная (можно запускать повторно)
-- ============================================

-- Создание таблицы user_activity_logs
CREATE TABLE IF NOT EXISTS user_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT,
  activity_type TEXT NOT NULL,
  activity_description TEXT NOT NULL,
  entity_type TEXT CHECK (entity_type IN (
    'equipment',
    'maintenance_entry',
    'file',
    'chat',
    'user',
    'other'
  )),
  entity_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Обновляем CHECK constraint для activity_type (пересоздаём)
ALTER TABLE user_activity_logs
  DROP CONSTRAINT IF EXISTS user_activity_logs_activity_type_check;

ALTER TABLE user_activity_logs
  ADD CONSTRAINT user_activity_logs_activity_type_check
  CHECK (activity_type IN (
    'chat_message',
    'equipment_view',
    'equipment_create',
    'equipment_update',
    'equipment_delete',
    'maintenance_add',
    'maintenance_update',
    'maintenance_delete',
    'file_upload',
    'file_view',
    'login',
    'logout',
    'user_register',
    'other'
  ));

-- Создание индексов для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user_id ON user_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user_email ON user_activity_logs(user_email);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_activity_type ON user_activity_logs(activity_type);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_entity_type ON user_activity_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_entity_id ON user_activity_logs(entity_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_created_at ON user_activity_logs(created_at DESC);

-- Создание составного индекса для часто используемых фильтров
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user_type_date ON user_activity_logs(user_id, activity_type, created_at DESC);

-- Включение Row Level Security (RLS)
ALTER TABLE user_activity_logs ENABLE ROW LEVEL SECURITY;

-- Пересоздаём политики (DROP IF EXISTS + CREATE)
DROP POLICY IF EXISTS "Users can view their own activity logs" ON user_activity_logs;
DROP POLICY IF EXISTS "Admins can view all activity logs" ON user_activity_logs;
DROP POLICY IF EXISTS "Users can insert their own activity logs" ON user_activity_logs;
DROP POLICY IF EXISTS "Admins can delete activity logs" ON user_activity_logs;

-- Политика: Пользователи могут видеть только свои логи
CREATE POLICY "Users can view their own activity logs"
  ON user_activity_logs
  FOR SELECT
  USING (auth.uid() = user_id);

-- Политика: Администраторы могут видеть все логи
CREATE POLICY "Admins can view all activity logs"
  ON user_activity_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Политика: Пользователи могут вставлять свои логи
CREATE POLICY "Users can insert their own activity logs"
  ON user_activity_logs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Политика: Администраторы могут удалять логи
CREATE POLICY "Admins can delete activity logs"
  ON user_activity_logs
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- ============================================
-- RPC функция: Получение статистики по активности
-- ============================================
CREATE OR REPLACE FUNCTION get_activity_statistics(
  p_user_id UUID DEFAULT NULL,
  p_activity_type TEXT DEFAULT NULL,
  p_entity_type TEXT DEFAULT NULL,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_total_count INTEGER;
  v_unique_users_count INTEGER;
  v_recent_24h_count INTEGER;
  v_activities_by_type JSON;
  v_activities_by_user JSON;
BEGIN
  -- Применяем фильтры для подсчета общего количества
  SELECT COUNT(*)
  INTO v_total_count
  FROM user_activity_logs
  WHERE (p_user_id IS NULL OR user_id = p_user_id)
    AND (p_activity_type IS NULL OR activity_type = p_activity_type)
    AND (p_entity_type IS NULL OR entity_type = p_entity_type)
    AND (p_start_date IS NULL OR created_at >= p_start_date)
    AND (p_end_date IS NULL OR created_at <= p_end_date);

  -- Подсчет уникальных пользователей
  SELECT COUNT(DISTINCT user_id)
  INTO v_unique_users_count
  FROM user_activity_logs
  WHERE (p_user_id IS NULL OR user_id = p_user_id)
    AND (p_activity_type IS NULL OR activity_type = p_activity_type)
    AND (p_entity_type IS NULL OR entity_type = p_entity_type)
    AND (p_start_date IS NULL OR created_at >= p_start_date)
    AND (p_end_date IS NULL OR created_at <= p_end_date);

  -- Подсчет активности за последние 24 часа
  SELECT COUNT(*)
  INTO v_recent_24h_count
  FROM user_activity_logs
  WHERE created_at >= NOW() - INTERVAL '24 hours'
    AND (p_user_id IS NULL OR user_id = p_user_id)
    AND (p_activity_type IS NULL OR activity_type = p_activity_type)
    AND (p_entity_type IS NULL OR entity_type = p_entity_type)
    AND (p_start_date IS NULL OR created_at >= p_start_date)
    AND (p_end_date IS NULL OR created_at <= p_end_date);

  -- Статистика по типам активности
  SELECT JSON_AGG(
    JSON_BUILD_OBJECT(
      'activity_type', activity_type,
      'count', count
    )
  )
  INTO v_activities_by_type
  FROM (
    SELECT activity_type, COUNT(*) as count
    FROM user_activity_logs
    WHERE (p_user_id IS NULL OR user_id = p_user_id)
      AND (p_activity_type IS NULL OR activity_type = p_activity_type)
      AND (p_entity_type IS NULL OR entity_type = p_entity_type)
      AND (p_start_date IS NULL OR created_at >= p_start_date)
      AND (p_end_date IS NULL OR created_at <= p_end_date)
    GROUP BY activity_type
    ORDER BY count DESC
    LIMIT 10
  ) t;

  -- Статистика по пользователям
  SELECT JSON_AGG(
    JSON_BUILD_OBJECT(
      'user_email', user_email,
      'count', count
    )
  )
  INTO v_activities_by_user
  FROM (
    SELECT user_email, COUNT(*) as count
    FROM user_activity_logs
    WHERE (p_user_id IS NULL OR user_id = p_user_id)
      AND (p_activity_type IS NULL OR activity_type = p_activity_type)
      AND (p_entity_type IS NULL OR entity_type = p_entity_type)
      AND (p_start_date IS NULL OR created_at >= p_start_date)
      AND (p_end_date IS NULL OR created_at <= p_end_date)
    GROUP BY user_email
    ORDER BY count DESC
    LIMIT 10
  ) t;

  -- Возвращаем результат
  RETURN JSON_BUILD_OBJECT(
    'total_count', v_total_count,
    'unique_users_count', v_unique_users_count,
    'recent_24h_count', v_recent_24h_count,
    'activities_by_type', COALESCE(v_activities_by_type, '[]'::JSON),
    'activities_by_user', COALESCE(v_activities_by_user, '[]'::JSON)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Комментарии к таблице и колонкам
COMMENT ON TABLE user_activity_logs IS 'Логи активности пользователей в системе';
COMMENT ON COLUMN user_activity_logs.id IS 'Уникальный идентификатор записи лога';
COMMENT ON COLUMN user_activity_logs.user_id IS 'ID пользователя, выполнившего действие';
COMMENT ON COLUMN user_activity_logs.user_email IS 'Email пользователя (денормализация для быстрого поиска)';
COMMENT ON COLUMN user_activity_logs.activity_type IS 'Тип действия пользователя';
COMMENT ON COLUMN user_activity_logs.activity_description IS 'Текстовое описание действия';
COMMENT ON COLUMN user_activity_logs.entity_type IS 'Тип сущности, с которой связано действие';
COMMENT ON COLUMN user_activity_logs.entity_id IS 'ID сущности, с которой связано действие';
COMMENT ON COLUMN user_activity_logs.metadata IS 'Дополнительные данные о действии в формате JSON';
COMMENT ON COLUMN user_activity_logs.created_at IS 'Дата и время создания записи';

-- Конец миграции
