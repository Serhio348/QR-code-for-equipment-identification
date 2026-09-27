import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function migration(name: string): string {
  return readFileSync(join(process.cwd(), 'supabase', 'migrations', name), 'utf8');
}

describe('schema replay safety', () => {
  it('does not drop is_admin with cascade and skips missing tables', () => {
    const baseline = migration('20260326_supabase_schema.sql');
    expect(baseline).not.toMatch(/DROP FUNCTION IF EXISTS public\.is_admin\(\)\s+CASCADE/i);
    expect(baseline).toContain('to_regclass');

    expect(migration('20260224_add_device_role.sql')).toContain("to_regclass('public.beliot_device_overrides')");
    expect(migration('20260224_daily_readings_view.sql')).toContain("to_regclass('public.beliot_device_readings')");
    expect(migration('20260326_harden_rls_insert_profiles_access.sql')).toContain("to_regclass('public.profiles')");
  });

  it('keeps documented app tables in a forward migration that does not replace existing policies', () => {
    const forward = migration('20260927_app_tables_from_docs.sql');
    for (const table of ['workshops', 'error_logs', 'sampling_points', 'water_analysis', 'water_quality_alerts']) {
      expect(forward).toContain(`CREATE TABLE IF NOT EXISTS public.${table}`);
    }
    expect(forward).toContain('pg_policies');
    expect(forward).not.toMatch(/DROP FUNCTION[\s\S]*is_admin\(\)\s+CASCADE/i);
  });
});
