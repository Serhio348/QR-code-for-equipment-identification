-- ============================================================
-- Таблица счёт-фактур водоканала bvod.by
-- ============================================================
-- История изменений:
--   20260312 — создание таблицы
--   20260316 — добавлены sewage_volume_m3, sewage_tariff_per_m3
--            — исправлен уникальный индекс (period, account_number) вместо (user_id, period)
--            — добавлена колонка sections JSONB (детализация по точкам подключения)
-- ============================================================

-- Создать таблицу если не существует
CREATE TABLE IF NOT EXISTS water_invoices (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  period                TEXT NOT NULL,        -- 'YYYY-MM', например '2026-01'
  period_date           DATE NOT NULL,        -- первый день месяца (для сортировки и range-запросов)
  account_number        TEXT,                 -- лицевой счёт: '107.00' или '107.09'
  volume_m3             NUMERIC(10,3),        -- суммарный объём водопотребления, м³
  tariff_per_m3         NUMERIC(10,4),        -- тариф на воду, BYN/м³
  sewage_volume_m3      NUMERIC(10,3),        -- суммарный объём канализации, м³
  sewage_tariff_per_m3  NUMERIC(10,4),        -- тариф на канализацию, BYN/м³
  amount_byn            NUMERIC(10,2),        -- итого к оплате с НДС, BYN
  meter_start           NUMERIC(10,3),        -- показание счётчика начало периода
  meter_end             NUMERIC(10,3),        -- показание счётчика конец периода
  sections              JSONB,                -- детализация по точкам подключения (массив объектов)
                                              -- [{id, name, address, volume_m3, sewage_m3, amount_byn}]
  file_name             TEXT,                 -- оригинальное имя PDF файла
  storage_path          TEXT,                 -- путь в Supabase Storage: invoices/{account}/{period}.pdf
  raw_text              TEXT,                 -- сырой текст PDF (для повторного анализа)
  created_at            TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Добавить недостающие колонки (если таблица уже существует)
-- ============================================================
ALTER TABLE water_invoices ADD COLUMN IF NOT EXISTS sewage_volume_m3     NUMERIC(10,3);
ALTER TABLE water_invoices ADD COLUMN IF NOT EXISTS sewage_tariff_per_m3 NUMERIC(10,4);
ALTER TABLE water_invoices ADD COLUMN IF NOT EXISTS sections             JSONB;

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================
ALTER TABLE water_invoices ENABLE ROW LEVEL SECURITY;

-- Удаляем старые политики если есть
DROP POLICY IF EXISTS "Users can manage own invoices" ON water_invoices;

-- Сервисный ключ (service_role) обходит RLS — данные сохраняются без user_id.
-- Политика разрешает чтение всем аутентифицированным пользователям
-- (счета общие для всей организации, не привязаны к конкретному пользователю).
CREATE POLICY "Authenticated users can read invoices"
  ON water_invoices FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Service role can manage invoices"
  ON water_invoices FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- Индексы
-- ============================================================

-- Уникальный: один счёт на период + лицевой счёт
-- (заменяет старый индекс water_invoices_user_period)
DROP INDEX IF EXISTS water_invoices_user_period;
CREATE UNIQUE INDEX IF NOT EXISTS water_invoices_period_account
  ON water_invoices(period, account_number);

-- Для запросов по диапазону дат (ORDER BY period_date DESC)
CREATE INDEX IF NOT EXISTS water_invoices_period_date
  ON water_invoices(period_date DESC);

-- GIN индекс для поиска по JSONB секциям
-- Позволяет искать: WHERE sections @> '[{"address": "Советская 1"}]'
CREATE INDEX IF NOT EXISTS water_invoices_sections_gin
  ON water_invoices USING GIN (sections);

-- ============================================================
-- Supabase Storage bucket (выполнить вручную в Dashboard)
-- ============================================================
-- Storage → New bucket → Name: invoices → Public: false
-- Или через SQL:
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('invoices', 'invoices', false)
-- ON CONFLICT (id) DO NOTHING;