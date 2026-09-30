import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const root = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(root, '..');
const appUrl = 'https://qr-code-for-equipment-identification-production.up.railway.app';
const filterPath = '/equipment/f24911a7-e9a7-4add-95a2-819d57fc30ae';
const shotDir = path.join(root, 'out', 'frames');

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

const login = async (page) => {
  const env = readEnvFile(path.join(repoRoot, 'ai-consultant-api', '.env'));
  const email = process.env.PRESENTATION_EMAIL;
  if (!email) throw new Error('PRESENTATION_EMAIL is required');
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const link = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${appUrl}/` },
  });
  if (link.error || !link.data?.properties?.hashed_token) {
    throw new Error(link.error?.message || 'Не удалось создать ссылку входа');
  }
  const verified = await admin.auth.verifyOtp({
    token_hash: link.data.properties.hashed_token,
    type: 'magiclink',
  });
  if (verified.error || !verified.data.session) {
    throw new Error(verified.error?.message || 'Сессия не создана');
  }
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.evaluate((session) => {
    localStorage.setItem('sb-auth-token', JSON.stringify(session));
  }, verified.data.session);
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Главное меню' }).waitFor({ timeout: 30000 });
};

const send = async (page, text) => {
  const box = page.getByLabel('Сообщение консультанту');
  if (!(await box.isVisible())) {
    await page.getByTitle(/AI Консультант|Закрыть консультанта/).click();
    await box.waitFor();
  }
  await box.fill(text);
  await page.getByRole('button', { name: 'Отправить сообщение' }).click();
  await page.waitForFunction(() => {
    const nodes = document.querySelectorAll('.ai-chat-message--assistant .ai-chat-message__text');
    const textValue = nodes[nodes.length - 1]?.textContent?.trim() ?? '';
    const loading = document.querySelector('.ai-chat-widget__loading');
    const state = window;
    if (state.__siteAnswer !== textValue) {
      state.__siteAnswer = textValue;
      state.__siteStable = 0;
    } else {
      state.__siteStable = (state.__siteStable ?? 0) + 1;
    }
    return !loading && textValue.length > 40 && (state.__siteStable ?? 0) >= 3;
  }, undefined, { timeout: 180000, polling: 700 });
  await page.locator('.ai-chat-widget__messages, .ai-chat-messages').last().evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  }).catch(() => {});
};

const questions = process.argv.slice(2);
if (questions.length === 0) {
  console.error('question required');
  process.exit(1);
}

fs.mkdirSync(shotDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, locale: 'ru-RU' });
try {
  await login(page);
  await page.goto(`${appUrl}${filterPath}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: /обезжелезивания/i }).first().waitFor();
  const parts = [];
  for (let index = 0; index < questions.length; index += 1) {
    await send(page, questions[index]);
    const text = await page.locator('.ai-chat-message--assistant .ai-chat-message__text').last().innerText();
    const file = path.join(shotDir, `site-chat-${index + 1}.png`);
    await page.screenshot({ path: file });
    parts.push(`Q: ${questions[index]}\n\n${text}`);
    console.log(`shot ${index + 1} chars ${text.length}`);
  }
  fs.writeFileSync(path.join(root, 'out', 'site-chat.txt'), parts.join('\n\n----\n\n'), 'utf8');
} catch (error) {
  await page.screenshot({ path: path.join(shotDir, 'site-chat-failed.png') }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
