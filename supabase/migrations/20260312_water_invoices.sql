-- Таблица для хранения счёт-фактур водоканала (bvod.by)
CREATE TABLE water_invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  period          TEXT NOT NULL,           -- 'YYYY-MM', например '2026-01'
  period_date     DATE NOT NULL,           -- первый день месяца (для сортировки и range-запросов)
  volume_m3             NUMERIC(10,3),    -- объём водопотребления (вода), м³
  tariff_per_m3         NUMERIC(10,4),    -- тариф на воду, BYN/м³
  sewage_volume_m3      NUMERIC(10,3),    -- объём канализации, м³
  sewage_tariff_per_m3  NUMERIC(10,4),    -- тариф на канализацию, BYN/м³
  amount_byn            NUMERIC(10,2),    -- сумма к оплате с НДС, BYN
  meter_start     NUMERIC(10,3),           -- показание счётчика начало периода
  meter_end       NUMERIC(10,3),           -- показание счётчика конец периода
  account_number  TEXT,                    -- лицевой счёт
  file_name       TEXT,                    -- оригинальное имя файла
  storage_path    TEXT,                    -- путь в Supabase Storage: invoices/{user_id}/{period}.pdf
  raw_text        TEXT,                    -- сырой текст документа (для повторного анализа)
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE water_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own invoices"
  ON water_invoices FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Один счёт на период для каждого пользователя
CREATE UNIQUE INDEX water_invoices_user_period
  ON water_invoices(user_id, period);

-- Индекс для запросов по диапазону дат
CREATE INDEX water_invoices_period_date
  ON water_invoices(period_date DESC);
