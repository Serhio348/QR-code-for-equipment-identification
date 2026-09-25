/**
 * 20260925_sec06_agent_memory_scopes.sql
 *
 * SEC-06: разделить общую (shared) и личную (personal) память агента.
 *
 * Что меняет:
 * 1. колонки scope, user_id, created_by
 * 2. существующие строки → shared
 * 3. уникальность: shared по key; personal по (user_id, key)
 * 4. RLS: authenticated читает shared + свои personal
 */

-- ============================================
-- Колонки
-- ============================================

ALTER TABLE public.agent_memory
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'shared';

ALTER TABLE public.agent_memory
  ADD COLUMN IF NOT EXISTS user_id UUID NULL;

ALTER TABLE public.agent_memory
  ADD COLUMN IF NOT EXISTS created_by UUID NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agent_memory_scope_check'
  ) THEN
    ALTER TABLE public.agent_memory
      ADD CONSTRAINT agent_memory_scope_check
      CHECK (scope IN ('shared', 'personal'));
  END IF;
END $$;

-- personal обязан иметь user_id; shared — без владельца
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agent_memory_personal_user_check'
  ) THEN
    ALTER TABLE public.agent_memory
      ADD CONSTRAINT agent_memory_personal_user_check
      CHECK (
        (scope = 'shared' AND user_id IS NULL)
        OR (scope = 'personal' AND user_id IS NOT NULL)
      );
  END IF;
END $$;

-- Миграция данных: всё существующее — общая память
UPDATE public.agent_memory
SET scope = 'shared', user_id = NULL
WHERE scope IS DISTINCT FROM 'shared' OR user_id IS NOT NULL;

-- ============================================
-- Индексы
-- ============================================

DROP INDEX IF EXISTS public.agent_memory_key;

CREATE UNIQUE INDEX IF NOT EXISTS agent_memory_shared_key
  ON public.agent_memory (key)
  WHERE scope = 'shared';

CREATE UNIQUE INDEX IF NOT EXISTS agent_memory_personal_user_key
  ON public.agent_memory (user_id, key)
  WHERE scope = 'personal';

CREATE INDEX IF NOT EXISTS agent_memory_scope_active
  ON public.agent_memory (scope, is_active)
  WHERE is_active = true;

-- ============================================
-- RLS
-- ============================================

DROP POLICY IF EXISTS "Authenticated users can read memory" ON public.agent_memory;
DROP POLICY IF EXISTS "Users can read shared and own memory" ON public.agent_memory;

CREATE POLICY "Users can read shared and own memory"
  ON public.agent_memory
  FOR SELECT
  TO authenticated
  USING (
    scope = 'shared'
    OR (scope = 'personal' AND user_id = auth.uid())
    OR public.is_admin()
  );

COMMENT ON COLUMN public.agent_memory.scope IS
  'SEC-06: shared — общая справочная память; personal — только для user_id';
COMMENT ON COLUMN public.agent_memory.user_id IS
  'Владелец personal-факта; NULL для shared';
COMMENT ON COLUMN public.agent_memory.created_by IS
  'Кто создал/обновил факт (аудит)';
