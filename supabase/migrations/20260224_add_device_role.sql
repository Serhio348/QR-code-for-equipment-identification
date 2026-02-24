-- ============================================================
-- Миграция: Добавить поле device_role к beliot_device_overrides
-- Дата: 2026-02-24
-- Назначение: Разделение счётчиков по роли для расчёта
--             водного баланса и потерь воды.
--
-- Значения device_role:
--   'source'     — входящий поток (скважина, водозабор)
--   'production' — производственный потребитель (ХВО, Очистное, АЛПО)
--   'domestic'   — хозяйственно-питьевое водоснабжение
--   NULL         — не классифицировано
-- ============================================================

ALTER TABLE public.beliot_device_overrides
  ADD COLUMN IF NOT EXISTS device_role TEXT
  CHECK (device_role IN ('source', 'production', 'domestic'));

COMMENT ON COLUMN public.beliot_device_overrides.device_role
  IS 'Роль счётчика: source — источник (скважина), production — производство, domestic — хоз-питьевое водоснабжение';
