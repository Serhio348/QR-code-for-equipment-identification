-- ============================================================
-- Долговременная память AI-агента
-- ============================================================
-- Хранит факты которые агент запомнил в процессе диалогов.
-- При каждом новом запросе релевантные факты автоматически
-- добавляются в системный промпт.
--
-- Категории фактов:
--   tariff    — тарифы (вода, канализация, электричество)
--   address   — адреса и точки подключения
--   contact   — контакты (водоканал, поставщики)
--   norm      — нормы (потребление, качество воды)
--   fact      — общие факты об объекте
--   preference — предпочтения пользователя
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_memory (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category    TEXT NOT NULL,   -- 'tariff' | 'address' | 'contact' | 'norm' | 'fact' | 'preference'
  key         TEXT NOT NULL,   -- уникальный ключ факта, например 'water_tariff_2026-03'
  value       TEXT NOT NULL,   -- значение факта
  context     TEXT,            -- дополнительный контекст / откуда взято
  is_active   BOOLEAN DEFAULT true,  -- false = устаревший факт (не загружается в промпт)
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Уникальность по ключу — один факт на ключ
CREATE UNIQUE INDEX IF NOT EXISTS agent_memory_key
  ON agent_memory(key);

-- Индекс по категории для быстрой выборки
CREATE INDEX IF NOT EXISTS agent_memory_category
  ON agent_memory(category) WHERE is_active = true;

-- RLS
ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage memory"
  ON agent_memory FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Authenticated users can read memory"
  ON agent_memory FOR SELECT
  USING (auth.role() = 'authenticated');

-- Автообновление updated_at
CREATE OR REPLACE FUNCTION update_agent_memory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agent_memory_updated_at
  BEFORE UPDATE ON agent_memory
  FOR EACH ROW EXECUTE FUNCTION update_agent_memory_updated_at();