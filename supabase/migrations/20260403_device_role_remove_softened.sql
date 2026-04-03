-- ============================================================
-- Убрать роль softened: учёт только source / production / domestic
-- ============================================================

UPDATE public.beliot_device_overrides
SET device_role = 'production'
WHERE device_role = 'softened';

ALTER TABLE public.beliot_device_overrides
  DROP CONSTRAINT IF EXISTS beliot_device_overrides_device_role_check;

ALTER TABLE public.beliot_device_overrides
  ADD CONSTRAINT beliot_device_overrides_device_role_check
  CHECK (device_role IN ('source', 'production', 'domestic'));

COMMENT ON COLUMN public.beliot_device_overrides.device_role
  IS 'Роль: source — скважина, production — производство, domestic — хоз-питьевое';
