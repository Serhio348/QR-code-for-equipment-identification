-- Hardening RLS for profiles/user_app_access INSERT.
-- Goal: prevent direct client inserts; allow only system trigger flow.

-- Remove old permissive policies (if present)
DROP POLICY IF EXISTS "Trigger can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Trigger can insert access" ON public.user_app_access;

-- Replace with explicit client deny policies
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

-- Defense in depth:
-- - keep anon without INSERT privilege
-- - allow authenticated INSERT at privilege layer, then enforce deny/admin via RLS
--   (required so admin upsert works when row does not exist yet)
REVOKE INSERT ON TABLE public.profiles FROM anon;
REVOKE INSERT ON TABLE public.user_app_access FROM anon;
GRANT INSERT ON TABLE public.profiles TO authenticated;
GRANT INSERT ON TABLE public.user_app_access TO authenticated;
