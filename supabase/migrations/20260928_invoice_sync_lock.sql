-- Одна строка не даёт двум процессам синхронизировать счета одновременно.
-- Просроченная блокировка забирается следующим запуском.
-- event_key не даёт повторить уведомление по тому же счёту.

CREATE TABLE IF NOT EXISTS public.invoice_sync_lock (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.invoice_sync_lock ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.invoice_sync_lock FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.invoice_sync_lock TO service_role;

ALTER TABLE public.water_notifications
  ADD COLUMN IF NOT EXISTS event_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS water_notifications_event_key
  ON public.water_notifications (event_key);
