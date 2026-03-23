/**
 * memoryTools.ts
 *
 * Инструменты агента для управления долговременной памятью.
 *
 * Агент вызывает эти инструменты когда:
 *   - Узнаёт новый важный факт (тариф, контакт, норму)
 *   - Нужно уточнить что он знает по теме
 *   - Старый факт устарел и нужно его обновить/удалить
 *
 * Инструменты:
 *   save_memory   — запомнить факт (создать или обновить)
 *   get_memory    — вспомнить факты по категории или поиску
 *   delete_memory — забыть устаревший факт
 */

import Anthropic from '@anthropic-ai/sdk';
import { saveFact, loadFacts, deactivateFact, type MemoryCategory } from '../services/ai/agentMemoryService.js';

// ============================================
// Определения инструментов
// ============================================

export const memoryTools: Anthropic.Tool[] = [

    // ----------------------------------------
    // Tool 1: Запомнить факт
    // ----------------------------------------
    {
        name: 'save_memory',
        description: `Запомнить важный факт для использования в будущих диалогах.
Вызывай когда узнаёшь: новый тариф, контакт, норму, адрес, или важный факт об объекте.
Также используй для обновления устаревших фактов — просто сохрани с тем же key и новым value.

Примеры когда вызывать:
- Пользователь сообщает новый тариф: save_memory(category="tariff", key="water_tariff_2026-03", value="Тариф на воду с марта 2026: 1.82 BYN/м³")
- Пользователь даёт контакт: save_memory(category="contact", key="vodokanal_dispatcher", value="Диспетчер водоканала: +375 162 21-30-10")
- Выясняется норма: save_memory(category="norm", key="daily_water_norm", value="Норма суточного потребления: 45 м³")`,
        input_schema: {
            type: 'object' as const,
            properties: {
                category: {
                    type: 'string',
                    enum: ['tariff', 'norm', 'contact', 'address', 'fact', 'preference'],
                    description: 'Категория факта: tariff=тарифы, norm=нормы, contact=контакты, address=адреса/точки подключения, fact=общие факты, preference=предпочтения',
                },
                key: {
                    type: 'string',
                    description: 'Уникальный ключ факта (snake_case). Примеры: water_tariff_2026-03, vodokanal_contact, daily_water_norm. Для обновления используй тот же key.',
                },
                value: {
                    type: 'string',
                    description: 'Значение факта — полное описательное предложение. Например: "Тариф на воду с марта 2026: 1.82 BYN/м³ (решение облисполкома №138)"',
                },
                context: {
                    type: 'string',
                    description: 'Дополнительный контекст: откуда взято, дата, документ. Необязательно.',
                },
            },
            required: ['category', 'key', 'value'],
        },
    },

    // ----------------------------------------
    // Tool 2: Вспомнить факты
    // ----------------------------------------
    {
        name: 'get_memory',
        description: `Получить сохранённые факты из памяти.
Используй когда нужно вспомнить конкретные данные: тарифы, контакты, нормы.
Можно фильтровать по категории или получить все факты сразу.`,
        input_schema: {
            type: 'object' as const,
            properties: {
                category: {
                    type: 'string',
                    enum: ['tariff', 'norm', 'contact', 'address', 'fact', 'preference'],
                    description: 'Фильтр по категории. Если не указан — вернёт все факты.',
                },
            },
            required: [],
        },
    },

    // ----------------------------------------
    // Tool 3: Удалить устаревший факт
    // ----------------------------------------
    {
        name: 'delete_memory',
        description: `Удалить устаревший или неверный факт из памяти.
Используй когда пользователь говорит что старый факт устарел или был ошибочным.
После удаления сохрани новый актуальный факт через save_memory.`,
        input_schema: {
            type: 'object' as const,
            properties: {
                key: {
                    type: 'string',
                    description: 'Ключ факта который нужно удалить (тот же key что использовался при save_memory).',
                },
            },
            required: ['key'],
        },
    },
];

// ============================================
// Исполнитель инструментов
// ============================================

export async function executeMemoryTool(
    name: string,
    input: Record<string, unknown>
): Promise<unknown> {
    switch (name) {

        case 'save_memory': {
            const category = input.category as MemoryCategory;
            const key = input.key as string;
            const value = input.value as string;
            const context = input.context as string | undefined;

            await saveFact(category, key, value, context);

            return {
                success: true,
                message: `Запомнил: [${category}] ${value}`,
            };
        }

        case 'get_memory': {
            const category = input.category as MemoryCategory | undefined;
            const facts = await loadFacts(category);

            if (facts.length === 0) {
                return {
                    found: false,
                    message: category
                        ? `Нет сохранённых фактов в категории "${category}"`
                        : 'Память пуста — нет сохранённых фактов',
                };
            }

            return {
                found: true,
                count: facts.length,
                facts: facts.map(f => ({
                    category: f.category,
                    key: f.key,
                    value: f.value,
                    context: f.context,
                    updated_at: f.updated_at,
                })),
            };
        }

        case 'delete_memory': {
            const key = input.key as string;
            await deactivateFact(key);

            return {
                success: true,
                message: `Факт "${key}" удалён из памяти`,
            };
        }

        default:
            throw new Error(`Unknown memory tool: ${name}`);
    }
}