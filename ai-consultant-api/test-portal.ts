/**
 * test-portal.ts
 * Быстрая проверка: может ли Playwright открыть bvod.by
 *
 * Запуск:
 *   cd ai-consultant-api
 *   npx tsx test-portal.ts
 */

import { chromium } from 'playwright';

const URL = 'https://www.bvod.by/index.php/325-brestvodokanal/icefilter-homepage/lichnyj-kabinet-yuridicheskikh-lits/654-lichnyj-kabinet-yuridicheskikh-lits';

async function test() {
    console.log('=== bvod.by Playwright Test ===\n');

    console.log('1. Запускаем Chromium...');
    const browser = await chromium.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
        ],
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        locale: 'ru-RU',
        viewport: { width: 1280, height: 800 },
    });

    const page = await context.newPage();

    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    console.log('2. Открываем bvod.by (timeout 60s)...');
    const startTime = Date.now();

    try {
        await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`   ✅ Страница загружена за ${elapsed}с`);
        console.log(`   URL: ${page.url()}`);

        const title = await page.title();
        console.log(`   Title: ${title}`);

        const bodyText = await page.$eval('body', el => el.textContent?.slice(0, 200) || '');
        console.log(`   Body (200 chars): ${bodyText.replace(/\s+/g, ' ').trim()}`);

        const hasLoginForm = await page.$('input[type="password"]');
        console.log(`   Форма входа: ${hasLoginForm ? '✅ найдена' : '❌ не найдена'}`);

        // Скриншот
        await page.screenshot({ path: 'downloads/test-screenshot.png', fullPage: false });
        console.log('   Скриншот: downloads/test-screenshot.png');

    } catch (err) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.error(`   ❌ Ошибка после ${elapsed}с:`);
        console.error(`   ${err instanceof Error ? err.message.split('\n')[0] : err}`);
        console.log(`   URL в момент ошибки: ${page.url()}`);
    }

    await browser.close();
    console.log('\n=== Тест завершён ===');
}

test().catch(console.error);
