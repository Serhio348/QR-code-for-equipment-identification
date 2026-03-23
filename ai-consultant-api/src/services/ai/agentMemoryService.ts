/**
 * agentMemoryService.ts
 *
 * Долговременная память AI-агента.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from '../../config/env.js';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

export type MemoryCategory = 'tariff' | 'norm' | 'contact' | 'address' | 'fact' | 'preference';

export interface MemoryFact {
    id?: string;
    category: MemoryCategory;
    key: string;
    value: string;
    context?: string;
    is_active?: boolean;
    created_at?: string;
    updated_at?: string;
}

export async function saveFact(
    category: MemoryCategory,
    key: string,
    value: string,
    context?: string
): Promise<void> {
    const { error } = await supabase
        .from('agent_memory')
        .upsert({ category, key, value, context: context ?? null, is_active: true }, { onConflict: 'key' });
    if (error) throw new Error(`Ошибка сохранения факта: ${error.message}`);
}

export async function loadFacts(category?: MemoryCategory): Promise<MemoryFact[]> {
    let query = supabase
        .from('agent_memory')
        .select('id, category, key, value, context, updated_at')
        .eq('is_active', true)
        .order('category')
        .order('updated_at', { ascending: false });
    if (category) query = query.eq('category', category);
    const { data, error } = await query;
    if (error) return [];
    return data ?? [];
}

export async function deactivateFact(key: string): Promise<void> {
    const { error } = await supabase.from('agent_memory').update({ is_active: false }).eq('key', key);
    if (error) throw new Error(`Ошибка деактивации факта: ${error.message}`);
}

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
    const grouped = new Map<MemoryCategory, MemoryFact[]>();
    for (const fact of facts) {
        const list = grouped.get(fact.category) ?? [];
        list.push(fact);
        grouped.set(fact.category, list);
    }
    const lines: string[] = ['\n\n## Что агент знает из прошлых диалогов:'];
    for (const [category, items] of grouped) {
        lines.push(`### ${CATEGORY_LABELS[category] ?? category}`);
        for (const item of items) {
            const ctx = item.context ? ` (${item.context})` : '';
            lines.push(`- ${item.value}${ctx}`);
        }
    }
    lines.push('\nИспользуй эти факты при ответах. Если факт устарел - обнови его через save_memory.');
    return lines.join('\n');
}

export async function loadFactsForPrompt(): Promise<string> {
    const facts = await loadFacts();
    return formatFactsForPrompt(facts);
}

export async function updateTariffFromInvoice(parsed: {
    period: string;
    tariff_per_m3?: number;
    sewage_tariff_per_m3?: number;
    account_number?: string;
}): Promise<void> {
    const { period, tariff_per_m3, sewage_tariff_per_m3, account_number } = parsed;
    const current = await loadFacts('tariff');
    const waterFact = current.find(f => f.key === 'tariff_water');
    if (waterFact?.context) {
        const match = waterFact.context.match(/из счёта (\d{4}-\d{2})/);
        if (match && match[1] > period) return;
    }
    const ctx = `из счёта ${period}${account_number ? `, сч. ${account_number}` : ''}`;
    if (tariff_per_m3 != null) await saveFact('tariff', 'tariff_water', `${tariff_per_m3} BYN/м³`, ctx);
    if (sewage_tariff_per_m3 != null) await saveFact('tariff', 'tariff_sewage', `${sewage_tariff_per_m3} BYN/м³`, ctx);
}
