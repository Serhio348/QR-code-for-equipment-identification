/**
 * driveTools.ts
 *
 * Определения tools (инструментов) для работы с Google Drive
 * и функция их выполнения.
 *
 * Этот файл позволяет Claude AI искать файлы в папках оборудования
 * и читать их содержимое (паспорта, инструкции, акты и т.д.).
 *
 * Цепочка взаимодействия:
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  Пользователь: "Найди паспорт обратного осмоса"                 │
 * │       ↓                                                          │
 * │  Claude:                                                         │
 * │    1) get_all_equipment({search: "обратный осмос"})              │
 * │       → получает оборудование с googleDriveUrl                   │
 * │    2) search_files_in_folder({folder_url: googleDriveUrl})       │
 * │       → получает список PDF в папке                              │
 * │    3) read_file_content({file_url: "файл_паспорта.pdf"})        │
 * │       → получает текст из PDF (через OCR в GAS)                  │
 * │    4) Формирует ответ на основе прочитанного содержимого        │
 * └──────────────────────────────────────────────────────────────────┘
 *
 * Важные особенности:
 * - Файлы читаются через GAS API, который использует Google Drive API v2
 * - Для PDF применяется OCR (распознавание текста) через Google Drive
 * - Есть лимит на длину извлекаемого текста (по умолчанию 30000 символов)
 * - Google Drive URL автоматически парсится — можно передать как URL, так и ID
 *
 * Файл экспортирует:
 * - driveTools — массив определений tools для Anthropic API
 * - executeDriveTool — функция выполнения tool по имени
 */

// ============================================
// Импорты
// ============================================

// Типы Anthropic SDK — используем Anthropic.Tool для типизации
// определений инструментов, совместимых с Claude API
import Anthropic from '@anthropic-ai/sdk';

// HTTP-клиент для запросов к Google Apps Script (GAS) backend.
// gasClient.get(action, params) отправляет GET-запрос к GAS Web App:
// GET {GAS_URL}?action={action}&param1=val1&param2=val2
import { gasClient } from '../services/gasClient.js';

// ============================================
// Определения tools (инструментов)
// ============================================

/**
 * Массив инструментов для работы с Google Drive.
 *
 * Два инструмента:
 * 1. search_files_in_folder — поиск файлов в папке (список)
 * 2. read_file_content — чтение содержимого файла (текст)
 *
 * Claude использует их последовательно: сначала находит нужный файл,
 * затем читает его содержимое для ответа на вопрос пользователя.
 */
