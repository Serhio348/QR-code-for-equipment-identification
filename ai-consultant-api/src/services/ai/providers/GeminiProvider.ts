/**
 * GeminiProvider.ts
 *
 * Провайдер для Google Gemini API.
 * Реализует интерфейс AIProvider для работы с Gemini.
 */

import { GoogleGenerativeAI, Content } from '@google/generative-ai';
import { BaseAIProvider } from '../AIProvider.js';
import { ChatMessage, ChatResponse, ToolDefinition } from '../types.js';
import {
  convertToGeminiTools,
  extractGeminiFunctionCalls,
  formatGeminiFunctionResults,
} from '../adapters/geminiToolAdapter.js';
import { executeToolCall } from '../../../tools/index.js';

export class GeminiProvider extends BaseAIProvider {
  readonly name = 'Gemini';
  private client: GoogleGenerativeAI;
  private model: string;

  constructor(apiKey: string, model: string = 'gemini-2.0-flash-exp') {
    super();
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = model;
  }

  /**
   * Обработка сообщения чата через Gemini API.
   *
   * Реализует "agentic loop" — цикл, в котором Gemini может
   * многократно вызывать functions, пока не сформирует финальный ответ.
   */
  async chat(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    userId: string
  ): Promise<ChatResponse> {
    try {
      // Защита от бесконечного цикла
      let iteration = 0;

      // Массив для сбора имён вызванных tools
      const toolsUsed: string[] = [];

      // ----------------------------------------
      // Шаг 1: Подготовка модели и сообщений
      // ----------------------------------------

      // Создаём модель с системным промптом и tools
      const genAI = this.client.getGenerativeModel({
        model: this.model,
        systemInstruction: this.getSystemPrompt(),
      });

      // Конвертируем tools в формат Gemini
      const geminiTools = convertToGeminiTools(tools);

      // Преобразуем наш формат ChatMessage[] в формат Gemini Content[]
      const geminiMessages: Content[] = this.convertMessagesToGemini(messages);

      // ----------------------------------------
      // Шаг 2: Запуск чата с Gemini
      // ----------------------------------------

      // Gemini использует chat session для поддержки истории
      const chat = genAI.startChat({
        history: geminiMessages.slice(0, -1), // Всё кроме последнего сообщения
        tools: [{ functionDeclarations: geminiTools }],
      });

      // Последнее сообщение отправляем как prompt
      const lastMessage = geminiMessages[geminiMessages.length - 1];
      const userPrompt = this.extractTextFromContent(lastMessage);

      let result = await chat.sendMessage(userPrompt);

      // ----------------------------------------
      // Шаг 3: Агентный цикл (agentic loop)
      // ----------------------------------------

      // Если Gemini хочет вызвать function — выполняем его и отправляем результат обратно
      while (this.hasFunctionCalls(result) && iteration < this.MAX_ITERATIONS) {
        iteration++;

        if (iteration === this.MAX_ITERATIONS) {
          throw new Error('AI агент превысил максимальное количество шагов анализа');
        }

        // Извлекаем function calls из ответа Gemini
        const functionCalls = extractGeminiFunctionCalls(
          result.response.candidates?.[0]?.content?.parts || []
        );

        // Массив результатов выполнения functions
        const functionResults: Array<{
          name: string;
          result: unknown;
          isError?: boolean;
        }> = [];

        // Выполняем каждую function по очереди
        for (const functionCall of functionCalls) {
          this.log(`Executing function: ${functionCall.name}`);
          toolsUsed.push(functionCall.name);

          try {
            // executeToolCall — вызывает соответствующую функцию
            const functionResult = await executeToolCall(
              functionCall.name,
              functionCall.input
            );

            // Успешный результат
            functionResults.push({
              name: functionCall.name,
              result: functionResult,
              isError: false,
            });
          } catch (error) {
            // Ошибка выполнения: сообщаем Gemini об ошибке
            this.logError(`Function ${functionCall.name} failed`, error);
            functionResults.push({
              name: functionCall.name,
              result: `Ошибка выполнения: ${
                error instanceof Error ? error.message : 'Неизвестная ошибка'
              }`,
              isError: true,
            });
          }
        }

        // ----------------------------------------
        // Шаг 4: Отправляем результаты functions обратно Gemini
        // ----------------------------------------

        const functionResponseParts = formatGeminiFunctionResults(functionResults);

        // Отправляем результаты и получаем следующий ответ
        result = await chat.sendMessage(functionResponseParts);
      }

      // ----------------------------------------
      // Шаг 5: Извлекаем финальный текстовый ответ
      // ----------------------------------------

      const textResponse = this.extractTextFromResult(result);

      // Возвращаем текст и список использованных tools
      return {
        message: textResponse || 'Не удалось получить ответ',
        toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
        provider: this.name,
        tokensUsed: {
          input: result.response.usageMetadata?.promptTokenCount || 0,
          output: result.response.usageMetadata?.candidatesTokenCount || 0,
        },
      };
    } catch (error) {
      // ----------------------------------------
      // Обработка ошибок API
      // ----------------------------------------

      this.logError('Chat error', error);

      // Gemini выбрасывает ошибки с различными кодами
      if (error instanceof Error) {
        // 429 — слишком много запросов (rate limit)
        if (error.message.includes('429') || error.message.includes('RESOURCE_EXHAUSTED')) {
          throw new Error('Превышен лимит запросов. Подождите немного.');
        }
        // 401 — неверный API ключ
        if (error.message.includes('401') || error.message.includes('API_KEY_INVALID')) {
          throw new Error('Ошибка авторизации Gemini API');
        }
      }

      // Прочие ошибки пробрасываем дальше
      throw error;
    }
  }

