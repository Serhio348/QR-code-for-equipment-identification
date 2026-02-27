/**
 * browserService.ts
 *
 * Сервис для автоматизации браузера (Playwright).
 * Используется для входа на портал bvod.by и скачивания счетов.
 *
 * Возможности:
 *   - Вход по логину/паролю с сохранением сессии (cookies)
 *   - Получение списка счетов со страницы личного кабинета
 *   - Скачивание файлов (PDF, Excel, CSV, TXT) в локальную папку
 *   - Чтение содержимого скачанных файлов
 *
 * Сессия:
 *   Cookies сохраняются в файл session.json после первого входа.
 *   При следующих запросах cookies восстанавливаются — повторный вход не нужен.
 *   Если сессия истекла — выполняется автоматический повторный вход.
 *
 * Форматы файлов:
 *   PDF   → читается через pdf-parse (текст из документа)
 *   Excel → читается через xlsx (таблицы → JSON)
 *   CSV   → читается как текст с разбивкой по строкам
 *   TXT   → читается как текст напрямую
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import { config } from '../config/env.js';

// ============================================
// Пути
// ============================================

// Папка для скачанных файлов (создаётся автоматически)
const DOWNLOADS_DIR = path.resolve(process.cwd(), 'downloads');

// Файл для хранения сессионных cookies
const SESSION_FILE = path.resolve(process.cwd(), 'downloads', '.session.json');

// ============================================
// URL портала
// ============================================

const PORTAL_BASE_URL = 'https://www.bvod.by';
const PORTAL_LOGIN_URL = 'https://www.bvod.by/index.php/325-brestvodokanal/icefilter-homepage/lichnyj-kabinet-yuridicheskikh-lits/654-lichnyj-kabinet-yuridicheskikh-lits';

// ============================================
// Singleton браузера
// ============================================
// Браузер создаётся один раз и переиспользуется.
// Это быстрее чем открывать новый браузер при каждом запросе.

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
    if (!browserInstance || !browserInstance.isConnected()) {
        const launchOptions: Parameters<typeof chromium.launch>[0] = {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',  // скрываем webdriver
                '--disable-infobars',
            ],
        };
        // В Docker (Alpine) используем системный Chromium через env-переменную.
        // В dev-режиме (env не задан) Playwright использует свой бандлированный браузер.
        if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
            launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
        }
        browserInstance = await chromium.launch(launchOptions);
    }
    return browserInstance;
}

// ============================================
// Управление сессией (cookies)
// ============================================

/**
 * Сохранить cookies текущей сессии в файл.
 * Вызывается после успешного входа.
 */
async function saveSession(context: BrowserContext): Promise<void> {
    const cookies = await context.cookies();
    await fsPromises.mkdir(DOWNLOADS_DIR, { recursive: true });
    await fsPromises.writeFile(SESSION_FILE, JSON.stringify(cookies, null, 2));
}

/**
 * Восстановить сессию из файла cookies.
 * Возвращает true если сессия загружена успешно.
 */
async function loadSession(context: BrowserContext): Promise<boolean> {
    try {
        if (!fs.existsSync(SESSION_FILE)) return false;
        const data = await fsPromises.readFile(SESSION_FILE, 'utf-8');
        const cookies = JSON.parse(data);
        if (!Array.isArray(cookies) || cookies.length === 0) return false;
        await context.addCookies(cookies);
        return true;
    } catch {
        return false;
    }
}

/**
 * Удалить сохранённую сессию (при ошибке авторизации).
 */
async function clearSession(): Promise<void> {
    try {
        if (fs.existsSync(SESSION_FILE)) {
            await fsPromises.unlink(SESSION_FILE);
        }
    } catch { /* игнорируем */ }
}

// ============================================
// Авторизация
// ============================================

