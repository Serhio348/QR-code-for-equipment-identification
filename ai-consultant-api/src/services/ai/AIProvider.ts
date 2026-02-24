import {
  ChatMessage,
  ChatResponse,
  ToolDefinition,
  EquipmentContext,
  WaterDashboardContext,
} from './types.js';

/**
 * Базовый интерфейс для всех AI провайдеров.
 *
 * Каждый провайдер (Claude, Gemini, OpenAI) должен реализовать этот интерфейс.
 */
export interface AIProvider {
  /**
   * Имя провайдера для логирования
   */
  readonly name: string;

  /**
   * Основной метод для обработки чата.
   * Реализует агентный цикл (agentic loop) с tool calling.
   *
   * @param messages - История сообщений
   * @param tools - Доступные инструменты
   * @param userId - ID пользователя (для логирования)
   * @param equipmentContext - Контекст оборудования (для поиска в конкретной папке)
   * @returns Ответ от AI
   */
  chat(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    userId: string,
    equipmentContext?: EquipmentContext,
    waterContext?: WaterDashboardContext
  ): Promise<ChatResponse>;

  /**
   * Проверка доступности провайдера
   * (есть ли API ключ, доступен ли API endpoint)
   */
  isAvailable(): Promise<boolean>;
}

/**
 * Абстрактный базовый класс с общей логикой.
 * Упрощает реализацию конкретных провайдеров.
 */
export abstract class BaseAIProvider implements AIProvider {
  abstract readonly name: string;

  abstract chat(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    userId: string,
    equipmentContext?: EquipmentContext
  ): Promise<ChatResponse>;

  async isAvailable(): Promise<boolean> {
    try {
      // Базовая проверка - можно переопределить в дочерних классах
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Защита от бесконечного цикла в агентном цикле
   */
  protected readonly MAX_ITERATIONS = 10;

  /**
   * Логирование с именем провайдера
   */
  protected log(message: string, ...args: any[]): void {
    console.log(`[${this.name}]`, message, ...args);
  }

  protected logError(message: string, error: unknown): void {
    console.error(`[${this.name}] ${message}:`, error);
  }
}
