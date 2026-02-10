import OpenAI from 'openai';
import { BaseAIProvider } from '../AIProvider.js';
import { ChatMessage, ChatResponse, ToolDefinition, EquipmentContext } from '../types.js';
import {
  convertToDeepSeekTools,
  extractDeepSeekToolCalls,
  formatDeepSeekToolResults,
} from '../adapters/deepseekToolAdapter.js';
import { executeToolCall } from '../../../tools/index.js';

export class DeepSeekProvider extends BaseAIProvider {
  readonly name = 'DeepSeek';
  private client: OpenAI;
  private model: string;
  private apiKey: string;

  constructor(apiKey: string, model: string = 'deepseek-chat') {
    super();
    this.apiKey = apiKey;
    // DeepSeek использует OpenAI SDK с кастомным baseURL
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://api.deepseek.com',
    });
    this.model = model;
  }

  async chat(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    userId: string,
    equipmentContext?: EquipmentContext
  ): Promise<ChatResponse> {
    try {
      let iteration = 0;
      const toolsUsed: string[] = [];

      // Системный промпт
      const systemPrompt = this.getSystemPrompt(equipmentContext);

      // Преобразуем сообщения в формат OpenAI
      const openAIMessages: OpenAI.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...this.convertMessages(messages),
      ];

      // Конвертируем tools
      const deepSeekTools = convertToDeepSeekTools(tools);

      // Первый запрос
      let response = await this.client.chat.completions.create({
        model: this.model,
        messages: openAIMessages,
        tools: deepSeekTools,
        tool_choice: 'auto',
        max_tokens: 4096,
      });

      let responseMessage = response.choices[0].message;

      // Агентный цикл (agentic loop)
      while (
        responseMessage.tool_calls &&
        responseMessage.tool_calls.length > 0 &&
        iteration < this.MAX_ITERATIONS
      ) {
        iteration++;

        // Добавляем ответ ассистента в историю
        openAIMessages.push(responseMessage);

        // Извлекаем и выполняем tool calls
        const toolCalls = extractDeepSeekToolCalls(responseMessage);
        const toolResults: Array<{ id: string; result: unknown; isError?: boolean }> = [];

        for (const toolCall of toolCalls) {
          this.log(`Executing tool: ${toolCall.name}`);
          toolsUsed.push(toolCall.name);

          try {
            const result = await executeToolCall(toolCall.name, toolCall.input);
            toolResults.push({ id: toolCall.id, result, isError: false });
          } catch (error) {
            this.logError(`Tool ${toolCall.name} failed`, error);
            toolResults.push({
              id: toolCall.id,
              result: error instanceof Error ? error.message : 'Неизвестная ошибка',
              isError: true,
            });
          }
        }

        // Добавляем результаты tools в историю
        openAIMessages.push(...formatDeepSeekToolResults(toolResults));

        // Повторный запрос
        response = await this.client.chat.completions.create({
          model: this.model,
          messages: openAIMessages,
          tools: deepSeekTools,
          tool_choice: 'auto',
          max_tokens: 4096,
        });

        responseMessage = response.choices[0].message;
      }

      return {
        message: responseMessage.content || 'Не удалось получить ответ',
        toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
        provider: this.name,
        tokensUsed: {
          input: response.usage?.prompt_tokens || 0,
          output: response.usage?.completion_tokens || 0,
        },
      };
    } catch (error) {
      this.logError('Chat error', error);

      if (error instanceof OpenAI.APIError) {
        if (error.status === 401) {
          throw new Error(
            '🔒 Ошибка авторизации DeepSeek API\n\n' +
            'Причина: Неверный API ключ.\n\n' +
            'Что делать:\n' +
            '• Проверьте переменную DEEPSEEK_API_KEY\n' +
            '• Ключ должен начинаться с "sk-"\n' +
            '• Создайте новый ключ на https://platform.deepseek.com/api_keys'
          );
        }

        if (error.status === 402) {
          throw new Error(
            '💳 Недостаточно средств на балансе DeepSeek\n\n' +
            'Что делать:\n' +
            '• Пополните баланс на https://platform.deepseek.com/top_up\n' +
            '• Минимум $2-5 для начала работы'
          );
        }

        if (error.status === 429) {
          throw new Error(
            '⚠️ Превышен лимит запросов DeepSeek API\n\n' +
            'Что делать:\n' +
            '• Подождите 1 минуту и повторите запрос\n' +
            '• Проверьте лимиты на https://platform.deepseek.com'
          );
        }

        if (error.status >= 500) {
          throw new Error(
            '🔧 Технические проблемы DeepSeek API\n\n' +
            'Что делать:\n' +
            '• Подождите 5-10 минут\n' +
            '• Проверьте статус: https://status.deepseek.com\n' +
            '• Используйте fallback провайдер (Gemini/Claude)'
          );
        }

        throw new Error(`⚠️ Ошибка DeepSeek API: ${error.message}`);
      }

      throw new Error(
        `❌ Неизвестная ошибка DeepSeek: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`
      );
    }
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }

  /**
   * Преобразует ChatMessage[] в формат OpenAI
   */
  private convertMessages(messages: ChatMessage[]): OpenAI.ChatCompletionMessageParam[] {
    return messages.map(msg => {
      if (typeof msg.content === 'string') {
        // Явно указываем роль как const чтобы TypeScript сузил тип
        if (msg.role === 'assistant') {
          return { role: 'assistant' as const, content: msg.content };
        }
        return { role: 'user' as const, content: msg.content };
      }

      // Мультимодальный контент (текст + изображения) — только для user
      const content: OpenAI.ChatCompletionContentPart[] = msg.content.map(block => {
        if (block.type === 'text') {
          return { type: 'text' as const, text: block.text };
        } else {
          // Изображение в формате base64
          return {
            type: 'image_url' as const,
            image_url: {
              url: `data:${block.source.media_type};base64,${block.source.data}`,
            },
          };
        }
      });

      return { role: 'user' as const, content };
    });
  }

  /**
   * Системный промпт (идентичен Claude/Gemini провайдерам)
   */
  private getSystemPrompt(equipmentContext?: EquipmentContext): string {
    const contextInfo = equipmentContext
      ? `\n\nКОНТЕКСТ ОБОРУДОВАНИЯ:
Пользователь отсканировал QR-код оборудования и работает с ним:
- ID: ${equipmentContext.id}
- Название: ${equipmentContext.name}
- Тип: ${equipmentContext.type}${equipmentContext.googleDriveUrl ? `\n- Папка Google Drive: ${equipmentContext.googleDriveUrl}` : ''}${equipmentContext.maintenanceSheetId ? `\n- ID журнала обслуживания: ${equipmentContext.maintenanceSheetId}` : ''}

🚨 КРИТИЧЕСКИ ВАЖНО:
Когда пользователь запрашивает информацию БЕЗ указания конкретного оборудования, АВТОМАТИЧЕСКИ используй ID этого оборудования: ${equipmentContext.id}

Примеры:
- "Покажи журнал обслуживания" → используй equipment_id="${equipmentContext.id}"${equipmentContext.maintenanceSheetId ? ` и maintenance_sheet_id="${equipmentContext.maintenanceSheetId}"` : ''} в get_maintenance_log
- "Покажи файлы" → используй folderId из Google Drive URL этого оборудования
- "Добавь запись о ремонте" → используй equipment_id="${equipmentContext.id}"${equipmentContext.maintenanceSheetId ? ` и maintenance_sheet_id="${equipmentContext.maintenanceSheetId}"` : ''} в add_maintenance_entry
- "Когда последнее обслуживание?" → сначала вызови get_maintenance_log с equipment_id="${equipmentContext.id}"${equipmentContext.maintenanceSheetId ? ` и maintenance_sheet_id="${equipmentContext.maintenanceSheetId}"` : ''}

НЕ спрашивай ID оборудования, если контекст уже установлен!`
      : '';

    return `Ты — AI-консультант по обслуживанию оборудования на производстве.
Твоя задача — помогать сотрудникам работать с оборудованием.${contextInfo}

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

При работе с файлами и папками:
- Если пользователь хочет ОТКРЫТЬ или ПРОСМОТРЕТЬ файл — найди его через search_files_in_folder, затем ответь в формате: 📄 [Название файла](url_файла)
- Если пользователь хочет ОТКРЫТЬ ПАПКУ (например, папку с фото) — найди её через search_files_in_folder с mime_type="application/vnd.google-apps.folder", затем ответь: 📁 [Название папки](url_папки)
- Если пользователь просит показать ВСЁ СОДЕРЖИМОЕ папки — делай ДВА запроса: 1) без mime_type (файлы), 2) с mime_type="application/vnd.google-apps.folder" (вложенные папки), затем покажи всё вместе
- Если пользователь хочет ПРОЧИТАТЬ, ИЗУЧИТЬ содержимое или найти информацию в файле — используй read_file_content

При работе с фото:
- Если пользователь прикрепил изображение, проанализируй его содержимое
- ВАЖНО: Перед загрузкой покажи информацию о фото и запроси подтверждение
- Привязывай фото к конкретным работам через дату, тип и описание

При диагностике по фото деталей, датчиков и узлов оборудования:
- Когда пользователь присылает фото компонента — СНАЧАЛА опиши что видишь: тип компонента, марку/модель (если видна), видимые повреждения (нагар, трещины, ржавчина, износ, деформация, следы перегрева, утечки)
- Учти контекст оборудования (тип, название) для точной идентификации компонента
- Задай 2-3 уточняющих вопроса: когда появилась проблема? какие симптомы в работе? были ли аномалии (шум, вибрация, запах, ошибки)?
- На основе фото и ответов — предложи конкретные причины и шаги по устранению пошагово (один шаг — ждёшь подтверждения)
- Если нужна замена — уточни производителя/модель оборудования для подбора аналога

При добавлении записей в журнал:
- Всегда запрашивай подтверждение перед сохранением
- Уточняй детали, если информация неполная
- Формат даты: YYYY-MM-DD

При диагностике и ремонте оборудования:
- Если пользователь описывает неисправность или проблему — СНАЧАЛА задай 2-3 уточняющих вопроса: что именно происходит? когда началось? были ли изменения в работе?
- После получения симптомов — применяй свои знания для диагностики данного типа оборудования
- Проверь историю обслуживания через get_maintenance_log — возможно проблема повторяется или была решена ранее
- Веди пользователя ПОШАГОВО: один шаг за раз, жди подтверждения ("готово" / "следующий") перед следующим шагом
- Если не удаётся определить причину — предложи открыть документацию (search_files_in_folder + read_file_content)
- В конце ВСЕГДА предлагай: "Записать результат ремонта в журнал обслуживания?"

Отвечай кратко и по делу. Используй эмодзи для наглядности.
Язык общения: русский.

Текущая дата: ${new Date().toISOString().split('T')[0]}`;
  }
}