export const driveTools: Anthropic.Tool[] = [

    // ----------------------------------------
    // Tool 1: Поиск файлов в папке
    // ----------------------------------------
    // Возвращает список файлов с их ID, именами, URL и размерами.
    // Claude использует этот tool, когда:
    // - Нужно найти конкретный документ (паспорт, инструкцию)
    // - Пользователь просит показать, что есть в папке оборудования
    // - Перед чтением файла — чтобы узнать его ID
    {
        name: 'search_files_in_folder',
        description: 'Поиск файлов и вложенных папок в папке оборудования на Google Drive. По умолчанию возвращает файлы. Для поиска вложенных папок (например, папка с фото) передай mime_type: "application/vnd.google-apps.folder". Чтобы показать всё содержимое, делай два запроса: один без mime_type (файлы), второй с mime_type="application/vnd.google-apps.folder" (папки).',
        input_schema: {
            type: 'object' as const,
            properties: {
                // URL или ID папки Google Drive
                // Может быть в любом формате:
                //   - Полный URL: https://drive.google.com/drive/folders/ABC123
                //   - Только ID: ABC123
                // Парсинг выполняет функция extractDriveId()
                folder_url: {
                    type: 'string',
                    description: 'URL папки Google Drive или ID папки',
                },
                // Фильтрация по имени файла (необязательно)
                // Пример: "паспорт" найдёт "Паспорт_ОО_8400.pdf"
                query: {
                    type: 'string',
                    description: 'Поисковый запрос по названию файла или папки',
                },
                // Фильтрация по MIME-типу (необязательно)
                // Для папок: "application/vnd.google-apps.folder"
                // Для PDF: "application/pdf"
                // Для изображений: "image/jpeg" или "image/png"
                mime_type: {
                    type: 'string',
                    description: 'Фильтр по типу: application/pdf, image/jpeg, application/vnd.google-apps.folder (для вложенных папок) и т.д.',
                },
            },
            // folder_url обязателен — без него непонятно, где искать
            required: ['folder_url'],
        },
    },

    // ----------------------------------------
    // Tool 2: Чтение содержимого файла
    // ----------------------------------------
    // Извлекает текстовое содержимое файла с Google Drive.
    // Поддерживаемые форматы (обработка на стороне GAS):
    //   - PDF: конвертируется через Google Drive OCR → текст
    //   - Google Docs: экспортируется как plain text
    //   - Google Sheets: экспортируется как CSV
    //   - Excel (.xls, .xlsx): конвертируется во временный Google Sheet → текст
    //   - Word (.doc, .docx): конвертируются через Google Drive
    //   - Текстовые файлы (.txt, .md, .csv, .json, .xml): читаются напрямую
    //
    // ОГРАНИЧЕНИЕ: OCR имеет квоту Google — при частых запросах
    // может возникнуть ошибка "User rate limit exceeded for OCR"
    {
        name: 'read_file_content',
        description: 'Прочитать текстовое содержимое файла из Google Drive. Поддерживает PDF (с OCR), Google Docs, текстовые файлы. Используй для чтения инструкций и паспортов оборудования.',
        input_schema: {
            type: 'object' as const,
            properties: {
                // URL или ID файла на Google Drive
                // Парсинг URL выполняет extractDriveId()
                // Форматы URL:
                //   - https://drive.google.com/file/d/ABC123/view
                //   - https://drive.google.com/open?id=ABC123
                //   - ABC123 (просто ID)
                file_url: {
                    type: 'string',
                    description: 'URL файла на Google Drive или его ID',
                },
                // Лимит длины возвращаемого текста (в символах)
                // По умолчанию 30000 — достаточно для большинства паспортов
                // Для очень больших документов можно увеличить
                max_length: {
                    type: 'number',
                    description: 'Максимальная длина текста в символах (по умолчанию 30000)',
                },
            },
            required: ['file_url'],
        },
    },
];

// ============================================
// Функция выполнения tools
// ============================================

/**
 * Выполняет tool (инструмент) для работы с Google Drive.
 *
 * Вызывается из anthropic.ts в агентном цикле, когда Claude
 * решает использовать один из driveTools.
 *
 * Особенности:
 * - Все URL автоматически парсятся через extractDriveId()
 * - Логирует каждый вызов (имя tool + ключи параметров + время)
 * - Параметры маппятся из snake_case (Claude) в camelCase (GAS API)
 *
 * @param name - Имя tool (search_files_in_folder | read_file_content)
 * @param input - Параметры от Claude (Record<string, unknown>)
 * @returns JSON-ответ от GAS API
 * @throws Error если tool с таким именем не найден
 *
 * @example
 * // Поиск PDF в папке оборудования
 * const files = await executeDriveTool('search_files_in_folder', {
 *   folder_url: 'https://drive.google.com/drive/folders/ABC123',
 *   mime_type: 'application/pdf'
 * });
 *
 * @example
 * // Чтение содержимого PDF-файла
 * const content = await executeDriveTool('read_file_content', {
 *   file_url: '1-44iVaJjfZDbcqenE-js4vPYHfZhx1tt'
 * });
 */
