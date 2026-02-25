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
        browserInstance = await chromium.launch({
            headless: true,         // true = без GUI (для сервера)
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
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
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });

    const page = await context.newPage();

    // Попытка восстановить сессию
    const sessionLoaded = await loadSession(context);

    if (sessionLoaded) {
        // Проверяем что сессия рабочая — заходим в кабинет
        await page.goto(PORTAL_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

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
    await page.goto(PORTAL_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

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

    for (const sel of submitSelectors) {
        const el = await page.$(sel);
        if (el) {
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }),
                el.click(),
            ]);
            break;
        }
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

/**
 * Получить список счетов из личного кабинета.
 * Возвращает все найденные ссылки на файлы счетов.
 */
export async function getInvoicesList(): Promise<InvoiceInfo[]> {
    const { context, page } = await loginToPortal();

    try {
        // Ищем все ссылки на файлы с нужными расширениями
        const fileLinks = await page.$$eval(
            'a[href]',
            (links) => links
                .map(a => ({
                    href: (a as HTMLAnchorElement).href,
                    text: a.textContent?.trim() || '',
                }))
                .filter(link =>
                    /\.(pdf|xlsx|xls|csv|txt)(\?.*)?$/i.test(link.href) ||
                    link.text.match(/счёт|счет|invoice|акт|квитанция/i)
                )
        );

        const invoices: InvoiceInfo[] = fileLinks.map(link => {
            const ext = (link.href.match(/\.(pdf|xlsx|xls|csv|txt)/i) || ['', 'pdf'])[1].toLowerCase();
            return {
                title: link.text || path.basename(link.href),
                date: '',
                amount: '',
                downloadUrl: link.href,
                fileType: ext,
            };
        });

        // Если ссылок нет — возвращаем текст страницы для анализа
        if (invoices.length === 0) {
            const pageText = await page.textContent('body') || '';
            return [{
                title: 'Страница личного кабинета',
                date: '',
                amount: '',
                downloadUrl: page.url(),
                fileType: 'page',
            }];
        }

        return invoices;
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
        // Начинаем ожидание скачивания
        const [download] = await Promise.all([
            context.waitForEvent('download', { timeout: 30000 }),
            page.goto(downloadUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }),
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

    switch (ext) {
        case '.pdf': {
            // Динамический импорт pdf-parse
            const pdfParse = (await import('pdf-parse')).default;
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
