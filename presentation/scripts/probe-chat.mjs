import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const root = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(root, '..');
const equipmentId = 'f24911a7-e9a7-4add-95a2-819d57fc30ae';
const questions = process.argv.slice(2);
if (questions.length === 0) {
  console.error('question required');
  process.exit(1);
}

const readEnvFile = (file) => {
  const text = fs.readFileSync(file, 'utf8');
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
    const index = line.indexOf('=');
    values[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return values;
};

const apiEnv = readEnvFile(path.join(repoRoot, 'ai-consultant-api', '.env'));
const webEnv = readEnvFile(path.join(repoRoot, '.env.local'));
const email = process.env.PRESENTATION_EMAIL;
if (!email) throw new Error('PRESENTATION_EMAIL is required');

const admin = createClient(apiEnv.SUPABASE_URL, apiEnv.SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
if (link.error || !link.data?.properties?.hashed_token) {
  throw new Error(link.error?.message || 'link failed');
}
const verified = await admin.auth.verifyOtp({
  token_hash: link.data.properties.hashed_token,
  type: 'magiclink',
});
if (verified.error || !verified.data.session) {
  throw new Error(verified.error?.message || 'session failed');
}

const equipmentUrl = new URL(webEnv.VITE_EQUIPMENT_API_URL);
equipmentUrl.searchParams.set('action', 'getById');
equipmentUrl.searchParams.set('id', equipmentId);
const equipmentResponse = await fetch(equipmentUrl);
const equipmentJson = await equipmentResponse.json();
const equipment = equipmentJson.data ?? equipmentJson;
const context = {
  id: equipment.id,
  name: equipment.name,
  type: equipment.type,
  googleDriveUrl: equipment.googleDriveUrl,
  maintenanceSheetId: equipment.maintenanceSheetId,
};

const apiUrl = process.env.PRESENTATION_API_URL || 'https://ai-consultant-api-production.up.railway.app';
const messages = [];
const parts = [];
for (const question of questions) {
  messages.push({ role: 'user', content: question });
  const response = await fetch(`${apiUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${verified.data.session.access_token}`,
    },
    body: JSON.stringify({
      messages,
      equipmentContext: context,
    }),
    signal: AbortSignal.timeout(180000),
  });
  const body = await response.json();
  const message = body?.data?.message ?? body?.error ?? JSON.stringify(body);
  messages.push({ role: 'assistant', content: String(message) });
  parts.push(`Q: ${question}\nstatus ${response.status}\ntools ${(body?.data?.toolsUsed ?? []).join(',')}\n\n${message}`);
  console.log(`status ${response.status} chars ${String(message).length}`);
}
const out = path.join(root, 'out', 'chat-probe.txt');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, parts.join('\n\n----\n\n'), 'utf8');
