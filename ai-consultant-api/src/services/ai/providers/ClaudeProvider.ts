/**
 * ClaudeProvider.ts
 *
 * Провайдер для Anthropic Claude API.
 * Реализует интерфейс AIProvider для работы с Claude.
 *
 * ВАЖНО: Большая часть кода скопирована из anthropic.ts
 * с минимальными изменениями для адаптации под multi-provider архитектуру.
 */

import Anthropic from '@anthropic-ai/sdk';
import { BaseAIProvider } from '../AIProvider.js';
import { ChatMessage, ChatResponse, ToolDefinition } from '../types.js';
import {
  convertToClaudeTools,
  extractClaudeToolCalls,
  formatClaudeToolResults,
} from '../adapters/claudeToolAdapter.js';
import { executeToolCall } from '../../../tools/index.js';

export class ClaudeProvider extends BaseAIProvider {
  readonly name = 'Claude';
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string = 'claude-sonnet-4-20250514') {
    super();
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  /**
   * Обработка сообщения чата через Claude API.
   *
   * Реализует "agentic loop" — цикл, в котором Claude может
   * многократно вызывать tools, пока не сформирует финальный ответ.
   */
  async chat(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    userId: string
  ): Promise<ChatResponse> {
    try {
      // Защита от бесконечного цикла
      let iteration = 0;

      // Массив для сбора имён вызванных tools (для отладки/UI)
      const toolsUsed: string[] = [];

      // ----------------------------------------
      // Шаг 1: Подготовка сообщений
      // ----------------------------------------

      // Преобразуем наш формат ChatMessage[] в формат Anthropic API
      const claudeMessages: Anthropic.MessageParam[] = messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      }));

      // Конвертируем tools в формат Claude
      const claudeTools = convertToClaudeTools(tools);

      // Системный промпт
      const systemPrompt = this.getSystemPrompt();

      // ----------------------------------------
      // Шаг 2: Первый запрос к Claude
      // ----------------------------------------

      // Отправляем всю историю переписки + системный промпт + определения tools.
      // Claude проанализирует контекст и либо:
      // а) Сразу ответит текстом (stop_reason: "end_turn")
      // б) Запросит вызов tool (stop_reason: "tool_use")
      let response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: systemPrompt,
        tools: claudeTools,
        messages: claudeMessages,
      });

      // ----------------------------------------
      // Шаг 3: Агентный цикл (agentic loop)
      // ----------------------------------------

      // Если Claude хочет вызвать tool — выполняем его и отправляем результат обратно.
      // Цикл продолжается, пока Claude не закончит (stop_reason !== 'tool_use').
      //
      // Пример: пользователь спрашивает "Когда последний раз обслуживался фильтр?"
      // Итерация 1: Claude вызывает search_equipment → получает ID фильтра
      // Итерация 2: Claude вызывает get_maintenance_log → получает журнал
      // Итерация 3: Claude формирует текстовый ответ → цикл завершается
      while (response.stop_reason === 'tool_use' && iteration < this.MAX_ITERATIONS) {
        iteration++;

        if (iteration === this.MAX_ITERATIONS) {
          throw new Error('AI агент превысил максимальное количество шагов анализа');
        }

        // Извлекаем блоки tool_use из ответа Claude
        const toolCalls = extractClaudeToolCalls(response.content);

        // Массив результатов выполнения tools
        const toolResults: Array<{ id: string; result: unknown; isError?: boolean }> = [];

        // Выполняем каждый tool по очереди
        for (const toolCall of toolCalls) {
          this.log(`Executing tool: ${toolCall.name}`);
          toolsUsed.push(toolCall.name);

          try {
            // executeToolCall — вызывает соответствующую функцию
            // (например, search_equipment → запрос к GAS API)
            const result = await executeToolCall(toolCall.name, toolCall.input);

            // Успешный результат
            toolResults.push({
              id: toolCall.id,
              result,
              isError: false,
            });
          } catch (error) {
            // Ошибка выполнения: сообщаем Claude об ошибке
            this.logError(`Tool ${toolCall.name} failed`, error);
            toolResults.push({
              id: toolCall.id,
              result: `Ошибка выполнения: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
              isError: true,
            });
          }
        }

        // ----------------------------------------
        // Шаг 4: Отправляем результаты tools обратно Claude
        // ----------------------------------------

        // Добавляем ответ Claude (с tool_use блоками) в историю
        claudeMessages.push({
          role: 'assistant',
          content: response.content,
        });

        // Добавляем результаты tools как сообщение от user
        claudeMessages.push({
          role: 'user',
          content: formatClaudeToolResults(toolResults),
        });

        // Повторный запрос к Claude с обновлённой историей
        response = await this.client.messages.create({
          model: this.model,
          max_tokens: 4096,
          system: systemPrompt,
          tools: claudeTools,
          messages: claudeMessages,
        });
      }

      // ----------------------------------------
      // Шаг 5: Извлекаем финальный текстовый ответ
      // ----------------------------------------

      // После выхода из цикла, ответ содержит текстовый блок
      const textBlock = response.content.find(
        (block): block is Anthropic.TextBlock => block.type === 'text'
      );

      // Возвращаем текст и список использованных tools
      return {
        message: textBlock?.text || 'Не удалось получить ответ',
        toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
        provider: this.name,
        tokensUsed: {
          input: response.usage.input_tokens,
          output: response.usage.output_tokens,
        },
      };
    } catch (error) {
      // ----------------------------------------
      // Обработка ошибок API
      // ----------------------------------------

      this.logError('Chat error', error);

      // Anthropic SDK выбрасывает APIError с кодом статуса
      if (error instanceof Anthropic.APIError) {
        // 429 — слишком много запросов (rate limit)
        if (error.status === 429) {
          throw new Error('Превышен лимит запросов. Подождите немного.');
        }
        // 401 — неверный API ключ
        if (error.status === 401) {
          throw new Error('Ошибка авторизации Claude API');
        }
      }

      // Прочие ошибки пробрасываем дальше
      throw error;
    }
  }

  /**
   * Проверка доступности Claude API
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.client.messages.create({
        model: this.model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'test' }],
      });
      return true;
    } catch (error) {
      console.error('[ClaudeProvider] Not available:', error instanceof Error ? error.message : error);
      return false;
    }
  }

  /**
   * Системный промпт для Claude
   */
  private getSystemPrompt(): string {
    return `Ты — AI-консультант по обслуживанию оборудования на производстве.
Твоя задача — помогать сотрудникам работать с оборудованием.

Ты можешь:
1. Искать оборудование по названию или характеристикам
2. Показывать информацию об оборудовании (характеристики, дату ввода, последнее обслуживание)
3. Просматривать журнал обслуживания оборудования
4. Добавлять записи в журнал обслуживания
5. Читать содержимое документации и инструкций (PDF файлы)
6. Искать файлы в папках оборудования на Google Drive
7. Работать с фото обслуживания:
   - Загружать одно или несколько фото в папку оборудования
   - Просматривать список загруженных фото
   - Искать фото по описанию, дате или типу работ

При работе с фото:
- Если пользователь прикрепил изображение, проанализируй его содержимое
- ВАЖНО: Перед загрузкой покажи информацию о фото и запроси подтверждение
- Привязывай фото к конкретным работам через дату, тип и описание

При добавлении записей в журнал:
- Всегда запрашивай подтверждение перед сохранением
- Уточняй детали, если информация неполная
- Формат даты: YYYY-MM-DD

Отвечай кратко и по делу. Используй эмодзи для наглядности.
Язык общения: русский.

Текущая дата: ${new Date().toISOString().split('T')[0]}`;
  }
}
