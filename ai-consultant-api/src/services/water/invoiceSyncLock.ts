/**
 * invoiceSyncLock.ts
 *
 * Общая блокировка синхронизации счетов для HTTP и CLI.
 * Зависший запуск старше шести часов можно забрать.
 */

import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '../../config/env.js';
import { syncLockDecision } from './notificationEventKey.js';

const LOCK_ID = 'invoices';
const STALE_MS = 6 * 60 * 60 * 1000;

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

export class SyncInProgressError extends Error {
  constructor() {
    super('Синхронизация уже выполняется');
    this.name = 'SyncInProgressError';
  }
}

interface LockRow {
  owner: string;
  started_at: string;
}

export async function withInvoiceSyncLock<T>(
  run: () => Promise<T>,
  client: SupabaseClient = supabase,
): Promise<T> {
  const owner = randomUUID();
  const acquired = await acquireInvoiceSyncLock(client, owner);
  if (!acquired) throw new SyncInProgressError();
  try {
    return await run();
  } finally {
    await client.from('invoice_sync_lock').delete().eq('id', LOCK_ID).eq('owner', owner);
  }
}

async function acquireInvoiceSyncLock(client: SupabaseClient, owner: string): Promise<boolean> {
  const now = new Date().toISOString();
  const { data } = await client
    .from('invoice_sync_lock')
    .select('owner, started_at')
    .eq('id', LOCK_ID)
    .maybeSingle();
  const row = data as LockRow | null;
  const decision = syncLockDecision(row?.started_at ?? null, Date.now(), STALE_MS);

  if (decision === 'insert') {
    const { error } = await client.from('invoice_sync_lock').insert({
      id: LOCK_ID,
      owner,
      started_at: now,
    });
    return !error;
  }

  if (decision === 'busy' || !row) return false;

  const { data: updated, error } = await client
    .from('invoice_sync_lock')
    .update({ owner, started_at: now })
    .eq('id', LOCK_ID)
    .eq('started_at', row.started_at)
    .select('owner');
  return !error && (updated ?? []).length > 0;
}
