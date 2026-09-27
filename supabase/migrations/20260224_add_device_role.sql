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

-- Файл идёт раньше baseline, который создаёт таблицу.
-- На чистой БД колонка добавляется в 20260327_app_tables_from_docs.sql.
DO $device_role$
BEGIN
  IF to_regclass('public.beliot_device_overrides') IS NULL THEN
    RAISE NOTICE 'beliot_device_overrides ещё нет, device_role добавит поздняя миграция';
    RETURN;
  END IF;

  ALTER TABLE public.beliot_device_overrides
    ADD COLUMN IF NOT EXISTS device_role TEXT
    CHECK (device_role IN ('source', 'production', 'domestic'));

  COMMENT ON COLUMN public.beliot_device_overrides.device_role
    IS 'Роль счётчика: source — источник (скважина), production — производство, domestic — хоз-питьевое водоснабжение';
END
$device_role$;
