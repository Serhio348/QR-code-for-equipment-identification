import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
webpush.setVapidDetails(
  `mailto:${process.env.VAPID_EMAIL || 'admin@example.com'}`,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
);

const { data: subs } = await sb.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth_key, created_at');
const { data: profiles } = await sb.from('profiles').select('id, email').in('id', [...new Set((subs ?? []).map((s) => s.user_id))]);

const emailById = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.email]));

for (const sub of subs ?? []) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
      JSON.stringify({ title: 'Тест счёта', body: 'Проверка push', payload: { type: 'new_invoice', period: '2026-05' } }),
    );
    console.log('OK', emailById[sub.user_id] || sub.user_id, sub.created_at.slice(0, 10));
  } catch (err) {
    console.log('FAIL', emailById[sub.user_id] || sub.user_id, err.statusCode, String(err.body || err.message).slice(0, 120));
  }
}
