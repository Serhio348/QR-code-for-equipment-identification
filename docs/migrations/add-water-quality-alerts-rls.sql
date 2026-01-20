-- ============================================================================
-- МИГРАЦИЯ: Добавление RLS политик для таблиц предупреждений и инцидентов (INSERT/UPDATE/DELETE)
-- Версия: 1.0
-- Дата: 2024
-- ============================================================================
-- 
-- Эта миграция добавляет политики INSERT, UPDATE и DELETE для таблиц:
-- - water_quality_alerts
-- - water_quality_incidents
--
-- Политики SELECT уже добавлены в add-alerts-and-incidents.sql
-- ============================================================================

-- ============================================================================
-- 1. ПОЛИТИКИ ДЛЯ water_quality_alerts
-- ============================================================================

-- Убеждаемся, что RLS включен
ALTER TABLE public.water_quality_alerts ENABLE ROW LEVEL SECURITY;

-- INSERT: Авторизованные пользователи могут создавать предупреждения
-- (Необходимо для триггеров, которые автоматически создают предупреждения)
DROP POLICY IF EXISTS "Users can insert water_quality_alerts" ON public.water_quality_alerts;
CREATE POLICY "Users can insert water_quality_alerts" ON public.water_quality_alerts
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- UPDATE: Авторизованные пользователи могут изменять предупреждения
-- (Для изменения статуса, подтверждения и т.д.)
DROP POLICY IF EXISTS "Users can update water_quality_alerts" ON public.water_quality_alerts;
CREATE POLICY "Users can update water_quality_alerts" ON public.water_quality_alerts
  FOR UPDATE USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- DELETE: Авторизованные пользователи могут удалять предупреждения
DROP POLICY IF EXISTS "Users can delete water_quality_alerts" ON public.water_quality_alerts;
CREATE POLICY "Users can delete water_quality_alerts" ON public.water_quality_alerts
  FOR DELETE USING (auth.role() = 'authenticated');

-- ============================================================================
-- 2. ПОЛИТИКИ ДЛЯ water_quality_incidents
-- ============================================================================

-- Убеждаемся, что RLS включен
ALTER TABLE public.water_quality_incidents ENABLE ROW LEVEL SECURITY;

-- INSERT: Авторизованные пользователи могут создавать инциденты
-- (Необходимо для функций, которые автоматически создают инциденты)
DROP POLICY IF EXISTS "Users can insert water_quality_incidents" ON public.water_quality_incidents;
CREATE POLICY "Users can insert water_quality_incidents" ON public.water_quality_incidents
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- UPDATE: Авторизованные пользователи могут изменять инциденты
-- (Для изменения статуса, добавления комментариев и т.д.)
DROP POLICY IF EXISTS "Users can update water_quality_incidents" ON public.water_quality_incidents;
CREATE POLICY "Users can update water_quality_incidents" ON public.water_quality_incidents
  FOR UPDATE USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- DELETE: Авторизованные пользователи могут удалять инциденты
DROP POLICY IF EXISTS "Users can delete water_quality_incidents" ON public.water_quality_incidents;
CREATE POLICY "Users can delete water_quality_incidents" ON public.water_quality_incidents
  FOR DELETE USING (auth.role() = 'authenticated');

-- ============================================================================
-- КОНЕЦ МИГРАЦИИ
-- ============================================================================
--
-- Для отката миграции выполните:
-- DROP POLICY IF EXISTS "Users can insert water_quality_alerts" ON public.water_quality_alerts;
-- DROP POLICY IF EXISTS "Users can update water_quality_alerts" ON public.water_quality_alerts;
-- DROP POLICY IF EXISTS "Users can delete water_quality_alerts" ON public.water_quality_alerts;
-- DROP POLICY IF EXISTS "Users can insert water_quality_incidents" ON public.water_quality_incidents;
-- DROP POLICY IF EXISTS "Users can update water_quality_incidents" ON public.water_quality_incidents;
-- DROP POLICY IF EXISTS "Users can delete water_quality_incidents" ON public.water_quality_incidents;
