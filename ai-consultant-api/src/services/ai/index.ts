/**
 * index.ts
 *
 * Основной экспорт для AI сервисов
 */

// Типы
export type { ChatMessage, ChatRequest, ChatResponse, ToolDefinition } from './types.js';

// Интерфейсы и базовые классы
export type { AIProvider } from './AIProvider.js'; // Type-only export для интерфейса
export { BaseAIProvider } from './AIProvider.js';

// Провайдеры
export { ClaudeProvider } from './providers/ClaudeProvider.js';
export { GeminiProvider } from './providers/GeminiProvider.js';

// Фабрика
export { ProviderFactory, type ProviderType } from './ProviderFactory.js';
