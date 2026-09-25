/**
 * 20260925_harden_security_definer_rpcs.sql
 *
 * SEC-04: ограничить привилегированные SECURITY DEFINER RPC.
 *
 * Что меняет:
 * 1. log_login — нельзя подставить чужой user_id; anon только с p_user_id IS NULL
 * 2. get_login_history_with_email — не-админ видит только свою историю
 * 3. insert_beliot_reading — EXECUTE только у service_role (cron/backend)
 *
 * Безопасный повторный запуск: CREATE OR REPLACE + REVOKE/GRANT IF EXISTS.
 */

-- ============================================
-- log_login
-- ============================================

CREATE OR REPLACE FUNCTION public.log_login(
  p_success BOOLEAN,
  p_user_id UUID DEFAULT NULL,
  p_failure_reason TEXT DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  -- Авторизованный пользователь может логировать только себя
  IF v_caller IS NOT NULL THEN
    IF p_user_id IS DISTINCT FROM v_caller THEN
      RAISE EXCEPTION 'log_login: p_user_id must equal auth.uid()'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    -- Аноним: только неуспешные попытки без привязки к чужому UUID
    IF p_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'log_login: anonymous callers cannot set p_user_id'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.login_history (
    user_id,
    login_at,
    ip_address,
    success,
    failure_reason
  )
  VALUES (
    p_user_id,
    NOW(),
    p_ip_address,
    p_success,
    p_failure_reason
  );
END;
$$;

COMMENT ON FUNCTION public.log_login(BOOLEAN, UUID, TEXT, TEXT) IS
  'SEC-04: пишет login_history. authenticated → только свой user_id; anon → только p_user_id NULL.';

-- ============================================
-- get_login_history_with_email
-- ============================================

CREATE OR REPLACE FUNCTION public.get_login_history_with_email(
  p_limit INTEGER DEFAULT 100,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  email TEXT,
  login_at TIMESTAMPTZ,
  ip_address TEXT,
  success BOOLEAN,
  failure_reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_limit INTEGER := GREATEST(1, LEAST(COALESCE(p_limit, 100), 500));
  v_filter UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'get_login_history_with_email: authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF public.is_admin() THEN
    v_filter := p_user_id; -- admin: NULL = все, иначе фильтр
  ELSE
    -- Обычный пользователь всегда только своя история (игнорируем чужой p_user_id)
    v_filter := v_caller;
  END IF;

  RETURN QUERY
  SELECT
    lh.id,
    lh.user_id,
    COALESCE(
      p.email,
      CASE
        WHEN lh.user_id IS NULL THEN 'Неуспешный вход'
        ELSE 'Неизвестный пользователь'
      END
    ) AS email,
    lh.login_at,
    lh.ip_address,
    lh.success,
    lh.failure_reason
  FROM public.login_history lh
  LEFT JOIN public.profiles p ON lh.user_id = p.id
  WHERE (v_filter IS NULL OR lh.user_id = v_filter)
  ORDER BY lh.login_at DESC
  LIMIT v_limit;
END;
$$;

COMMENT ON FUNCTION public.get_login_history_with_email(INTEGER, UUID) IS
  'SEC-04: история входов. Admin видит все/фильтр; user — только auth.uid().';

-- ============================================
-- insert_beliot_reading — без смены тела, только права
-- (тело уже SECURITY DEFINER; запись только cron/service_role)
-- ============================================

COMMENT ON FUNCTION public.insert_beliot_reading(TEXT, TIMESTAMPTZ, NUMERIC, TEXT, TEXT, TEXT, TEXT) IS
  'SEC-04: upsert показаний Beliot. EXECUTE только service_role.';

-- ============================================
-- GRANT / REVOKE
-- ============================================

-- Сброс широких прав по умолчанию (PUBLIC)
REVOKE ALL ON FUNCTION public.log_login(BOOLEAN, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_login_history_with_email(INTEGER, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.insert_beliot_reading(TEXT, TIMESTAMPTZ, NUMERIC, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;

-- log_login: нужен anon (неуспешный вход до сессии) и authenticated
GRANT EXECUTE ON FUNCTION public.log_login(BOOLEAN, UUID, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.log_login(BOOLEAN, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_login(BOOLEAN, UUID, TEXT, TEXT) TO service_role;

-- история входов: только вошедшие (+ service_role)
REVOKE ALL ON FUNCTION public.get_login_history_with_email(INTEGER, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_login_history_with_email(INTEGER, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_login_history_with_email(INTEGER, UUID) TO service_role;

-- вставка показаний: только service_role
REVOKE ALL ON FUNCTION public.insert_beliot_reading(TEXT, TIMESTAMPTZ, NUMERIC, TEXT, TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.insert_beliot_reading(TEXT, TIMESTAMPTZ, NUMERIC, TEXT, TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.insert_beliot_reading(TEXT, TIMESTAMPTZ, NUMERIC, TEXT, TEXT, TEXT, TEXT) TO service_role;
