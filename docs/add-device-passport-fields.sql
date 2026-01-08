-- ============================================================================
-- МИГРАЦИЯ: Добавление полей паспорта счетчика в beliot_device_overrides
-- ============================================================================
-- Добавляет поля для хранения паспортных данных счетчика:
-- - manufacture_date (дата выпуска)
-- - manufacturer (производитель)
-- - verification_date (дата поверки)
-- - next_verification_date (дата следующей поверки)

-- Добавляем новые колонки в таблицу beliot_device_overrides
ALTER TABLE public.beliot_device_overrides
  ADD COLUMN IF NOT EXISTS manufacture_date DATE,
  ADD COLUMN IF NOT EXISTS manufacturer TEXT,
  ADD COLUMN IF NOT EXISTS verification_date DATE,
  ADD COLUMN IF NOT EXISTS next_verification_date DATE;

-- Добавляем комментарии к новым колонкам
COMMENT ON COLUMN public.beliot_device_overrides.manufacture_date IS 'Дата выпуска счетчика';
COMMENT ON COLUMN public.beliot_device_overrides.manufacturer IS 'Производитель счетчика';
COMMENT ON COLUMN public.beliot_device_overrides.verification_date IS 'Дата последней поверки счетчика';
COMMENT ON COLUMN public.beliot_device_overrides.next_verification_date IS 'Дата следующей поверки счетчика';

