/**
 * memoryTools.ts
 *
 * Инструменты агента для управления долговременной памятью (SEC-06).
 *
 * Правила:
 * - preference → всегда personal (только этот пользователь)
 * - tariff/norm/contact/address/fact → shared, писать/удалять может только admin
 * - get_memory → shared + personal текущего пользователя
 */

import Anthropic from '@anthropic-ai/sdk';
import {
    saveSharedFact,
    savePersonalFact,
    loadFactsForUser,
    deactivateFactForUser,
    type MemoryCategory,
} from '../services/ai/agentMemoryService.js';
import { getToolContext } from '../services/ai/toolContext.js';

// ============================================
// Определения инструментов
// ============================================

export const memoryTools: Anthropic.Tool[] = [
    {
        name: 'save_memory',
        description: `Запомнить важный факт для использования в будущих диалогах.

Правила scope (SEC-06):
- category=preference → личная память только этого пользователя.
- tariff/norm/contact/address/fact → общая память; сохранять может только администратор.
Обычный пользователь: сохраняй предпочтения (preference), не пытайся менять общие справочные факты.

Примеры:
- Предпочтение: save_memory(category="preference", key="answer_style", value="Пользователь просит отвечать кратко")
- Тариф (только admin): save_memory(category="tariff", key="water_tariff_2026-03", value="Тариф на воду: 1.82 BYN/м³")`,
        input_schema: {
            type: 'object' as const,
            properties: {
                category: {
                    type: 'string',
                    enum: ['tariff', 'norm', 'contact', 'address', 'fact', 'preference'],
                    description:
                        'Категория: preference=личное; остальные=общее (только admin может писать)',
                },
                key: {
                    type: 'string',
                    description:
                        'Уникальный ключ (snake_case). Для обновления используй тот же key.',
                },
                value: {
                    type: 'string',
                    description: 'Значение факта — полное описательное предложение.',
                },
                context: {
                    type: 'string',
                    description: 'Дополнительный контекст: откуда взято. Необязательно.',
                },
            },
            required: ['category', 'key', 'value'],
        },
    },
    {
        name: 'get_memory',
        description: `Получить сохранённые факты: общие справочные + личные предпочтения текущего пользователя.`,
        input_schema: {
            type: 'object' as const,
            properties: {
                category: {
                    type: 'string',
                    enum: ['tariff', 'norm', 'contact', 'address', 'fact', 'preference'],
                    description: 'Фильтр по категории. Если не указан — все доступные факты.',
                },
            },
            required: [],
        },
    },
    {
        name: 'delete_memory',
        description: `Удалить факт из памяти.
Личный (preference) — может удалить владелец.
Общий справочный — только администратор.`,
        input_schema: {
            type: 'object' as const,
            properties: {
                key: {
                    type: 'string',
                    description: 'Ключ факта для удаления.',
                },
            },
            required: ['key'],
        },
    },
];

// ============================================
// Исполнитель
// ============================================

function requireActor(): { userId: string; isAdmin: boolean } {
    const ctx = getToolContext();
    const userId = ctx?.userId ?? '';
    if (!userId) {
        throw new Error('Нет контекста пользователя для работы с памятью');
    }
    return {
        userId,
        isAdmin: ctx?.appAccess?.isAdmin === true,
    };
}

export async function executeMemoryTool(
    name: string,
    input: Record<string, unknown>,
): Promise<unknown> {
    switch (name) {
        case 'save_memory': {
            const actor = requireActor();
            const category = input.category as MemoryCategory;
            const key = input.key as string;
            const value = input.value as string;
            const context = input.context as string | undefined;

            if (category === 'preference') {
                await savePersonalFact(actor.userId, category, key, value, context);
                return {
                    success: true,
                    scope: 'personal',
                    message: `Запомнил лично для вас: ${value}`,
                };
            }

            if (!actor.isAdmin) {
                return {
                    success: false,
                    message:
                        'Общую память (тарифы, контакты, нормы, факты) может менять только администратор. Сохраните личное предпочтение с category=preference.',
                };
            }

            await saveSharedFact(category, key, value, context, actor.userId);
            return {
                success: true,
                scope: 'shared',
                message: `Запомнил в общую память: [${category}] ${value}`,
            };
        }

        case 'get_memory': {
            const actor = requireActor();
            const category = input.category as MemoryCategory | undefined;
            const facts = await loadFactsForUser(actor.userId, category);

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
                facts: facts.map((f) => ({
                    scope: f.scope ?? 'shared',
                    category: f.category,
                    key: f.key,
                    value: f.value,
                    context: f.context,
                    updated_at: f.updated_at,
                })),
            };
        }

        case 'delete_memory': {
            const actor = requireActor();
            const key = input.key as string;
            await deactivateFactForUser(key, actor);
            return {
                success: true,
                message: `Факт "${key}" удалён из памяти`,
            };
        }

        default:
            throw new Error(`Unknown memory tool: ${name}`);
    }
}
