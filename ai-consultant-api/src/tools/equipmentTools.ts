/**
 * equipmentTools.ts
 *
 * Определения tools (инструментов) для работы с оборудованием
 * и функция их выполнения.
 *
 * Этот файл — "мост" между Claude AI и Google Apps Script (GAS) API.
 * Claude не может напрямую обращаться к базе данных оборудования.
 * Вместо этого он "вызывает" tools, описанные здесь, а сервер
 * выполняет реальные HTTP-запросы к GAS API через gasClient.
 *
 * Схема взаимодействия:
 * ┌────────────────────────────────────────────────────────────────┐
 * │  Claude AI                                                     │
 * │  "Мне нужно найти фильтр ФО-0,8"                              │
 * │       ↓ tool_use: get_all_equipment({search: "ФО-0,8"})       │
 * │                                                                │
 * │  equipmentTools.ts                                             │
 * │  executeEquipmentTool('get_all_equipment', {search: "ФО-0,8"})│
 * │       ↓ gasClient.get('getAll', {search: "ФО-0,8"})           │
 * │                                                                │
 * │  gasClient.ts → HTTP GET → GAS Web App → Google Sheets        │
 * │       ↓ JSON response                                          │
 * │                                                                │
 * │  Claude получает результат и формирует ответ пользователю     │
 * └────────────────────────────────────────────────────────────────┘
 *
 * Файл экспортирует:
 * - equipmentTools — массив определений tools для Anthropic API
 * - executeEquipmentTool — функция выполнения tool по имени
 *
 * Эти экспорты используются в ../tools/index.ts, который
 * объединяет все tools и передаёт их в anthropic.ts.
 */

// ============================================
// Импорты
// ============================================

// Типы Anthropic SDK — нужен тип Tool для определения инструментов
// Anthropic.Tool описывает формат, который понимает Claude API:
// { name, description, input_schema }
import Anthropic from '@anthropic-ai/sdk';

// HTTP-клиент для запросов к Google Apps Script API.
// gasClient инкапсулирует URL, таймауты и обработку ошибок.
// Методы: get(action, params) и post(action, body)
import { gasClient } from '../services/gasClient.js';

// ============================================
// Определения tools (инструментов)
// ============================================

/**
 * Массив инструментов для работы с оборудованием.
 *
 * Каждый tool — это объект Anthropic.Tool с полями:
 * - name: уникальное имя (Claude использует его при вызове)
 * - description: описание на русском (Claude читает его, чтобы понять,
 *   когда и зачем вызывать этот tool)
 * - input_schema: JSON Schema параметров (Claude формирует параметры
 *   на основе этой схемы)
 *
 * ВАЖНО: Описания tools написаны на русском, потому что системный
 * промпт и общение с пользователем тоже на русском. Claude лучше
 * понимает контекст, когда язык описаний совпадает.
 *
 * Эти определения передаются в anthropic.messages.create()
 * в параметре `tools`. Claude видит их при КАЖДОМ запросе
 * и решает, какие из них вызвать для ответа на вопрос пользователя.
 */
