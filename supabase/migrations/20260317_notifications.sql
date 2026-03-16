-- ============================================================
-- Таблица уведомлений и подписок Web Push
-- ============================================================
-- 20260317 — создание таблиц water_notifications и push_subscriptions
-- ============================================================

-- ============================================================
-- Таблица уведомлений
-- ============================================================
CREATE TABLE IF NOT EXISTS water_notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,        -- 'new_invoice' | 'high_consumption' | 'tariff_change'
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  payload     JSONB,                -- { amount_byn, volume_m3, percent_change, old_tariff, new_tariff, period }
  is_read     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE water_notifications ENABLE ROW LEVEL SECURITY;

-- Пользователь читает только свои уведомления
CREATE POLICY "Users read own notifications"
  ON water_notifications FOR SELECT
  USING (auth.uid() = user_id);

-- Пользователь может помечать свои уведомления прочитанными
CREATE POLICY "Users update own notifications"
  ON water_notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- Сервисный ключ вставляет уведомления (обходит RLS)
CREATE POLICY "Service role manages notifications"
  ON water_notifications FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS water_notifications_user_unread
  ON water_notifications(user_id, is_read, created_at DESC);

-- ============================================================
-- Таблица Web Push подписок
-- ============================================================
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth_key    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own subscriptions"
  ON push_subscriptions FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages subscriptions"
  ON push_subscriptions FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS push_subscriptions_user
  ON push_subscriptions(user_id);