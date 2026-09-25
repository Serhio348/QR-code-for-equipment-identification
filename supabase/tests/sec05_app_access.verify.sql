/**
 * sec05_app_access.verify.sql
 *
 * Ручная проверка SEC-05: has_app_access и SELECT-политики water-таблиц.
 */

SELECT
  p.proname,
  pg_get_functiondef(p.oid) LIKE '%user_app_access%' AS references_access
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'has_app_access';

SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'beliot_device_readings',
    'beliot_device_overrides',
    'sampling_points',
    'water_analysis',
    'analysis_results',
    'water_quality_norms',
    'water_production_day_summaries'
  )
  AND policyname LIKE 'Water users%'
ORDER BY tablename, policyname;