export const equipmentTools: Anthropic.Tool[] = [

    // ----------------------------------------
    // Tool 1: Поиск / список оборудования
    // ----------------------------------------
    {
        name: 'get_all_equipment',
        description: 'Получить список всего оборудования. Можно фильтровать по типу, статусу или искать по названию.',
        input_schema: {
            // as const — TypeScript hint, чтобы тип был литералом 'object',
            // а не просто string. Требуется для совместимости с Anthropic.Tool
            type: 'object' as const,
            properties: {
                // Поиск по названию (нечёткий поиск)
                // Пример: "ФО-0,8" найдёт "Фильтр ФО-0,8-1,5"
                search: {
                    type: 'string',
                    description: 'Поисковый запрос по названию оборудования',
                },
                // Фильтр по типу оборудования
                // Типы определены в Google Sheets (filter, pump, tank, valve и др.)
                type: {
                    type: 'string',
                    description: 'Тип оборудования (filter, pump, tank, valve и т.д.)',
                },
                // Фильтр по статусу
                // active — работает, inactive — выключено, archived — списано
                status: {
                    type: 'string',
                    enum: ['active', 'inactive', 'archived'],
                    description: 'Статус оборудования',
                },
            },
            // Все параметры опциональны — без фильтров вернётся ВСЁ оборудование
            required: [],
        },
    },

    // ----------------------------------------
    // Tool 2: Детали одного оборудования
    // ----------------------------------------
    {
        name: 'get_equipment_details',
        description: 'Получить детальную информацию об одном оборудовании по его ID. Включает характеристики, даты, ссылки на документацию.',
        input_schema: {
            type: 'object' as const,
            properties: {
                // UUID оборудования из Google Sheets
                // Claude получает этот ID из результатов get_all_equipment
                equipment_id: {
                    type: 'string',
                    description: 'ID оборудования (UUID)',
                },
            },
            // ID обязателен — без него невозможно найти конкретное оборудование
            required: ['equipment_id'],
        },
    },

    // ----------------------------------------
    // Tool 3: Журнал обслуживания
    // ----------------------------------------
    {
        name: 'get_maintenance_log',
        description: 'Получить журнал обслуживания оборудования. Показывает историю всех работ.',
        input_schema: {
            type: 'object' as const,
            properties: {
                // ID оборудования, для которого нужен журнал
                equipment_id: {
                    type: 'string',
                    description: 'ID оборудования',
                },
                // Фильтр по статусу записей в журнале
                // completed — выполнено, planned — запланировано,
                // in_progress — в процессе, cancelled — отменено
                status: {
                    type: 'string',
                    enum: ['completed', 'planned', 'in_progress', 'cancelled'],
                    description: 'Фильтр по статусу записи',
                },
                // Ограничение количества записей (пагинация)
                // По умолчанию GAS возвращает 10 последних записей
                limit: {
                    type: 'number',
                    description: 'Максимальное количество записей (по умолчанию 10)',
                },
                maintenance_sheet_id: {
                    type: 'string',
                    description: 'ID листа журнала обслуживания (из контекста оборудования). Передавай если известен.',
                },
            },
            required: ['equipment_id'],
        },
    },

    // ----------------------------------------
    // Tool 4: Добавление записи в журнал
    // ----------------------------------------
    {
        name: 'add_maintenance_entry',
        // ВАЖНО в описании: Claude должен запросить подтверждение у пользователя
        // ПЕРЕД вызовом этого tool. Это указание в description — Claude его читает
        // и следует ему (это часть "prompt engineering" для tools)
        description: 'Добавить новую запись в журнал обслуживания. ВАЖНО: Перед вызовом этого инструмента покажи пользователю превью записи и запроси подтверждение.',
        input_schema: {
            type: 'object' as const,
            properties: {
                equipment_id: {
                    type: 'string',
                    description: 'ID оборудования',
                },
                // Дата работ в формате ISO (YYYY-MM-DD)
                // Пример: "2025-01-15"
                date: {
                    type: 'string',
                    description: 'Дата в формате YYYY-MM-DD',
                },
                // Категория выполненных работ
                // Свободный текст, но обычно один из стандартных типов
                type: {
                    type: 'string',
                    description: 'Тип работ (Техническое обслуживание, Ремонт, Осмотр, Замена и т.д.)',
                },
                // Подробное описание — что именно было сделано
                description: {
                    type: 'string',
                    description: 'Подробное описание выполненных работ',
                },
                // Кто выполнил работу (ФИО сотрудника)
                performed_by: {
                    type: 'string',
                    description: 'ФИО исполнителя',
                },
                // Статус записи (по умолчанию completed)
                // planned — для планирования будущих работ
                status: {
                    type: 'string',
                    enum: ['completed', 'planned', 'in_progress'],
                    description: 'Статус записи (по умолчанию completed)',
                },
                maintenance_sheet_id: {
                    type: 'string',
                    description: 'ID листа журнала обслуживания (из контекста оборудования). Передавай если известен.',
                },
            },
            // Все поля кроме status и maintenance_sheet_id обязательны
            required: ['equipment_id', 'date', 'type', 'description', 'performed_by'],
        },
    },
];

// ============================================
// Функция выполнения tools
// ============================================

