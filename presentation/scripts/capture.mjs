import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const root = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(root, '..');
const appUrl = 'https://qr-code-for-equipment-identification-production.up.railway.app';
const filterPath = '/equipment/f24911a7-e9a7-4add-95a2-819d57fc30ae';
const outDir = path.join(root, 'public', 'captures');

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

const pause = (page, ms) => page.waitForTimeout(ms);

const screenshot = async (page, name) => {
  await page.screenshot({ path: path.join(outDir, name), fullPage: false });
};

const hidePrivateHeaderData = async (page) => {
  await page.evaluate(() => {
    document.querySelectorAll('.main-menu-user-info, .main-menu-button-admin, .user-info, .push-control').forEach((node) => {
      node.remove();
    });
  });
};

const login = async (page) => {
  const env = readEnvFile(path.join(repoRoot, 'ai-consultant-api', '.env'));
  const email = process.env.PRESENTATION_EMAIL;
  if (!email) throw new Error('PRESENTATION_EMAIL is required');
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${appUrl}/` },
  });
  if (error || !data?.properties?.hashed_token) {
    throw new Error(error?.message || 'Не удалось создать ссылку входа');
  }
  const verified = await admin.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
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
  try {
    await page.getByRole('heading', { name: 'Главное меню' }).waitFor({ timeout: 30000 });
  } catch (error) {
    await page.screenshot({ path: path.join(outDir, 'login-failed.png') });
    const title = await page.title();
    throw new Error(`Login did not reach the menu (title: ${title})`, { cause: error });
  }
};

const ask = async (page, text, marker, { hold = 4000, close = true, questionScreenshot } = {}) => {
  const box = page.getByLabel('Сообщение консультанту');
  if (!(await box.isVisible().catch(() => false))) {
    await page.getByTitle(/AI Консультант|Закрыть консультанта/).click();
    await box.waitFor();
  }
  const previous = await page.locator('.ai-chat-message--assistant .ai-chat-message__text').last().innerText().catch(() => '');
  await page.evaluate((prior) => {
    window.__aiPrior = prior;
    window.__aiAnswer = '';
    window.__aiStable = 0;
  }, previous);
  await box.fill(text);
  if (questionScreenshot) await screenshot(page, questionScreenshot);
  await pause(page, 700);
  await page.getByRole('button', { name: 'Отправить сообщение' }).click();
  marker?.mark('Вопрос отправлен.', 4);
  try {
    await page.waitForFunction(
      () => {
        const nodes = document.querySelectorAll('.ai-chat-message--assistant .ai-chat-message__text');
        const textValue = nodes[nodes.length - 1]?.textContent?.trim() ?? '';
        const loading = document.querySelector('.ai-chat-widget__loading');
        const state = window;
        if (textValue === state.__aiPrior) return false;
        if (state.__aiAnswer !== textValue) {
          state.__aiAnswer = textValue;
          state.__aiStable = 0;
        } else {
          state.__aiStable = (state.__aiStable ?? 0) + 1;
        }
        return !loading && textValue.length > 40 && (state.__aiStable ?? 0) >= 3;
      },
      undefined,
      { timeout: 180000, polling: 700 },
    );
  } catch (error) {
    await page.screenshot({ path: path.join(outDir, 'chat-failed.png'), fullPage: false });
    throw error;
  }
  marker?.mark('Ответ готов.', 8);
  await pause(page, hold);
  if (close) await page.getByTitle('Закрыть консультанта').click();
};

const scrollLatestAnswerToTop = async (page) => {
  await page.locator('.ai-chat-message--assistant').last().evaluate((message) => {
    message.scrollIntoView({ block: 'start', behavior: 'instant' });
  });
  await pause(page, 400);
};

const recordSegment = async (browser, storageState, name, run) => {
  const context = await browser.newContext({
    storageState,
    viewport: { width: 1920, height: 1080 },
    locale: 'ru-RU',
    recordVideo: { dir: outDir, size: { width: 1920, height: 1080 } },
  });
  const page = await context.newPage();
  const started = Date.now();
  const cues = [];
  const marker = {
    mark(caption, dur) {
      cues.push({ t: (Date.now() - started) / 1000, dur, caption });
    },
  };
  console.log(`capture: ${name}`);
  const video = page.video();
  try {
    await run(page, marker);
  } catch (error) {
    await context.close();
    throw error;
  }
  console.log(`capture: ${name} done`);
  await context.close();
  const source = await video.path();
  fs.copyFileSync(source, path.join(outDir, `${name}.webm`));
  fs.writeFileSync(path.join(outDir, `${name}.cues.json`), JSON.stringify(cues, null, 2));
};

const main = async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const statePath = path.join(outDir, 'state.json');
  try {
    const setup = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'ru-RU' });
    const page = await setup.newPage();
    await login(page);
    await setup.storageState({ path: statePath });
    await setup.close();
    const only = process.argv[2];
    if (!only || only === 'overview') await recordSegment(browser, statePath, 'overview', overview);
    if (!only || only === 'equipment') {
      await recordSegment(browser, statePath, 'equipment', equipment);
    }
    if (!only || only === 'water') await recordSegment(browser, statePath, 'water', water);
    if (only === 'counters') await recordSegment(browser, statePath, 'counters', counters);
    if (only === 'dashboard') await recordSegment(browser, statePath, 'dashboard', dashboard);
  } finally {
    await browser.close();
    fs.rmSync(statePath, { force: true });
  }
};

const overview = async (page, cues) => {
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Главное меню' }).waitFor({ timeout: 30000 });
  await hidePrivateHeaderData(page);
  await page.getByRole('button', { name: 'Перейти к Оборудование' }).waitFor();
  await page.getByRole('button', { name: 'Перейти к Вода' }).waitFor();
  cues.mark('Главное меню приложений.', 10);
  await screenshot(page, 'menu.png');
  await pause(page, 7000);

  await page.getByRole('button', { name: 'Перейти к Оборудование' }).click();
  await page.getByRole('heading', { name: 'Оборудование', exact: true }).waitFor({ timeout: 30000 });
  await hidePrivateHeaderData(page);
  await page.locator('.equipment-card').first().waitFor({ timeout: 30000 });
  cues.mark('Каталог оборудования.', 12);
  await screenshot(page, 'catalog.png');
  await pause(page, 9000);
};

const equipment = async (page, cues) => {
  await page.goto(`${appUrl}${filterPath}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: /обезжелезивания/i }).first().waitFor();
  await hidePrivateHeaderData(page);
  await screenshot(page, 'equipment-card.png');
  cues.mark('QR открывает цифровой паспорт установки.', 8);
  await pause(page, 2500);
  await page.locator('.qr-code-clickable').click();
  await screenshot(page, 'qr.png');
  await pause(page, 2500);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Документация/ }).first().click();
  await page.getByText(/Паспорт фильтра/i).first().waitFor({ timeout: 30000 });
  await screenshot(page, 'documentation.png');
  cues.mark('Документация лежит на установке.', 5);
  await pause(page, 3500);
  await page.getByRole('button', { name: 'Закрыть окно документации' }).click();
  await page.getByRole('button', { name: /Журнал обслуживания/ }).first().click();
  cues.mark('Журнал обслуживания.', 5);
  await pause(page, 5000);
  await screenshot(page, 'maintenance-log.png');
  await page.getByRole('button', { name: 'Закрыть журнал обслуживания' }).click();
  cues.mark('AI читает журнал и паспорт.', 20);
  await ask(
    page,
    'Когда последний раз проводили техническое обслуживание фильтра обезжелезивания?',
    cues,
    { hold: 5000, close: false, questionScreenshot: 'maintenance-question.png' },
  );
  await scrollLatestAnswerToTop(page);
  await screenshot(page, 'maintenance-answer.png');
  cues.mark('Последнее обслуживание.', 6);
  await ask(
    page,
    'Опиши виды работ при ежемесячном обслуживании фильтра обезжелезивания.',
    cues,
    { hold: 7000, close: false, questionScreenshot: 'monthly-maintenance-question.png' },
  );
  await scrollLatestAnswerToTop(page);
  await screenshot(page, 'monthly-maintenance-answer.png');
};

