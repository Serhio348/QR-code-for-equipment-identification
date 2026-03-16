import {
  ChatMessage,
  ChatResponse,
  ToolDefinition,
  EquipmentContext,
  WaterDashboardContext,
  MemoryContext,
  StreamEvent,
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
    waterContext?: WaterDashboardContext,
    memoryContext?: MemoryContext
  ): Promise<ChatResponse>;

  /**
   * Проверка доступности провайдера
   */
  isAvailable(): Promise<boolean>;

  /**
   * Стриминг-версия чата через SSE-колбэк.
   */
  streamChat(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    userId: string,
    onEvent: (event: StreamEvent) => void,
    equipmentContext?: EquipmentContext,
    waterContext?: WaterDashboardContext,
    memoryContext?: MemoryContext,
  ): Promise<void>;
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
    equipmentContext?: EquipmentContext,
    waterContext?: WaterDashboardContext,
    memoryContext?: MemoryContext
  ): Promise<ChatResponse>;

  async isAvailable(): Promise<boolean> {
    try {
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Стриминг-версия чата. Эмитит события через onEvent колбэк:
   *   tool_call  — агент вызывает инструмент
   *   text_delta — кусочек финального текста (стриминг)
   *   done       — всё готово
   *   error      — ошибка
   *
   * Базовая реализация: обычный chat() + эмит полного текста одним text_delta.
   * ClaudeProvider переопределяет для настоящего стриминга.
   */
  async streamChat(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    userId: string,
    onEvent: (event: StreamEvent) => void,
    equipmentContext?: EquipmentContext,
    waterContext?: WaterDashboardContext,
    memoryContext?: MemoryContext,
  ): Promise<void> {
    const response = await this.chat(messages, tools, userId, equipmentContext, waterContext, memoryContext);
    onEvent({ type: 'text_delta', delta: response.message });
    onEvent({ type: 'done', toolsUsed: response.toolsUsed || [], provider: response.provider });
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