/**
 * Выполняет tool (инструмент) для работы с оборудованием.
 *
 * Вызывается из anthropic.ts в агентном цикле, когда Claude
 * решает использовать один из equipmentTools.
 *
 * Маршрутизация: по имени tool определяет, какой GAS action вызвать
 * и какие параметры передать.
 *
 * @param name - Имя tool (совпадает с name в equipmentTools)
 * @param input - Параметры, которые Claude передал при вызове tool.
 *                Объект с произвольными ключами (Record<string, unknown>),
 *                потому что каждый tool имеет свою схему параметров.
 * @returns Результат от GAS API (JSON-объект с данными)
 * @throws Error если tool с таким именем не найден
 *
 * @example
 * // Claude вызвал tool get_all_equipment с параметром search
 * const result = await executeEquipmentTool(
 *   'get_all_equipment',
 *   { search: 'фильтр' }
 * );
 * // result = { data: [{ id: "abc", name: "Фильтр ФО-0,8-1,5", ... }] }
 */
export async function executeEquipmentTool(
    name: string,
    input: Record<string, unknown>
): Promise<unknown> {
    switch (name) {

        // ----------------------------------------
        // Получить список оборудования
        // ----------------------------------------
        // GAS action: 'getAll'
        // HTTP: GET ?action=getAll&search=...&type=...&status=...
        case 'get_all_equipment':
            return await gasClient.get('getAll', {
                search: input.search as string | undefined,
                type: input.type as string | undefined,
                status: input.status as string | undefined,
            });

        // ----------------------------------------
        // Получить детали одного оборудования
        // ----------------------------------------
        // GAS action: 'getById'
        // HTTP: GET ?action=getById&id=<equipment_id>
        // Возвращает: полный объект оборудования со specs, датами, ссылками
        case 'get_equipment_details':
            return await gasClient.get('getById', {
                id: input.equipment_id as string,
            });

        // ----------------------------------------
        // Получить журнал обслуживания
        // ----------------------------------------
        // GAS action: 'getMaintenanceLog'
        // HTTP: GET ?action=getMaintenanceLog&equipmentId=...&status=...&limit=...
        //
        // Обратите внимание: input.limit — это number, но gasClient.get()
        // ожидает string-параметры (они идут в URL query string).
        // Поэтому преобразуем через String(input.limit)
        case 'get_maintenance_log':
            return await gasClient.get('getMaintenanceLog', {
                equipmentId: input.equipment_id as string,
                status: input.status as string | undefined,
                limit: input.limit ? String(input.limit) : undefined,
                maintenanceSheetId: input.maintenance_sheet_id as string | undefined,
            });

        // ----------------------------------------
        // Добавить запись в журнал обслуживания
        // ----------------------------------------
        // GAS action: 'addMaintenanceEntry'
        // HTTP: POST с JSON body
        //
        // Это единственный tool, который ИЗМЕНЯЕТ данные (POST запрос).
        // Остальные только читают (GET запросы).
        //
        // Маппинг параметров: Claude использует snake_case (performed_by),
        // а GAS API ожидает camelCase (performedBy).
        // Преобразование происходит здесь, в месте вызова.
        case 'add_maintenance_entry':
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            const dateStr = input.date as string;

            if (!dateRegex.test(dateStr)) {
                throw new Error('Неверный формат даты. Используйте YYYY-MM-DD');
            }

            // Проверка будущих дат для выполненных работ
            if ((input.status === 'completed' || !input.status)) {
                const today = new Date().toISOString().split('T')[0];
                if (dateStr > today) {
                    throw new Error('Дата выполненных работ не может быть в будущем');
                }
            }
            return await gasClient.post('addMaintenanceEntry', {
                equipmentId: input.equipment_id,
                date: input.date,
                type: input.type,
                description: input.description,
                performedBy: input.performed_by,
                status: input.status || 'completed',
                maintenanceSheetId: input.maintenance_sheet_id,
            });

        // ----------------------------------------
        // Неизвестный tool
        // ----------------------------------------
        // Если Claude вызвал tool, которого нет в списке —
        // выбрасываем ошибку. Claude получит её как tool_result
        // с is_error: true и сообщит пользователю о проблеме.
        default:
            throw new Error(`Unknown equipment tool: ${name}`);
    }
}
