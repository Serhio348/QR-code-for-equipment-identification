/**
 * 20260925_harden_security_definer_rpcs.verify.sql
 *
 * Ручная проверка SEC-04 после применения миграции.
 * Запускать в SQL Editor под разными JWT/ролями (или через supabase db execute).
 *
 * Ожидания:
 * - anon: log_login(false, NULL) OK; log_login(false, <uuid>) FAIL; get_login_history FAIL; insert_beliot FAIL
 * - authenticated (user): log_login(true, own_id) OK; log_login(true, other_id) FAIL;
 *   get_login_history только свои строки; insert_beliot FAIL
 * - authenticated (admin): get_login_history с p_user_id NULL видит все
 * - service_role: insert_beliot_reading OK
 */

-- Grants snapshot
SELECT
  p.proname AS function_name,
  r.rolname AS grantee,
  has_function_privilege(r.oid, p.oid, 'EXECUTE') AS can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN pg_roles r
WHERE n.nspname = 'public'
  AND p.proname IN (
    'log_login',
    'get_login_history_with_email',
    'insert_beliot_reading'
  )
  AND r.rolname IN ('anon', 'authenticated', 'service_role', 'postgres')
ORDER BY 1, 2;
