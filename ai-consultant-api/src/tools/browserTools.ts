/**
 * browserTools.ts
 *
 * Инструменты AI-агента для работы с порталом bvod.by.
 *
 * Что умеет агент:
 *   1. portal_login          — войти на портал (с сохранением сессии)
 *   2. portal_list_invoices  — получить список счетов
 *   3. portal_download_invoice — скачать счёт в локальную папку
 *   4. portal_read_invoice   — прочитать содержимое файла (PDF/Excel/CSV/TXT)
 *   5. portal_list_downloaded — показать уже скачанные файлы
 *
 * Пример диалога:
 *   Пользователь: "Скачай счёт за январь"
 *   Агент:
 *     1. portal_login()             → вошёл на сайт
 *     2. portal_list_invoices()     → нашёл счёт за январь
 *     3. portal_download_invoice()  → скачал в downloads/
 *     4. portal_read_invoice()      → прочитал содержимое
 *     5. Ответил с суммой и деталями
 */

import Anthropic from '@anthropic-ai/sdk';
import {
    loginToPortal,
    getInvoicesList,
    downloadInvoice,
    readInvoiceFile,
    listDownloadedFiles,
} from '../services/browserService.js';

// ============================================
// Определения инструментов
// ============================================

export const browserTools: Anthropic.Tool[] = [

    // ----------------------------------------
    // Tool 1: Вход на портал
    // ----------------------------------------
    {
        name: 'portal_login',
        description: 'Войти на портал bvod.by. ОБЯЗАТЕЛЬНО вызывай ПЕРВЫМ при каждом запросе о счетах bvod.by — даже если ранее уже входил. Автоматически проверяет сессию: если активна — возвращает сразу; если истекла — выполняет новый вход и сохраняет сессию. Без этого вызова другие portal_* инструменты упадут с ошибкой "сессия истекла".',
        input_schema: {
            type: 'object' as const,
            properties: {},
            required: [],
        },
    },

    // ----------------------------------------
    // Tool 2: Список счетов
    // ----------------------------------------
    {
        name: 'portal_list_invoices',
        description: 'Получить список счетов в личном кабинете bvod.by. Возвращает названия файлов, даты и ссылки для скачивания. Используй чтобы найти нужный счёт перед скачиванием.',
        input_schema: {
            type: 'object' as const,
            properties: {},
            required: [],
        },
    },

    // ----------------------------------------
    // Tool 3: Скачать счёт
    // ----------------------------------------
    {
        name: 'portal_download_invoice',
        description: 'Скачать счёт с портала bvod.by в локальную папку downloads/. Принимает URL файла из portal_list_invoices. Возвращает путь к скачанному файлу.',
        input_schema: {
            type: 'object' as const,
            properties: {
                download_url: {
                    type: 'string',
                    description: 'URL файла для скачивания (из portal_list_invoices).',
                },
                file_name: {
                    type: 'string',
                    description: 'Имя файла для сохранения (без расширения). Например: "schet_yanvar_2026". Если не указано — генерируется автоматически.',
                },
            },
            required: ['download_url'],
        },
    },

    // ----------------------------------------
    // Tool 4: Прочитать файл
    // ----------------------------------------
    {
        name: 'portal_read_invoice',
        description: 'Прочитать содержимое скачанного файла счёта. Поддерживает PDF, Excel (xlsx/xls), CSV, TXT. Возвращает текст документа для анализа. Используй после portal_download_invoice.',
        input_schema: {
            type: 'object' as const,
            properties: {
                file_path: {
                    type: 'string',
                    description: 'Путь к файлу (из portal_download_invoice) или имя файла в папке downloads/.',
                },
            },
            required: ['file_path'],
        },
    },

    // ----------------------------------------
    // Tool 5: Список скачанных файлов
    // ----------------------------------------
    {
        name: 'portal_list_downloaded',
        description: 'Показать список файлов которые уже были скачаны ранее из bvod.by. Полезно если пользователь хочет открыть или прочитать ранее скачанный счёт.',
        input_schema: {
            type: 'object' as const,
            properties: {},
            required: [],
        },
    },
];

