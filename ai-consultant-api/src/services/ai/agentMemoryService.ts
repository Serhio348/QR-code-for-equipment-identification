/**
 * agentMemoryService.ts
 *
 * Долговременная память AI-агента (SEC-06: shared + personal).
 *
 * Структура / что умеет:
 * 1. saveSharedFact / savePersonalFact — запись с учётом scope
 * 2. loadFactsForUser — shared + personal текущего пользователя
 * 3. deactivateFactForUser — удаление с проверкой прав
 * 4. loadFactsForPrompt — блок для системного промпта
 * 5. updateTariffFromInvoice — системная запись shared-тарифов
 */

import { createClient } from '@supabase/supabase-js';
import { config } from '../../config/env.js';
import { tariffMemoryKey } from '../water/invoiceComparison.js';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

// ============================================
// Типы
// ============================================

export type MemoryCategory = 'tariff' | 'norm' | 'contact' | 'address' | 'fact' | 'preference';
export type MemoryScope = 'shared' | 'personal';

export interface MemoryFact {
    id?: string;
    category: MemoryCategory;
    key: string;
    value: string;
    context?: string;
    scope?: MemoryScope;
    user_id?: string | null;
    is_active?: boolean;
    created_at?: string;
    updated_at?: string;
}

export interface MemoryActor {
    userId: string;
    isAdmin: boolean;
}

// ============================================
// Запись
// ============================================

/**
 * Сохранить общий факт (тарифы, контакты и т.п.).
 * Вызывается доверенным backend или админом через tools.
 */
export async function saveSharedFact(
    category: MemoryCategory,
    key: string,
    value: string,
    context?: string,
    createdBy?: string,
): Promise<void> {
    const { data: existing, error: findError } = await supabase
        .from('agent_memory')
        .select('id')
        .eq('scope', 'shared')
        .eq('key', key)
        .maybeSingle();

    if (findError) {
        throw new Error(`Ошибка поиска факта: ${findError.message}`);
    }

    if (existing?.id) {
        const { error } = await supabase
            .from('agent_memory')
            .update({
                category,
                value,
                context: context ?? null,
                is_active: true,
                created_by: createdBy ?? null,
            })
            .eq('id', existing.id);
        if (error) throw new Error(`Ошибка обновления факта: ${error.message}`);
        return;
    }

    const { error } = await supabase.from('agent_memory').insert({
        scope: 'shared',
        user_id: null,
        category,
        key,
        value,
        context: context ?? null,
        is_active: true,
        created_by: createdBy ?? null,
    });
    if (error) throw new Error(`Ошибка сохранения факта: ${error.message}`);
}

/**
 * Сохранить личный факт пользователя (обычно preference).
 */
export async function savePersonalFact(
    userId: string,
    category: MemoryCategory,
    key: string,
    value: string,
    context?: string,
): Promise<void> {
    if (!userId) {
        throw new Error('Для личной памяти нужен userId');
    }

    const { data: existing, error: findError } = await supabase
        .from('agent_memory')
        .select('id')
        .eq('scope', 'personal')
        .eq('user_id', userId)
        .eq('key', key)
        .maybeSingle();

    if (findError) {
        throw new Error(`Ошибка поиска факта: ${findError.message}`);
    }

    if (existing?.id) {
        const { error } = await supabase
            .from('agent_memory')
            .update({
                category,
                value,
                context: context ?? null,
                is_active: true,
                created_by: userId,
            })
            .eq('id', existing.id);
        if (error) throw new Error(`Ошибка обновления факта: ${error.message}`);
        return;
    }

    const { error } = await supabase.from('agent_memory').insert({
        scope: 'personal',
        user_id: userId,
        category,
        key,
        value,
        context: context ?? null,
        is_active: true,
        created_by: userId,
    });
    if (error) throw new Error(`Ошибка сохранения факта: ${error.message}`);
}

/**
 * @deprecated Используйте saveSharedFact / savePersonalFact.
 * Оставлено для совместимости: пишет в shared.
 */
export async function saveFact(
    category: MemoryCategory,
    key: string,
    value: string,
    context?: string,
): Promise<void> {
    await saveSharedFact(category, key, value, context);
}

// ============================================
// Чтение
// ============================================

/**
 * Shared + personal факты для пользователя (активные).
 */
export async function loadFactsForUser(
    userId: string,
    category?: MemoryCategory,
): Promise<MemoryFact[]> {
    const selectCols = 'id, category, key, value, context, scope, user_id, updated_at';

    let sharedQuery = supabase
        .from('agent_memory')
        .select(selectCols)
        .eq('is_active', true)
        .eq('scope', 'shared');

    let personalQuery = supabase
        .from('agent_memory')
        .select(selectCols)
        .eq('is_active', true)
        .eq('scope', 'personal')
        .eq('user_id', userId);

    if (category) {
        sharedQuery = sharedQuery.eq('category', category);
        personalQuery = personalQuery.eq('category', category);
    }

    const [sharedRes, personalRes] = await Promise.all([sharedQuery, personalQuery]);

    if (sharedRes.error) {
        console.error('[agentMemory] load shared:', sharedRes.error.message);
    }
    if (personalRes.error) {
        console.error('[agentMemory] load personal:', personalRes.error.message);
    }

    const merged = [
        ...((sharedRes.data ?? []) as MemoryFact[]),
        ...((personalRes.data ?? []) as MemoryFact[]),
    ];

    merged.sort((a, b) => {
        if (a.category !== b.category) {
            return a.category.localeCompare(b.category);
        }
        return String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? ''));
    });

    return merged;
}