export async function executeDriveTool(
    name: string,
    input: Record<string, unknown>
): Promise<unknown> {
    // Логирование вызова tool для отладки.
    // Выводим только ключи параметров (не значения) — чтобы не засорять
    // логи длинными URL, но при этом видеть, какие параметры были переданы
    console.log(`[DriveTool] ${name} called:`, {
        inputKeys: Object.keys(input),
        timestamp: new Date().toISOString(),
    });
    switch (name) {

        // ----------------------------------------
        // Поиск файлов в папке
        // ----------------------------------------
        // GAS action: 'getFolderFiles'
        // HTTP: GET ?action=getFolderFiles&folderId=...&query=...&mimeType=...
        //
        // extractDriveId() извлекает чистый ID из URL/строки,
        // чтобы GAS API получил корректный folderId
        case 'search_files_in_folder':
            return await gasClient.get('getFolderFiles', {
                folderId: extractDriveId(input.folder_url as string),
                query: input.query as string | undefined,
                mimeType: input.mime_type as string | undefined,
            });

        // ----------------------------------------
        // Чтение содержимого файла
        // ----------------------------------------
        // GAS action: 'getFileContent'
        // HTTP: GET ?action=getFileContent&fileId=...&maxLength=...
        //
        // GAS backend выполняет:
        // 1. Определяет MIME-тип файла
        // 2. Для PDF — создаёт копию через Drive API с OCR
        // 3. Извлекает текст из сконвертированного Google Doc
        // 4. Обрезает до maxLength символов
        // 5. Возвращает { content, fileName, mimeType, charCount, truncated }
        //
        // Особенность: maxLength передаётся как string, потому что
        // gasClient.get() формирует URL query parameters (всегда строки)
        case 'read_file_content':
            return await gasClient.get('getFileContent', {
                fileId: extractDriveId(input.file_url as string),
                maxLength: input.max_length ? String(input.max_length) : '30000',
            });

        // Неизвестный tool — ошибка
        default:
            throw new Error(`Unknown drive tool: ${name}`);
    }
}

// ============================================
// Вспомогательные функции
// ============================================

/**
 * Извлекает ID ресурса из URL Google Drive или возвращает строку как есть.
 *
 * Google Drive использует разные форматы URL для папок и файлов.
 * Claude может передать URL в любом из этих форматов (скопированный
 * из браузера или из поля googleDriveUrl оборудования).
 * Эта функция нормализует вход к чистому ID.
 *
 * Поддерживаемые форматы:
 *
 * 1. URL папки:
 *    https://drive.google.com/drive/folders/1ABC_xyz123
 *    → извлекается "1ABC_xyz123"
 *
 * 2. URL файла:
 *    https://drive.google.com/file/d/1ABC_xyz123/view
 *    → извлекается "1ABC_xyz123"
 *
 * 3. URL с параметром id:
 *    https://drive.google.com/open?id=1ABC_xyz123
 *    → извлекается "1ABC_xyz123"
 *
 * 4. Прямой ID (строка из 20+ символов [a-zA-Z0-9_-]):
 *    1ABC_xyz123-456
 *    → возвращается как есть
 *
 * 5. Прочее:
 *    Если ни один паттерн не совпал — возвращается исходная строка.
 *    GAS API сам вернёт ошибку, если ID невалидный.
 *
 * @param urlOrId - URL Google Drive или ID ресурса
 * @returns Чистый ID ресурса (папки или файла)
 */
function extractDriveId(urlOrId: string): string {
    // Защита от пустых значений
    if (!urlOrId) return '';

    // Паттерн 1: URL папки — /folders/ID
    // Пример: https://drive.google.com/drive/folders/1ABC_xyz123
    const foldersMatch = urlOrId.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (foldersMatch) return foldersMatch[1];

    // Паттерн 2: URL файла — /file/d/ID
    // Пример: https://drive.google.com/file/d/1ABC_xyz123/view
    const fileMatch = urlOrId.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (fileMatch) return fileMatch[1];

    // Паттерн 3: URL с query-параметром — ?id=ID или &id=ID
    // Пример: https://drive.google.com/open?id=1ABC_xyz123
    const idMatch = urlOrId.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (idMatch) return idMatch[1];

    // Паттерн 4: Прямой ID — строка 20+ символов из допустимых символов
    // Google Drive ID обычно имеет длину 28-44 символа
    if (/^[a-zA-Z0-9_-]{20,}$/.test(urlOrId)) {
        return urlOrId;
    }

    // Fallback: возвращаем как есть, GAS API разберётся
    return urlOrId;
}