  /**
   * Проверка доступности Gemini API
   */
  async isAvailable(): Promise<boolean> {
    try {
      const genAI = this.client.getGenerativeModel({ model: this.model });
      const result = await genAI.generateContent('test');
      return !!result.response;
    } catch {
      return false;
    }
  }

  /**
   * Системный промпт для Gemini
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

  /**
   * Преобразует наш формат ChatMessage в формат Gemini Content
   */
  private convertMessagesToGemini(messages: ChatMessage[]): Content[] {
    return messages.map(msg => {
      // Gemini использует 'user' и 'model' вместо 'assistant'
      const role = msg.role === 'assistant' ? 'model' : 'user';

      // Если content это строка - преобразуем в parts
      if (typeof msg.content === 'string') {
        return {
          role,
          parts: [{ text: msg.content }],
        };
      }

      // Если content это массив блоков (мультимодальный контент)
      const parts = msg.content.map(block => {
        if (block.type === 'text') {
          return { text: block.text };
        } else if (block.type === 'image') {
          return {
            inlineData: {
              mimeType: block.source.media_type,
              data: block.source.data,
            },
          };
        }
        throw new Error(`Unknown block type: ${(block as any).type}`);
      });

      return { role, parts };
    });
  }

  /**
   * Проверяет, содержит ли ответ function calls
   */
  private hasFunctionCalls(result: any): boolean {
    const parts = result.response.candidates?.[0]?.content?.parts || [];
    return parts.some((part: any) => part.functionCall);
  }

  /**
   * Извлекает текст из Content
   */
  private extractTextFromContent(content: Content): string {
    if (!content.parts) return '';

    const textParts = content.parts
      .filter((part: any) => part.text)
      .map((part: any) => part.text);

    return textParts.join('');
  }

  /**
   * Извлекает текст из результата генерации
   */
  private extractTextFromResult(result: any): string {
    const parts = result.response.candidates?.[0]?.content?.parts || [];
    const textParts = parts.filter((part: any) => part.text).map((part: any) => part.text);
    return textParts.join('');
  }
}