const counters = async (page, cues) => {
  await page.goto(`${appUrl}/water?tab=counters`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('columnheader', { name: 'Группа' }).first().waitFor({ timeout: 30000 });
  cues.mark('Счётчики по участкам.', 8);
  await pause(page, 2500);
  await page.getByRole('cell', { name: 'Скважина', exact: true }).click();
  await page.getByRole('columnheader', { name: 'Показание' }).waitFor({ timeout: 20000 });
  await hidePrivateHeaderData(page);
  await screenshot(page, 'counters.png');
  await pause(page, 3500);
};

const dashboard = async (page, cues) => {
  await page.goto(`${appUrl}/water`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Месяц для графика водного баланса').selectOption('2026-7');
  await page.getByText('Водный баланс — Август 2026 г.').waitFor({ timeout: 30000 });
  await page.getByText('Производственные нужды').first().waitFor();
  await hidePrivateHeaderData(page);
  cues.mark('Водный баланс за август.', 12);
  await pause(page, 2500);
  await screenshot(page, 'water-balance.png');

  const productionDay = page.locator('.wd-prod-day-select__control');
  await productionDay.selectOption('2026-09-29');
  await page.getByText(/29.*09.*м³/).first().waitFor({ timeout: 30000 }).catch(() => {});
  cues.mark('Производственные потоки за 29 сентября.', 12);
  await pause(page, 3500);
  await screenshot(page, 'water-production-september-29.png');
};

const water = async (page, cues) => {
  await page.goto(`${appUrl}/water?tab=counters`, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('🔍 Поиск счетчиков...').fill('Скважина');
  await page.getByText('Скважина', { exact: true }).first().click();
  await page.getByRole('columnheader', { name: 'Показание' }).waitFor({ timeout: 20000 });
  cues.mark('Счётчик. Текущее показание.', 6);
  await pause(page, 3500);
  await page.goto(`${appUrl}/water`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Месяц для графика водного баланса').selectOption('2026-7');
  await page.getByText('Производственные нужды').first().waitFor();
  await hidePrivateHeaderData(page);
  await screenshot(page, 'water-balance.png');
  cues.mark('Потребление за месяц.', 8);
  await pause(page, 4500);
  await page.goto(`${appUrl}/water-quality/journal`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Журнал анализов качества воды' }).waitFor();
  const deviation = page.locator('tr', { has: page.locator('.status-deviation') }).first();
  await deviation.waitFor({ timeout: 30000 });
  await deviation.scrollIntoViewIfNeeded();
  await hidePrivateHeaderData(page);
  await screenshot(page, 'water-quality-journal.png');
  cues.mark('Качество: скважина и вода после фильтра.', 6);
  await pause(page, 4000);
  await page.goto(`${appUrl}/water-quality/norms`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Нормативы качества воды' }).waitFor();
  const iron = page.locator('tr', { hasText: 'Железо' }).first();
  await iron.waitFor({ timeout: 20000 });
  await iron.scrollIntoViewIfNeeded();
  await hidePrivateHeaderData(page);
  await screenshot(page, 'water-iron-norm.png');
  cues.mark('Норматив железа.', 5);
  await pause(page, 3000);
  await page.goto(`${appUrl}/water-quality/journal`, { waitUntil: 'domcontentloaded' });
  cues.mark('AI сверяет пробу, норму и счёт.', 24);
  await ask(
    page,
    'По анализу смешенной воды от 26 сентября 2026: железо и жёсткость в пределах норматива? Есть ли отклонения?',
    cues,
    { hold: 7000, close: false, questionScreenshot: 'water-question.png' },
  );
  await scrollLatestAnswerToTop(page);
  await screenshot(page, 'water-answer.png');
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
