-- ============================================================
-- ПАМЯТЬ АГЕНТА: Хранение истории чата между сессиями
-- ============================================================
-- Что делает эта таблица:
--   Сохраняет все сообщения пользователя и агента.
--   При следующем открытии чата — агент "помнит" прошлый разговор.
--
-- Структура:
--   session_id  — группирует сообщения одного разговора
--   role        — 'user' или 'assistant'
--   content     — текст сообщения (JSON для мультимодальных)
--   tools_used  — какие инструменты вызывал агент (для истории)
-- ============================================================

-- Таблица сессий (один разговор = одна сессия)
CREATE TABLE IF NOT EXISTS chat_sessions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT,                          -- Авто-заголовок из первого сообщения
  equipment_id TEXT,                         -- Контекст: ID оборудования (если был)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Таблица сообщений
CREATE TABLE IF NOT EXISTS chat_messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID        NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT        NOT NULL,          -- Текст или JSON (мультимодальные)
  tools_used  TEXT[],                        -- Массив названий инструментов
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Индексы для быстрой выборки истории
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id    ON chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id    ON chat_sessions(user_id);

-- ============================================================
-- RLS: каждый пользователь видит ТОЛЬКО свои сообщения
-- ============================================================
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Сессии: только свои
DROP POLICY IF EXISTS "Users can view own sessions"   ON chat_sessions;
DROP POLICY IF EXISTS "Users can insert own sessions" ON chat_sessions;
DROP POLICY IF EXISTS "Users can update own sessions" ON chat_sessions;

CREATE POLICY "Users can view own sessions"
  ON chat_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sessions"
  ON chat_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions"
  ON chat_sessions FOR UPDATE
  USING (auth.uid() = user_id);

-- Сообщения: только свои
DROP POLICY IF EXISTS "Users can view own messages"   ON chat_messages;
DROP POLICY IF EXISTS "Users can insert own messages" ON chat_messages;

CREATE POLICY "Users can view own messages"
  ON chat_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own messages"
  ON chat_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Сервисный ключ (бэкенд) обходит RLS автоматически (service_role)
-- Поэтому бэкенд может писать от имени любого пользователя

-- ============================================================
-- Функция: автообновление updated_at у сессии при новом сообщении
-- ============================================================
CREATE OR REPLACE FUNCTION update_chat_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE chat_sessions
  SET updated_at = now()
  WHERE id = NEW.session_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_session_timestamp ON chat_messages;

CREATE TRIGGER trigger_update_session_timestamp
  AFTER INSERT ON chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_chat_session_timestamp();
