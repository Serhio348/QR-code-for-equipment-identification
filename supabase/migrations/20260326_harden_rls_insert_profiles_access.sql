-- Hardening RLS for profiles/user_app_access INSERT.
-- Goal: prevent direct client inserts; allow only system trigger flow.

-- На чистой БД этот файл лексикографически раньше baseline.
-- Политики профилей тогда ещё некуда вешать; их создаёт 20260326_supabase_schema.sql.
DO $harden_ready$
BEGIN
  IF to_regclass('public.profiles') IS NULL OR to_regclass('public.user_app_access') IS NULL THEN
    RAISE NOTICE 'profiles ещё нет, deny-политики вставит baseline';
    RETURN;
  END IF;
END
$harden_ready$;

-- Remove old permissive policies (if present)
DO $drop_trigger_insert$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Trigger can insert profiles" ON public.profiles;
  END IF;
  IF to_regclass('public.user_app_access') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Trigger can insert access" ON public.user_app_access;
  END IF;
END
$drop_trigger_insert$;

-- Replace with explicit client deny policies.
-- Весь блок пропускается, пока baseline не создал таблицы.
DO $harden_policies$
BEGIN
  IF to_regclass('public.profiles') IS NULL OR to_regclass('public.user_app_access') IS NULL THEN
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "Clients cannot insert profiles" ON public.profiles;
  CREATE POLICY "Clients cannot insert profiles"
    ON public.profiles FOR INSERT
    TO anon, authenticated
    WITH CHECK (false);

  DROP POLICY IF EXISTS "Clients cannot insert access" ON public.user_app_access;
  CREATE POLICY "Clients cannot insert access"
    ON public.user_app_access FOR INSERT
    TO anon, authenticated
    WITH CHECK (false);

  REVOKE INSERT ON TABLE public.profiles FROM anon;
  REVOKE INSERT ON TABLE public.user_app_access FROM anon;
  GRANT INSERT ON TABLE public.profiles TO authenticated;
  GRANT INSERT ON TABLE public.user_app_access TO authenticated;
END
$harden_policies$;
