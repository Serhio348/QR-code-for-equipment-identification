/**
 * documentTools.ts
 *
 * Tool для создания документов (Google Doc / Google Sheet) через GAS API.
 *
 * Один универсальный инструмент create_document позволяет ИИ создавать
 * любые документы: графики ТО, инструкции, акты, отчёты и т.д.
 * Новый тип документа = обновление промпта, код не трогается.
 *
 * Цепочка взаимодействия:
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  Пользователь: "Составь график ТО на квартал"                    │
 * │       ↓                                                          │
 * │  Claude:                                                         │
 * │    1) get_maintenance_log() → анализирует историю                │
 * │    2) create_document({                                          │
 * │         name: "График ТО — Q1 2026",                             │
 * │         type: "sheet",                                           │
 * │         content: [["Дата","Работа","Оборудование"], ...],        │
 * │         folder_url: googleDriveUrl                               │
 * │       })                                                         │
 * │    3) Возвращает ссылку пользователю                             │
 * └──────────────────────────────────────────────────────────────────┘
 *
 * Файл экспортирует:
 * - documentTools — массив определений tools для Anthropic API
 * - executeDocumentTool — функция выполнения tool
 */

// ============================================
// Импорты
// ============================================

import Anthropic from '@anthropic-ai/sdk';
import { gasClient } from '../services/gasClient.js';

// ============================================
// Определения tools
// ============================================

/**
 * Массив инструментов для создания документов.
 *
 * Один универсальный tool: create_document
 * Поддерживает создание Google Doc и Google Sheet.
 */
export const documentTools: Anthropic.Tool[] = [
    {
        name: 'create_document',
        description: 'Создать документ в Google Drive. Для текстовых документов (инструкции, акты, отчёты) используй type="doc" и передай текст с markdown-заголовками (# ## ###). Для таблиц (графики ТО, расписания, списки) используй type="sheet" и передай JSON массив массивов.',
        input_schema: {
            type: 'object' as const,
            properties: {
                // Название документа (будет видно в Google Drive)
                name: {
                    type: 'string',
                    description: 'Название документа. Примеры: "График ТО — Котельная — Q1 2026", "Инструкция по замене фильтра", "Акт выполненных работ"',
                },
                // Тип документа: doc (текст) или sheet (таблица)
                type: {
                    type: 'string',
                    enum: ['doc', 'sheet'],
                    description: 'Тип документа: "doc" для Google Doc (текст), "sheet" для Google Sheet (таблица)',
                },
                // Содержимое документа
                // Для doc: текст с # заголовками, абзацы через \n
                // Для sheet: JSON массив массивов [["Header1", "Header2"], ["val1", "val2"]]
                content: {
                    type: 'string',
                    description: 'Содержимое документа. Для doc: текст с markdown-заголовками (#, ##, ###), абзацы через перенос строки. Для sheet: JSON массив массивов, первая строка — заголовки.',
                },
                // URL или ID папки Google Drive для сохранения (опционально)
                // Если не указан — сохраняется в корень Drive
                folder_url: {
                    type: 'string',
                    description: 'URL или ID папки Google Drive, куда сохранить документ. Если не указан — сохраняется в корень Drive.',
                },
            },
            required: ['name', 'type', 'content'],
        },
    },
];

// ============================================
// Функция выполнения tool
// ============================================

/**
 * Выполняет tool create_document.
 *
 * Отправляет POST запрос к GAS API action=createDocument.
 * GAS создаёт Google Doc или Google Sheet и возвращает ссылку.
 *
 * @param name - Имя tool (create_document)
 * @param input - Параметры от Claude
 * @returns {fileId, fileUrl, fileName, type} от GAS API
 */
export async function executeDocumentTool(
    name: string,
    input: Record<string, unknown>
): Promise<unknown> {
    console.log(`[DocumentTool] ${name} called:`, {
        inputKeys: Object.keys(input),
        docName: input.name,
        docType: input.type,
        timestamp: new Date().toISOString(),
    });

    switch (name) {
        case 'create_document':
            return await gasClient.post('createDocument', {
                name: input.name as string,
                docType: input.type as string,
                content: input.content as string,
                folderId: input.folder_url ? extractDriveId(input.folder_url as string) : undefined,
            });

        default:
            throw new Error(`Unknown document tool: ${name}`);
    }
}

// ============================================
// Вспомогательные функции
// ============================================

/**
 * Извлекает ID ресурса из URL Google Drive или возвращает строку как есть.
 */
function extractDriveId(urlOrId: string): string {
    if (!urlOrId) return '';

    const foldersMatch = urlOrId.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (foldersMatch) return foldersMatch[1];

    const fileMatch = urlOrId.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (fileMatch) return fileMatch[1];

    const idMatch = urlOrId.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (idMatch) return idMatch[1];

    if (/^[a-zA-Z0-9_-]{20,}$/.test(urlOrId)) {
        return urlOrId;
    }

    return urlOrId;
}
