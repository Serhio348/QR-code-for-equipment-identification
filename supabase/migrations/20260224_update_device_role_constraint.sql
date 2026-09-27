-- ============================================================
-- Миграция: Обновить CHECK constraint device_role
-- Дата: 2026-02-24
-- Причина: Добавить значение 'domestic' (хоз-питьевое водоснабжение)
--
-- ВНИМАНИЕ: Применять ВМЕСТО 20260224_add_device_role.sql
--           если колонка уже была добавлена со старым constraint.
-- ============================================================

-- На чистой БД таблицы ещё нет: ограничение ставит 20260327_app_tables_from_docs.sql.
DO $device_role_check$
BEGIN
  IF to_regclass('public.beliot_device_overrides') IS NULL THEN
    RAISE NOTICE 'beliot_device_overrides ещё нет, constraint добавит поздняя миграция';
    RETURN;
  END IF;

  ALTER TABLE public.beliot_device_overrides
    ADD COLUMN IF NOT EXISTS device_role TEXT;

  ALTER TABLE public.beliot_device_overrides
    DROP CONSTRAINT IF EXISTS beliot_device_overrides_device_role_check;

  ALTER TABLE public.beliot_device_overrides
    ADD CONSTRAINT beliot_device_overrides_device_role_check
    CHECK (device_role IN ('source', 'production', 'domestic'));
END
$device_role_check$;
