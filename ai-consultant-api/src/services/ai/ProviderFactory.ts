/**
 * ProviderFactory.ts
 *
 * Фабрика для создания AI провайдеров.
 * Реализует выбор провайдера на основе конфигурации и fallback логику.
 */

import { AIProvider } from './AIProvider.js';
import { ClaudeProvider } from './providers/ClaudeProvider.js';
import { GeminiProvider } from './providers/GeminiProvider.js';
import { config } from '../../config/env.js';

export type ProviderType = 'claude' | 'gemini' | 'openai';

/**
 * Интерфейс конфигурации провайдера
 */
interface ProviderConfig {
  type: ProviderType;
  apiKey: string;
  model?: string;
}

/**
 * Фабрика для создания AI провайдеров
 */
export class ProviderFactory {
  /**
   * Создаёт провайдер на основе типа и конфигурации
   */
  private static createProvider(config: ProviderConfig): AIProvider {
    switch (config.type) {
      case 'claude':
        return new ClaudeProvider(config.apiKey, config.model);

      case 'gemini':
        return new GeminiProvider(config.apiKey, config.model);

      case 'openai':
        throw new Error('OpenAI provider not implemented yet');

      default:
        throw new Error(`Unknown provider type: ${config.type}`);
    }
  }

  /**
   * Получить список доступных провайдеров (с API ключами)
   */
  static getAvailableProviders(): ProviderType[] {
    const available: ProviderType[] = [];

    if (config.anthropicApiKey) {
      available.push('claude');
    }

    if (config.geminiApiKey) {
      available.push('gemini');
    }

    return available;
  }

  /**
   * Создать провайдер с fallback логикой.
   *
   * Пытается создать провайдер в следующем порядке:
   * 1. Провайдер из конфигурации (AI_PROVIDER)
   * 2. Первый доступный провайдер (есть API ключ)
   * 3. Выбрасывает ошибку, если нет доступных провайдеров
   *
   * @param preferredType - Предпочитаемый тип провайдера (из конфигурации или явно указанный)
   * @returns Созданный AI провайдер
   */
  static async create(preferredType?: ProviderType): Promise<AIProvider> {
    const targetType = preferredType || (config.aiProvider as ProviderType);

    // Получаем список доступных провайдеров
    const available = this.getAvailableProviders();

    if (available.length === 0) {
      throw new Error(
        'No AI providers available. Please configure at least one API key (ANTHROPIC_API_KEY or GEMINI_API_KEY)'
      );
    }

    // Пытаемся создать предпочитаемый провайдер
    if (available.includes(targetType)) {
      try {
        const provider = this.createProviderByType(targetType);

        // Проверяем доступность провайдера
        const isAvailable = await provider.isAvailable();

        if (isAvailable) {
          console.log(`[ProviderFactory] Using ${targetType} provider`);
          return provider;
        } else {
          console.warn(`[ProviderFactory] ${targetType} provider is not available, trying fallback...`);
        }
      } catch (error) {
        console.error(`[ProviderFactory] Failed to create ${targetType} provider:`, error);
      }
    } else {
      console.warn(
        `[ProviderFactory] Preferred provider ${targetType} is not configured, using fallback...`
      );
    }

    // Fallback: пробуем создать первый доступный провайдер
    for (const providerType of available) {
      if (providerType === targetType) continue; // Уже пробовали выше

      try {
        const provider = this.createProviderByType(providerType);

        const isAvailable = await provider.isAvailable();

        if (isAvailable) {
          console.log(`[ProviderFactory] Fallback to ${providerType} provider`);
          return provider;
        }
      } catch (error) {
        console.error(`[ProviderFactory] Failed to create ${providerType} provider:`, error);
      }
    }

    // Если ни один провайдер не доступен
    throw new Error(
      `No AI providers are available. Tried: ${available.join(', ')}. Please check your API keys and internet connection.`
    );
  }

  /**
   * Создать провайдер по типу (без проверки доступности)
   */
  private static createProviderByType(type: ProviderType): AIProvider {
    switch (type) {
      case 'claude':
        return this.createProvider({
          type: 'claude',
          apiKey: config.anthropicApiKey,
          model: config.claudeModel,
        });

      case 'gemini':
        return this.createProvider({
          type: 'gemini',
          apiKey: config.geminiApiKey,
          model: config.geminiModel,
        });

      case 'openai':
        throw new Error('OpenAI provider not implemented yet');

      default:
        throw new Error(`Unknown provider type: ${type}`);
    }
  }

  /**
   * Создать конкретный провайдер без fallback (для тестирования)
   */
  static createDirect(type: ProviderType, apiKey: string, model?: string): AIProvider {
    return this.createProvider({ type, apiKey, model });
  }
}
