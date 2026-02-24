-- ============================================================
-- Миграция: Обновить CHECK constraint device_role
-- Дата: 2026-02-24
-- Причина: Добавить значение 'domestic' (хоз-питьевое водоснабжение)
--
-- ВНИМАНИЕ: Применять ВМЕСТО 20260224_add_device_role.sql
--           если колонка уже была добавлена со старым constraint.
-- ============================================================

-- Шаг 1: Добавить колонку если ещё не существует (без constraint)
ALTER TABLE public.beliot_device_overrides
  ADD COLUMN IF NOT EXISTS device_role TEXT;

-- Шаг 2: Удалить старый constraint (если существует)
ALTER TABLE public.beliot_device_overrides
  DROP CONSTRAINT IF EXISTS beliot_device_overrides_device_role_check;

-- Шаг 3: Добавить новый constraint с 'domestic'
ALTER TABLE public.beliot_device_overrides
  ADD CONSTRAINT beliot_device_overrides_device_role_check
  CHECK (device_role IN ('source', 'production', 'domestic'));

COMMENT ON COLUMN public.beliot_device_overrides.device_role
  IS 'Роль счётчика: source — источник (скважина), production — производство, domestic — хоз-питьевое водоснабжение';