/**
 * @deprecated Без userId возвращает только shared (безопасный дефолт).
 */
export async function loadFacts(category?: MemoryCategory): Promise<MemoryFact[]> {
    let query = supabase
        .from('agent_memory')
        .select('id, category, key, value, context, scope, user_id, updated_at')
        .eq('is_active', true)
        .eq('scope', 'shared')
        .order('category')
        .order('updated_at', { ascending: false });

    if (category) {
        query = query.eq('category', category);
    }

    const { data, error } = await query;
    if (error) return [];
    return (data ?? []) as MemoryFact[];
}

// ============================================
// Удаление
// ============================================

/**
 * Деактивировать факт с проверкой прав актора.
 */
export async function deactivateFactForUser(
    key: string,
    actor: MemoryActor,
): Promise<void> {
    const { data: rows, error: findError } = await supabase
        .from('agent_memory')
        .select('id, scope, user_id')
        .eq('key', key)
        .eq('is_active', true);

    if (findError) {
        throw new Error(`Ошибка поиска факта: ${findError.message}`);
    }

    const candidates = (rows ?? []).filter((row) => {
        if (row.scope === 'shared') {
            return actor.isAdmin;
        }
        return row.user_id === actor.userId;
    });

    if (candidates.length === 0) {
        throw new Error(
            actor.isAdmin
                ? `Активный факт "${key}" не найден`
                : `Нет права удалить факт "${key}" или он не найден`,
        );
    }

    const ids = candidates.map((r) => r.id);
    const { error } = await supabase
        .from('agent_memory')
        .update({ is_active: false })
        .in('id', ids);

    if (error) throw new Error(`Ошибка деактивации факта: ${error.message}`);
}

/**
 * @deprecated Без проверки прав — только для внутренних вызовов.
 */
export async function deactivateFact(key: string): Promise<void> {
    const { error } = await supabase
        .from('agent_memory')
        .update({ is_active: false })
        .eq('key', key)
        .eq('scope', 'shared');
    if (error) throw new Error(`Ошибка деактивации факта: ${error.message}`);
}

// ============================================
// Промпт
// ============================================

const CATEGORY_LABELS: Record<MemoryCategory, string> = {
    tariff: 'Тарифы',
    norm: 'Нормы потребления',
    contact: 'Контакты',
    address: 'Адреса и точки подключения',
    fact: 'Факты об объекте',
    preference: 'Предпочтения',
};

export function formatFactsForPrompt(facts: MemoryFact[]): string {
    if (facts.length === 0) return '';

    const shared = facts.filter((f) => f.scope !== 'personal');
    const personal = facts.filter((f) => f.scope === 'personal');

    const lines: string[] = ['\n\n## Что агент знает из прошлых диалогов:'];

    const appendGroup = (title: string, items: MemoryFact[]): void => {
        if (items.length === 0) return;
        lines.push(`### ${title}`);
        const grouped = new Map<MemoryCategory, MemoryFact[]>();
        for (const fact of items) {
            const list = grouped.get(fact.category) ?? [];
            list.push(fact);
            grouped.set(fact.category, list);
        }
        for (const [category, catItems] of grouped) {
            lines.push(`#### ${CATEGORY_LABELS[category] ?? category}`);
            for (const item of catItems) {
                const ctx = item.context ? ` (${item.context})` : '';
                lines.push(`- ${item.value}${ctx}`);
            }
        }
    };

    appendGroup('Общие справочные факты (видны всем)', shared);
    appendGroup('Личные предпочтения этого пользователя', personal);

    lines.push(
        '\nИспользуй эти факты при ответах. Общие факты обновляй только если пользователь — администратор; личные предпочтения — через save_memory с category=preference.',
    );
    return lines.join('\n');
}

export async function loadFactsForPrompt(userId?: string): Promise<string> {
    const facts = userId ? await loadFactsForUser(userId) : await loadFacts();
    return formatFactsForPrompt(facts);
}

// ============================================
// Системные обновления
// ============================================

export async function updateTariffFromInvoice(parsed: {
    period: string;
    tariff_per_m3?: number;
    sewage_tariff_per_m3?: number;
    account_number?: string;
}): Promise<void> {
    const { period, tariff_per_m3, sewage_tariff_per_m3, account_number } = parsed;
    if (!account_number?.trim()) return;
    const account = account_number.trim();
    const current = await loadFacts('tariff');
    const ctx = `из счёта ${period}, сч. ${account}`;
    if (tariff_per_m3 != null) {
        const waterKey = tariffMemoryKey('water', account);
        const waterFact = current.find((fact) => fact.key === waterKey);
        if (!storedPeriodIsNewer(waterFact?.context, period)) {
            await saveSharedFact('tariff', waterKey, `${tariff_per_m3} BYN/м³`, ctx);
        }
    }
    if (sewage_tariff_per_m3 != null) {
        const sewageKey = tariffMemoryKey('sewage', account);
        const sewageFact = current.find((fact) => fact.key === sewageKey);
        if (!storedPeriodIsNewer(sewageFact?.context, period)) {
            await saveSharedFact('tariff', sewageKey, `${sewage_tariff_per_m3} BYN/м³`, ctx);
        }
    }
}

function storedPeriodIsNewer(context: string | undefined, period: string): boolean {
    const match = context?.match(/из счёта (\d{4}-\d{2})/);
    return Boolean(match && match[1] > period);
}
