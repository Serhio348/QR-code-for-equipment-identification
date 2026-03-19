/**
 * agentMemoryService.ts
 *
 * Долговременная память AI-агента.
 *
 * В отличие от chatMemoryService (история диалогов),
 * этот сервис хранит ФАКТЫ — конкретные знания об объекте,
 * которые агент накапливает из диалогов и источников данных.
 *
 * Примеры фактов:
 *   - Тариф на воду с марта 2026: 1.82 BYN/м³
 *   - Контакт в водоканале: Иван Иванович, тел. +375 29 123-45-67
 *   - Норма суточного потребления воды: 45 м³
 *   - Артскважина: только канализация, адрес Советская 1
 *
 * Как используется:
 *   1. Агент вызывает save_memory когда узнаёт важный факт
 *   2. При каждом запросе все активные факты загружаются
 *      и добавляются в системный промпт автоматически
 *   3. Агент "помнит" факты во всех будущих диалогах
 *      без повторного обучения
 *
 * Категории фактов:
 *   tariff     — тарифы (вода, канализация, электричество)
 *   norm       — нормы потребления, качества воды
 *   contact    — контакты (водоканал, поставщики, ответственные)
 *   address    — адреса и точки подключения
 *   fact       — общие факты об объекте
 *   preference — предпочтения пользователя (формат ответов, язык, детали)
 */

import { createClient } from '@supabase/supabase-js';
import { config } from '../config/env.js';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

// ============================================
// Типы
// ============================================

export type MemoryCategory = 'tariff' | 'norm' | 'contact' | 'address' | 'fact' | 'preference';

export interface MemoryFact {
    id?: string;
    category: MemoryCategory;
    key: string;       // уникальный ключ, например 'water_tariff_2026-03'
    value: string;     // значение факта
    context?: string;  // откуда взято / дополнительный контекст
    is_active?: boolean;
    created_at?: string;
    updated_at?: string;
}

// ============================================
// Сохранение факта
// ============================================

/**
 * Сохранить или обновить факт в памяти агента.
 * Если факт с таким key уже существует — обновляем value и context.
 */
export async function saveFact(
    category: MemoryCategory,
    key: string,
    value: string,
    context?: string
): Promise<void> {
    const { error } = await supabase
        .from('agent_memory')
        .upsert({
            category,
            key,
            value,
            context: context ?? null,
            is_active: true,
        }, { onConflict: 'key' });

    if (error) {
        throw new Error(`Ошибка сохранения факта: ${error.message}`);
    }
}

// ============================================
// Загрузка фактов
// ============================================

/**
 * Загрузить все активные факты из памяти.
 * Вызывается при каждом запросе к агенту.
 */
export async function loadFacts(category?: MemoryCategory): Promise<MemoryFact[]> {
    let query = supabase
        .from('agent_memory')
        .select('id, category, key, value, context, updated_at')
        .eq('is_active', true)
        .order('category')
        .order('updated_at', { ascending: false });

    if (category) {
        query = query.eq('category', category);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Ошибка загрузки памяти агента:', error.message);
        return [];
    }

    return data ?? [];
}

// ============================================
// Удаление / деактивация факта
// ============================================

/**
 * Деактивировать устаревший факт (не удаляем — только помечаем).
 */
export async function deactivateFact(key: string): Promise<void> {
    const { error } = await supabase
        .from('agent_memory')
        .update({ is_active: false })
        .eq('key', key);

    if (error) {
        throw new Error(`Ошибка деактивации факта: ${error.message}`);
    }
}

// ============================================
// Форматирование для системного промпта
// ============================================

const CATEGORY_LABELS: Record<MemoryCategory, string> = {
    tariff:     'Тарифы',
    norm:       'Нормы потребления',
    contact:    'Контакты',
    address:    'Адреса и точки подключения',
    fact:       'Факты об объекте',
    preference: 'Предпочтения',
};

/**
 * Форматировать факты в строку для вставки в системный промпт.
 * Группирует по категориям.
 *
 * Пример вывода:
 *   ## Что агент знает из прошлых диалогов:
 *   ### Тарифы
 *   - Тариф на воду (март 2026+): 1.82 BYN/м³
 *   - Тариф канализация (март 2026+): 2.1034 BYN/м³
 *   ### Контакты
 *   - Диспетчер водоканала: +375 162 21-30-10
 */
export function formatFactsForPrompt(facts: MemoryFact[]): string {
    if (facts.length === 0) return '';

    // Группируем по категории
    const grouped = new Map<MemoryCategory, MemoryFact[]>();
    for (const fact of facts) {
        const list = grouped.get(fact.category) ?? [];
        list.push(fact);
        grouped.set(fact.category, list);
    }

    const lines: string[] = ['\n\n## Справочные факты из памяти (только если релевантны текущему вопросу):'];

    for (const [category, items] of grouped) {
        lines.push(`### ${CATEGORY_LABELS[category] ?? category}`);
        for (const item of items) {
            const ctx = item.context ? ` (${item.context})` : '';
            lines.push(`- ${item.value}${ctx}`);
        }
    }

    lines.push(
        '\nПравила использования памяти:' +
        '\n- Используй факты ТОЛЬКО если они напрямую относятся к текущему вопросу.' +
        '\n- Если пользователь сменил тему и факты не подходят — игнорируй их и отвечай по текущей теме.' +
        '\n- Если факт выглядит устаревшим или противоречит пользователю — уточни и при необходимости обнови через save_memory / delete_memory.'
    );

    return lines.join('\n');
}

/**
 * Загрузить факты и вернуть готовую строку для промпта.
 * Удобная обёртка для использования в chat.ts
 */
export async function loadFactsForPrompt(): Promise<string> {
    const facts = await loadFacts();
    return formatFactsForPrompt(facts);
}

// ============================================
// Автообновление тарифов из счётов
// ============================================

/**
 * Обновить тарифы в памяти агента из данных счёта.
 *
 * Вызывается автоматически при сохранении нового счёта —
 * агент всегда знает актуальные тарифы без ручного обновления.
 *
 * Обновляет только если новый период >= ранее сохранённого
 * (защита от перезаписи актуального тарифа старым счётом).
 *
 * @param parsed - Данные из парсера счёта
 */
export async function updateTariffFromInvoice(parsed: {
    period: string;
    tariff_per_m3?: number;
    sewage_tariff_per_m3?: number;
    account_number?: string;
}): Promise<void> {
    const { period, tariff_per_m3, sewage_tariff_per_m3, account_number } = parsed;

    // Проверяем текущий тариф в памяти — не перезаписываем более новым старым
    const current = await loadFacts('tariff');
    const waterFact = current.find(f => f.key === 'tariff_water');

    // Если в памяти уже есть тариф за более поздний период — пропускаем
    if (waterFact?.context) {
        const match = waterFact.context.match(/из счёта (\d{4}-\d{2})/);
        if (match && match[1] > period) {
            return;
        }
    }

    const ctx = `из счёта ${period}${account_number ? `, сч. ${account_number}` : ''}`;

    if (tariff_per_m3 != null) {
        await saveFact('tariff', 'tariff_water', `${tariff_per_m3} BYN/м³`, ctx);
    }
    if (sewage_tariff_per_m3 != null) {
        await saveFact('tariff', 'tariff_sewage', `${sewage_tariff_per_m3} BYN/м³`, ctx);
    }
}