// ============================================
// Исполнитель инструментов
// ============================================

export async function executeBrowserTool(
    name: string,
    input: Record<string, unknown>
): Promise<unknown> {
    switch (name) {

        // ----------------------------------------
        // Вход на портал
        // ----------------------------------------
        case 'portal_login': {
            const result = await loginToPortal();
            await result.context.close();

            return {
                success: true,
                message: result.isNewLogin
                    ? 'Выполнен вход на портал bvod.by. Сессия сохранена.'
                    : 'Сессия активна. Повторный вход не требуется.',
                isNewLogin: result.isNewLogin,
            };
        }

        // ----------------------------------------
        // Список счетов
        // ----------------------------------------
        case 'portal_list_invoices': {
            const result = await getInvoicesList();

            if (result.invoices.length === 0) {
                return {
                    found: false,
                    current_url: result.pageUrl,
                    page_text: result.pageText,
                    all_links: result.otherLinks,
                    message: 'Файловых ссылок не найдено. Изучи page_text и all_links — там видно что реально в браузере. Возможно нужная ссылка в all_links.',
                };
            }

            return {
                found: true,
                count: result.invoices.length,
                current_url: result.pageUrl,
                page_text: result.pageText,
                invoices: result.invoices.map((inv, i) => ({
                    index: i + 1,
                    title: inv.title,
                    file_type: inv.fileType,
                    download_url: inv.downloadUrl,
                })),
                // Остальные ссылки на случай если AI захочет проверить другие разделы
                other_links: result.otherLinks.slice(0, 20),
            };
        }

        // ----------------------------------------
        // Скачать счёт
        // ----------------------------------------
        case 'portal_download_invoice': {
            const downloadUrl = input.download_url as string;
            const fileName = input.file_name as string | undefined;

            if (!downloadUrl) {
                throw new Error('Укажи URL файла (download_url). Получи его через portal_list_invoices.');
            }

            const filePath = await downloadInvoice(downloadUrl, fileName);
            const fileNameResult = filePath.split(/[/\\]/).pop() || filePath;

            return {
                success: true,
                message: `Файл скачан: ${fileNameResult}`,
                file_path: filePath,
                file_name: fileNameResult,
                hint: 'Используй portal_read_invoice чтобы прочитать содержимое.',
            };
        }

        // ----------------------------------------
        // Прочитать файл
        // ----------------------------------------
        case 'portal_read_invoice': {
            let filePath = input.file_path as string;

            // Если передано только имя файла — ищем в папке downloads
            if (!filePath.includes('/') && !filePath.includes('\\')) {
                const { default: path } = await import('path');
                const { default: fs } = await import('fs');
                const downloadsDir = path.resolve(process.cwd(), 'downloads');
                filePath = path.join(downloadsDir, filePath);

                if (!fs.existsSync(filePath)) {
                    throw new Error(
                        `Файл "${input.file_path}" не найден в папке downloads/. ` +
                        'Используй portal_list_downloaded для просмотра доступных файлов.'
                    );
                }
            }

            const content = await readInvoiceFile(filePath);

            // Ограничиваем размер для контекста AI (первые 8000 символов)
            const truncated = content.length > 8000;
            const text = truncated ? content.slice(0, 8000) + '\n\n[... текст обрезан ...]' : content;

            return {
                success: true,
                file_path: filePath,
                content_length: content.length,
                truncated,
                content: text,
            };
        }

        // ----------------------------------------
        // Список скачанных файлов
        // ----------------------------------------
        case 'portal_list_downloaded': {
            const files = await listDownloadedFiles();

            if (files.length === 0) {
                return {
                    found: false,
                    message: 'Папка downloads/ пуста. Скачай файлы через portal_download_invoice.',
                };
            }

            return {
                found: true,
                count: files.length,
                files: files.map((f, i) => ({
                    index: i + 1,
                    name: f.name,
                    size: f.size,
                    modified: f.modified,
                    path: f.path,
                })),
            };
        }

        default:
            throw new Error(`Unknown browser tool: ${name}`);
    }
}