/**
 * Войти на портал bvod.by.
 *
 * Алгоритм:
 * 1. Попытаться загрузить сохранённые cookies
 * 2. Проверить — работает ли сессия (зашли ли мы)
 * 3. Если нет — выполнить вход по логину/паролю
 * 4. Сохранить новые cookies
 *
 * @returns BrowserContext с активной сессией
 */
export async function loginToPortal(): Promise<{
    context: BrowserContext;
    page: Page;
    isNewLogin: boolean;
}> {
    const browser = await getBrowser();
    const context = await browser.newContext({
        acceptDownloads: true,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        locale: 'ru-RU',
        timezoneId: 'Europe/Minsk',
        viewport: { width: 1280, height: 800 },
        extraHTTPHeaders: {
            'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        },
    });

    const page = await context.newPage();

    // Скрываем признаки автоматизации до загрузки страницы.
    // navigator.webdriver = true — главный признак по которому сайты блокируют ботов.
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        // Имитируем реальный браузер: заполняем plugins и languages
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
        Object.defineProperty(navigator, 'languages', { get: () => ['ru-RU', 'ru', 'en-US'] });
    });

    // Попытка восстановить сессию
    const sessionLoaded = await loadSession(context);

    if (sessionLoaded) {
        // Проверяем что сессия рабочая — заходим в кабинет
        await page.goto(PORTAL_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Проверяем: если видим форму входа — сессия устарела
        const loginForm = await page.$('input[name="username"], input[type="password"]');
        if (!loginForm) {
            // Сессия рабочая
            return { context, page, isNewLogin: false };
        }

        // Сессия устарела — удаляем и входим заново
        await clearSession();
    }

    // Выполняем вход
    console.log('[bvod] Navigating to login page...');
    try {
        await page.goto(PORTAL_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    } catch (navErr) {
        // Таймаут на навигации — сохраняем скриншот и пробуем с меньшими требованиями
        console.warn('[bvod] domcontentloaded timeout, retrying with commit...', navErr instanceof Error ? navErr.message : navErr);
        await page.goto(PORTAL_LOGIN_URL, { waitUntil: 'commit', timeout: 60000 });
        await page.waitForTimeout(3000);
    }
    console.log('[bvod] Page URL after goto:', page.url());

    const login = config.bvodLogin;
    const password = config.bvodPassword;

    if (!login || !password) {
        throw new Error(
            'Логин/пароль для bvod.by не настроены. ' +
            'Добавьте BVOD_LOGIN и BVOD_PASSWORD в .env файл.'
        );
    }

    // Заполняем форму входа
    // Пробуем разные возможные селекторы для полей
    const loginSelectors = ['input[name="username"]', 'input[name="login"]', 'input[id="username"]', '#username'];
    const passSelectors  = ['input[name="password"]', 'input[type="password"]', '#password'];

    let loginFilled = false;
    for (const sel of loginSelectors) {
        const el = await page.$(sel);
        if (el) {
            await el.fill(login);
            loginFilled = true;
            break;
        }
    }

    let passFilled = false;
    for (const sel of passSelectors) {
        const el = await page.$(sel);
        if (el) {
            await el.fill(password);
            passFilled = true;
            break;
        }
    }

    if (!loginFilled || !passFilled) {
        // Делаем скриншот для отладки
        await page.screenshot({ path: path.join(DOWNLOADS_DIR, 'login_debug.png') });
        throw new Error(
            'Не найдена форма входа на странице. ' +
            'Скриншот сохранён: downloads/login_debug.png'
        );
    }

    // Нажимаем кнопку входа
    const submitSelectors = [
        'input[type="submit"]',
        'button[type="submit"]',
        'button:has-text("Войти")',
        'button:has-text("Вход")',
        'input[value="Войти"]',
    ];

    let submitted = false;
    for (const sel of submitSelectors) {
        const el = await page.$(sel);
        if (el) {
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 })
                    .catch(() => { /* навигация может не произойти */ }),
                el.click(),
            ]);
            submitted = true;
            break;
        }
    }

    if (!submitted) {
        await page.screenshot({ path: path.join(DOWNLOADS_DIR, 'login_debug.png') });
        throw new Error('Не найдена кнопка входа. Скриншот: downloads/login_debug.png');
    }

    // Проверяем что вход прошёл успешно — форма логина должна исчезнуть
    const stillOnLoginPage = await page.$('input[name="username"], input[type="password"]');
    if (stillOnLoginPage) {
        await page.screenshot({ path: path.join(DOWNLOADS_DIR, 'login_debug.png') });
        throw new Error(
            'Вход на bvod.by не выполнен. Проверьте BVOD_LOGIN и BVOD_PASSWORD. ' +
            'Скриншот: downloads/login_debug.png'
        );
    }

    // Сохраняем сессию
    await saveSession(context);

    return { context, page, isNewLogin: true };
}

