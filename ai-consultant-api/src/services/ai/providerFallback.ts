/**
 * providerFallback.ts
 *
 * Запасной провайдер, если выбранный ответил 401, 403, 429 или 5xx.
 *
 * Структура / что умеет:
 * 1. isProviderFallbackError — эти статусы можно отдать другому провайдеру
 * 2. createFallbackProviders — порядок: предпочитаемый, затем остальные с ключом
 * 3. runWithProviderFallback — один проход по списку
 *
 * Ограничение: после первого текстового фрагмента или старта инструмента
 * переключение уже нельзя. Клиент получил часть ответа, а повтор инструмента
 * записал бы данные второй раз. Проверка isAvailable ключ не тратит.
 */

import { config } from '../../config/env.js';
import type { AIProvider } from './AIProvider.js';
import { ProviderFactory, type ProviderType } from './ProviderFactory.js';

const PROVIDER_ORDER: ProviderType[] = ['claude', 'gemini', 'deepseek'];

export function isProviderFallbackError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;
    const status = (error as { status?: unknown }).status;
    if (typeof status !== 'number') return false;
    if (status === 401 || status === 403 || status === 429) return true;
    return status >= 500 && status <= 599;
}

function credentials(type: ProviderType): { apiKey: string; model?: string } {
    switch (type) {
        case 'claude':
            return { apiKey: config.anthropicApiKey, model: config.claudeModel };
        case 'gemini':
            return { apiKey: config.geminiApiKey, model: config.geminiModel };
        case 'deepseek':
            return { apiKey: config.deepseekApiKey, model: config.deepseekModel };
        default:
            return { apiKey: '' };
    }
}

/**
 * Провайдеры, у которых задан ключ. Предпочитаемый идёт первым.
 */
export function createFallbackProviders(preferredType?: ProviderType): AIProvider[] {
    const available = new Set(ProviderFactory.getAvailableProviders());
    const preferred = preferredType ?? (config.aiProvider as ProviderType);
    const ordered = [
        ...(available.has(preferred) ? [preferred] : []),
        ...PROVIDER_ORDER.filter(type => type !== preferred && available.has(type)),
    ];
    return ordered.map(type => {
        const { apiKey, model } = credentials(type);
        return ProviderFactory.createDirect(type, apiKey, model);
    });
}

/**
 * Пробует провайдеров по порядку.
 * markOutputStarted вызывают при первом токене или перед инструментом.
 * После этого ошибка уходит клиенту, даже если статус подходит для запасного.
 */
export async function runWithProviderFallback<TProvider extends { readonly name: string }, T>(
    providers: readonly TProvider[],
    run: (provider: TProvider, markOutputStarted: () => void) => Promise<T>,
): Promise<T> {
    if (providers.length === 0) {
        throw new Error(
            'No AI providers available. Please configure at least one API key (ANTHROPIC_API_KEY, GEMINI_API_KEY or DEEPSEEK_API_KEY)',
        );
    }

    let lastError: unknown;
    for (const provider of providers) {
        let outputStarted = false;
        try {
            return await run(provider, () => {
                outputStarted = true;
            });
        } catch (error) {
            if (outputStarted || !isProviderFallbackError(error)) throw error;
            console.error(`[ProviderFallback] ${provider.name} failed before output:`, error);
            lastError = error;
        }
    }

    throw lastError instanceof Error ? lastError : new Error('No AI providers are available');
}