// ============================================
// Получение списка счетов
// ============================================

export interface InvoiceInfo {
    title: string;           // Название/номер счёта
    date: string;            // Дата
    amount: string;          // Сумма (если видна на странице)
    downloadUrl: string;     // Ссылка для скачивания
    fileType: string;        // pdf | xlsx | csv | txt
}

export interface InvoicesResult {
    invoices: InvoiceInfo[];
    otherLinks: { href: string; text: string }[];  // остальные ссылки страницы
    pageText: string;   // Текст страницы — агент видит что реально на экране
    pageUrl: string;    // URL на котором нашли счета
}

/**
 * Получить список счетов из личного кабинета.
 *
 * Алгоритм:
 * 1. Войти / восстановить сессию
 * 2. Попробовать перейти на вкладку "Выставленные счета" (или аналог)
 * 3. Собрать ссылки на файлы (.pdf/.xlsx/.csv/.txt)
 * 4. Вернуть файлы + текст страницы (чтобы агент понимал контекст)
 */
export async function getInvoicesList(): Promise<InvoicesResult> {
    const { context, page } = await loginToPortal();

    try {
        // Пробуем найти и открыть вкладку со счетами.
        // Используем JS-поиск с case-insensitive сравнением —
        // сайт может отображать текст заглавными буквами через CSS text-transform.
        const invoiceNavKeywords = [
            'выставленные счета',
            'счета-фактуры',
            'счета фактур',
            'счета',
            'документы',
            'финансы',
        ];

        const navClicked = await page.evaluate((keywords: string[]) => {
            const links = Array.from(document.querySelectorAll('a'));
            for (const link of links) {
                const text = (link.textContent || '').trim().toLowerCase();
                if (keywords.some(kw => text === kw || text.includes(kw))) {
                    (link as HTMLAnchorElement).click();
                    return link.textContent?.trim() || '';
                }
            }
            return null;
        }, invoiceNavKeywords);

        if (navClicked) {
            // Ждём завершения навигации или Ajax-подгрузки
            await page.waitForLoadState('domcontentloaded').catch(() => {});
            await page.waitForTimeout(1500);
        }

        // Проверяем что сессия не истекла прямо сейчас.
        // Если видим форму входа — значит сессия устарела после навигации.
        const loginFormNow = await page.$('input[name="username"], input[type="password"]');
        if (loginFormNow) {
            await clearSession();
            throw new Error(
                'Сессия на bvod.by истекла. Вызови portal_login для повторного входа, ' +
                'затем снова portal_list_invoices.'
            );
        }

        // Скриншот страницы для отладки — сохраняется в downloads/debug_invoices.png
        await fsPromises.mkdir(DOWNLOADS_DIR, { recursive: true });
        await page.screenshot({ path: path.join(DOWNLOADS_DIR, 'debug_invoices.png'), fullPage: true });

        // Собираем ВСЕ ссылки страницы с текстом — AI сам определит что скачивать.
        // Не фильтруем по расширению: ссылки на счета могут быть любого вида
        // (например /download/invoice/123 без расширения).
        const allLinks = await page.$$eval('a[href]', (links) =>
            links
                .map(a => ({
                    href: (a as HTMLAnchorElement).href,
                    text: (a.textContent?.trim() || a.getAttribute('title') || ''),
                }))
                .filter(l =>
                    // Исключаем пустые и навигационные ссылки (якоря, javascript:)
                    l.href &&
                    !l.href.startsWith('javascript:') &&
                    !l.href.endsWith('#') &&
                    l.text.length > 0
                )
        );

        // Группируем: сначала явно файловые ссылки, потом остальные.
        // ВАЖНО: на bvod.by текст ссылки — имя файла (107.00-2026-01.pdf),
        // а href — Joomla URL без расширения. Проверяем ОБА варианта.
        const FILE_EXT_RE = /\.(pdf|xlsx|xls|csv|txt|zip)(\?.*)?$/i;
        const FILE_EXT_TEXT_RE = /\.(pdf|xlsx|xls|csv|txt|zip)$/i;

        const fileLinks = allLinks.filter(l =>
            FILE_EXT_RE.test(l.href) ||                         // расширение в href
            FILE_EXT_TEXT_RE.test(l.text) ||                   // расширение в тексте ссылки
            l.text.match(/счёт|счет|фактур|invoice|акт|квитанция|скачать|download/i)
        );
        const otherLinks = allLinks.filter(l => !fileLinks.includes(l)).slice(0, 30);

        const invoices: InvoiceInfo[] = fileLinks.map(link => {
            const label = link.text || path.basename(link.href);

            // Расширение: ищем в тексте (107.00-2026-01.pdf) затем в href
            const extMatch = label.match(/\.(pdf|xlsx|xls|csv|txt|zip)$/i)
                          || link.href.match(/\.(pdf|xlsx|xls|csv|txt|zip)/i);
            const ext = extMatch ? extMatch[1].toLowerCase() : 'file';

            // Дата из имени файла вида 107.00-YYYY-MM.ext
            const dateMatch = label.match(/[_-](\d{4})[_-](\d{2})\./);
            const date = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}` : '';

            return {
                title: label,
                date,
                amount: '',
                downloadUrl: link.href,
                fileType: ext,
            };
        });

        // Текст страницы — для агента, чтобы понять что видит браузер
        const rawText = (await page.textContent('body')) || '';
        const pageText = rawText.replace(/\s+/g, ' ').trim().slice(0, 3000);

        return {
            invoices,
            otherLinks,  // остальные ссылки страницы — AI может их проанализировать
            pageText,
            pageUrl: page.url(),
        };
    } finally {
        await context.close();
    }
}

// ============================================
// Скачивание файла
// ============================================

/**
 * Скачать файл по URL из личного кабинета.
 *
 * @param downloadUrl - URL файла для скачивания
 * @param customName  - Имя файла (опционально, иначе из URL)
 * @returns Путь к скачанному файлу
 */
export async function downloadInvoice(
    downloadUrl: string,
    customName?: string
): Promise<string> {
    await fsPromises.mkdir(DOWNLOADS_DIR, { recursive: true });

    const { context, page } = await loginToPortal();

    try {
        // Начинаем ожидание скачивания.
        // page.waitForEvent (не context) — у BrowserContext нет 'download' в типах
        const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 30000 }),
            page.goto(downloadUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }),
        ]);

        // Определяем имя файла
        const suggestedName = download.suggestedFilename();
        const ext = path.extname(suggestedName) || '.pdf';
        const fileName = customName
            ? `${customName}${ext}`
            : `invoice_${Date.now()}${ext}`;

        const savePath = path.join(DOWNLOADS_DIR, fileName);
        await download.saveAs(savePath);

        return savePath;
    } catch {
        // Попробуем через прямой fetch с cookies
        const cookies = await context.cookies();
        const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

        const response = await fetch(downloadUrl, {
            headers: { Cookie: cookieHeader },
        });

        if (!response.ok) {
            throw new Error(`Не удалось скачать файл: HTTP ${response.status}`);
        }

        const ext = downloadUrl.match(/\.(pdf|xlsx|xls|csv|txt)/i)?.[1] || 'pdf';
        const fileName = customName ? `${customName}.${ext}` : `invoice_${Date.now()}.${ext}`;
        const savePath = path.join(DOWNLOADS_DIR, fileName);

        const buffer = Buffer.from(await response.arrayBuffer());
        await fsPromises.writeFile(savePath, buffer);

        return savePath;
    } finally {
        await context.close();
    }
}

// ============================================
// Чтение файлов
// ============================================

/**
 * Прочитать содержимое скачанного файла.
 * Поддерживает: PDF, Excel (xlsx/xls), CSV, TXT.
 *
 * @param filePath - Путь к файлу
 * @returns Текстовое содержимое файла
 */
export async function readInvoiceFile(filePath: string): Promise<string> {
    const ext = path.extname(filePath).toLowerCase();
    const buffer = await fsPromises.readFile(filePath);

    // Определяем реальный тип файла по содержимому (а не по расширению).
    // Портал может отдать HTML-страницу с расширением .pdf — проверяем сигнатуру.
    const head = buffer.slice(0, 5).toString('utf-8');
    const isHtml = head.startsWith('<!') || head.toLowerCase().startsWith('<html') || head.startsWith('<!--');

    if (isHtml) {
        // HTML — убираем теги, возвращаем текст страницы
        const html = buffer.toString('utf-8');
        const text = html
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        return `[Скачан HTML, не ${ext || 'файл'}]\n\n${text.slice(0, 5000)}`;
    }

    switch (ext) {
        case '.pdf': {
            // pdf-parse — CJS пакет. В ESM проекте createRequire надёжнее dynamic import
            const { createRequire } = await import('module');
            const require = createRequire(import.meta.url);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;
            const data = await pdfParse(buffer);
            return data.text;
        }

        case '.xlsx':
        case '.xls': {
            const XLSX = await import('xlsx');
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            const result: string[] = [];

            for (const sheetName of workbook.SheetNames) {
                const sheet = workbook.Sheets[sheetName];
                const csv = XLSX.utils.sheet_to_csv(sheet);
                result.push(`=== Лист: ${sheetName} ===\n${csv}`);
            }

            return result.join('\n\n');
        }

        case '.csv': {
            return buffer.toString('utf-8');
        }

        case '.txt': {
            // Пробуем UTF-8, потом win1251
            try {
                return buffer.toString('utf-8');
            } catch {
                return buffer.toString('latin1');
            }
        }

        default:
            return buffer.toString('utf-8');
    }
}

// ============================================
// Список скачанных файлов
// ============================================

/**
 * Получить список уже скачанных файлов из папки downloads.
 */
export async function listDownloadedFiles(): Promise<Array<{
    name: string;
    path: string;
    size: string;
    modified: string;
}>> {
    await fsPromises.mkdir(DOWNLOADS_DIR, { recursive: true });

    const files = await fsPromises.readdir(DOWNLOADS_DIR);
    const result = [];

    for (const file of files) {
        if (file.startsWith('.')) continue; // пропускаем .session.json

        const filePath = path.join(DOWNLOADS_DIR, file);
        const stat = await fsPromises.stat(filePath);

        result.push({
            name: file,
            path: filePath,
            size: `${Math.round(stat.size / 1024)} KB`,
            modified: stat.mtime.toLocaleDateString('ru-RU'),
        });
    }

    return result.sort((a, b) => b.modified.localeCompare(a.modified));
}

// ============================================
// Завершение работы браузера
// ============================================

export async function closeBrowser(): Promise<void> {
    if (browserInstance) {
        await browserInstance.close();
        browserInstance = null;
    }
}
