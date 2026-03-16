import OpenAI from 'openai';
import { BaseAIProvider } from '../AIProvider.js';
import { ChatMessage, ChatResponse, ToolDefinition, EquipmentContext, WaterDashboardContext, MemoryContext, StreamEvent } from '../types.js';
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
    equipmentContext?: EquipmentContext,
    waterContext?: WaterDashboardContext,
    memoryContext?: MemoryContext
  ): Promise<ChatResponse> {
    try {
      let iteration = 0;
      const toolsUsed: string[] = [];

      // Системный промпт
      const systemPrompt = this.getSystemPrompt(equipmentContext, waterContext, memoryContext);

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
   * Стриминговый чат: инструменты выполняются без стриминга,
   * финальный текст отдаётся по кускам через onEvent({ type: 'text_delta' }).
   */
  async streamChat(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    _userId: string,
    onEvent: (event: StreamEvent) => void,
    equipmentContext?: EquipmentContext,
    waterContext?: WaterDashboardContext,
    memoryContext?: MemoryContext,
  ): Promise<void> {
    const toolsUsed: string[] = [];
    const systemPrompt = this.getSystemPrompt(equipmentContext, waterContext, memoryContext);

    const openAIMessages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...this.convertMessages(messages),
    ];

    const deepSeekTools = convertToDeepSeekTools(tools);
    let iteration = 0;

    while (iteration < this.MAX_ITERATIONS) {
      iteration++;

      // Аккумуляторы для сбора данных из стримингового ответа
      let fullContent = '';
      let finishReason = '';
      const toolCallAccumulators: Record<number, { id: string; name: string; arguments: string }> = {};

      // Стриминговый запрос к DeepSeek
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages: openAIMessages,
        tools: deepSeekTools,
        tool_choice: 'auto',
        max_tokens: 4096,
        stream: true,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        const reason = chunk.choices[0]?.finish_reason;
        if (reason) finishReason = reason;

        // Текстовый фрагмент — сразу отправляем на фронтенд
        if (delta?.content) {
          fullContent += delta.content;
          onEvent({ type: 'text_delta', delta: delta.content });
        }

        // Накапливаем данные вызовов инструментов (приходят кусками)
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index;
            if (!toolCallAccumulators[idx]) {
              toolCallAccumulators[idx] = { id: tc.id || '', name: tc.function?.name || '', arguments: '' };
              if (tc.function?.name) {
                onEvent({ type: 'tool_call', name: tc.function.name });
              }
            } else {
              if (tc.id) toolCallAccumulators[idx].id = tc.id;
              if (tc.function?.name) toolCallAccumulators[idx].name = tc.function.name;
            }
            if (tc.function?.arguments) {
              toolCallAccumulators[idx].arguments += tc.function.arguments;
            }
          }
        }
      }

      // Финальный текстовый ответ — всё уже отправлено через text_delta
      if (finishReason !== 'tool_calls') {
        onEvent({ type: 'done', toolsUsed, provider: this.name });
        return;
      }

      // Выполняем накопленные инструменты
      const toolCallsList = Object.values(toolCallAccumulators);

      // Добавляем ответ ассистента с tool_calls в историю
      openAIMessages.push({
        role: 'assistant',
        content: fullContent || null,
        tool_calls: toolCallsList.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: tc.arguments },
        })),
      });

      const toolResults: Array<{ id: string; result: unknown; isError?: boolean }> = [];

      for (const tc of toolCallsList) {
        toolsUsed.push(tc.name);
        this.log(`Выполняю инструмент (стриминг): ${tc.name}`);
        try {
          let parsedInput: Record<string, unknown> = {};
          try { parsedInput = JSON.parse(tc.arguments); } catch { /* пустые аргументы */ }
          const result = await executeToolCall(tc.name, parsedInput);
          toolResults.push({ id: tc.id, result, isError: false });
        } catch (error) {
          this.logError(`Инструмент ${tc.name} завершился ошибкой`, error);
          toolResults.push({
            id: tc.id,
            result: `Ошибка: ${error instanceof Error ? error.message : String(error)}`,
            isError: true,
          });
        }
      }

      openAIMessages.push(...formatDeepSeekToolResults(toolResults));
    }

    onEvent({ type: 'error', message: 'Превышен лимит итераций агента' });
  }

  /**
   * Преобразует ChatMessage[] в формат OpenAI.
   * DeepSeek НЕ поддерживает vision: изображения заменяются текстовым уведомлением.
   */
  private convertMessages(messages: ChatMessage[]): OpenAI.ChatCompletionMessageParam[] {
    return messages.map(msg => {
      if (typeof msg.content === 'string') {
        if (msg.role === 'assistant') {
          return { role: 'assistant' as const, content: msg.content };
        }
        return { role: 'user' as const, content: msg.content };
      }

      // Мультимодальный контент: DeepSeek не поддерживает image_url —
      // извлекаем только текстовые блоки, изображения заменяем описанием.
      const textParts: string[] = [];
      let imageCount = 0;

      for (const block of msg.content) {
        if (block.type === 'text') {
          textParts.push(block.text);
        } else {
          imageCount++;
        }
      }

      if (imageCount > 0) {
        textParts.push(
          `\n[⚠️ Пользователь прикрепил ${imageCount} изображение(й), но DeepSeek не поддерживает анализ фото. ` +
          `Сообщи пользователю об этом ограничении и предложи описать содержимое изображения текстом, ` +
          `либо переключиться на Claude или Gemini для работы с фотографиями.]`
        );
      }

      const text = textParts.join('\n').trim();
      return { role: 'user' as const, content: text };
    });
  }

  /**
   * Системный промпт (идентичен Claude/Gemini провайдерам)
   */
  private getSystemPrompt(equipmentContext?: EquipmentContext, waterContext?: WaterDashboardContext, memoryContext?: MemoryContext): string {
    const waterInfo = waterContext
      ? `\n\nТЕКУЩИЙ КОНТЕКСТ ВОДНОГО ДАШБОРДА (${waterContext.monthLabel}):
• Скважина (вход): ${waterContext.sourceMonth.toLocaleString('ru')} м³
• Производство: ${waterContext.productionMonth.toLocaleString('ru')} м³
• Хоз-питьевое водоснабжение: ${waterContext.domesticMonth.toLocaleString('ru')} м³
• Потери: ${waterContext.lossesMonth.toLocaleString('ru')} м³ (${waterContext.lossesPct}%)
  - Промывка фильтров обезжелезивания: ~${waterContext.filterLoss} м³
  - Осмос: ~${waterContext.osmosisLoss} м³
• Активных превышений норм: ${waterContext.activeAlerts}

Пользователь сейчас просматривает дашборд воды за ${waterContext.monthLabel}.
Если вопрос касается баланса/потерь/потребления за этот период — используй эти данные как контекст, не вызывая лишних инструментов.
Для детального анализа, сравнения или другого периода — вызывай инструменты get_water_readings / analyze_water_consumption.`
      : '';

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
Твоя задача — помогать сотрудникам работать с оборудованием.${contextInfo}${waterInfo}

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
8. Просматривать показания счётчиков воды (Beliot):
   - Если пользователь называет объект или место — сначала вызови get_water_devices чтобы найти device_id
   - Получать историю показаний по названию объекта (device_name) или ID устройства (device_id)
   - Анализировать потребление воды: итого, среднее, мин/макс, тренд
9. Распознавать показания счётчика с фото:
   - Если пользователь прислал фото счётчика — внимательно изучи циферблат и считай значение
   - Назови распознанное значение с единицей измерения и уточни название объекта или ID устройства
   - Запроси подтверждение, затем сохрани через save_manual_meter_reading
10. Работать с журналом качества воды:
    - Просматривать результаты лабораторных анализов (get_water_quality_analyses)
    - Просматривать активные превышения норм (get_water_quality_alerts)
    - Создавать новые записи анализа (add_water_quality_analysis, требуется подтверждение)

При работе со счётчиками воды — КРИТИЧЕСКИ ВАЖНО понимать разницу:
- ПОКАЗАНИЯ (get_water_readings) — абсолютные значения на циферблате счётчика, нарастающий итог с момента установки. Например: "12 345 м³ на 01.02.2026". Используй когда пользователь спрашивает "какое сейчас показание?" или "что на счётчике?".
- РАСХОД (analyze_water_consumption) — сколько воды израсходовано за период = последнее показание − первое показание. Например: "45 м³ за февраль". Используй когда пользователь спрашивает "сколько воды потрачено?", "расход за месяц", "потребление за период".
- НИКОГДА не суммируй показания счётчика — это бессмысленно. Расход всегда считается как разница показаний.
- Если пользователь называет объект или место — сначала вызови get_water_devices чтобы найти device_id.
- При анализе потребления используй период (day/week/month/year) или конкретные даты.
- При отображении значений всегда указывай единицы измерения (м³).

При работе с качеством воды:
- Параметры: железо (iron, мг/л), щёлочность (alkalinity, мг-экв/л), жёсткость (hardness, мг-экв/л), окисляемость (oxidizability, мг О₂/л), pH, температура (temperature, °C)
- Статусы соответствия нормам: optimal — оптимально, normal — в норме, warning — предупреждение, exceeded — превышение

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

При создании документов (create_document):
- График ТО: проанализируй журнал обслуживания через get_maintenance_log, определи интервалы, составь таблицу (type="sheet") с колонками: Дата, Оборудование, Тип работ, Ответственный. Сохрани в папку оборудования (folder_url = googleDriveUrl).
- Инструкция: используй свои знания по данному типу оборудования, оформи как текстовый документ (type="doc") с заголовками (# ## ###).
- Акт выполненных работ: заполни на основе данных из журнала обслуживания — дата, описание, исполнитель, результат.
- Отчёт по обслуживанию: агрегируй данные из журнала за период, сформируй сводку.
- Если пользователь просит другой тип документа — сформируй содержимое по смыслу запроса.
- ВСЕГДА сохраняй документ в папку оборудования (googleDriveUrl из контекста), если доступна.
- После создания покажи пользователю ссылку на документ.

11. Работать со счетами водоканала bvod.by:

    ВСЕ ИСТОРИЧЕСКИЕ СЧЕТА УЖЕ СОХРАНЕНЫ В БАЗЕ ДАННЫХ.
    При вопросах о счетах, тарифах, объёмах воды/канализации, суммах — используй ТОЛЬКО эти инструменты:
    - get_invoices — история счетов из БД (мгновенно, без браузера).
      Поля счёта: period (YYYY-MM), account_number, volume_m3 (вода м³), tariff_per_m3, sewage_volume_m3 (канализация м³), sewage_tariff_per_m3, amount_byn (итого BYN).
      Поле sections — детализация по точкам подключения (массив): id, name (название ввода), address, volume_m3 (вода), sewage_m3 (канализация), amount_byn (сумма по точке).
    - get_invoice_file — ссылка на PDF счёта по периоду (YYYY-MM)

    НИКОГДА не используй portal_login / portal_list_invoices / portal_download_invoice / portal_read_invoice для исторических данных — это медленно и избыточно.

    Портальные инструменты (portal_*) использовать ТОЛЬКО если пользователь явно просит:
    - зайти на портал прямо сейчас
    - скачать новый счёт которого нет в БД
    - проверить что появилось на портале

    При ответе на вопросы о счетах ВСЕГДА показывай ВСЕ данные: воду, канализацию, тарифы, суммы.
    При вопросах "по какому адресу" / "по какой точке" — используй поле sections для детализации.

Форматирование чисел: БЕЗ разделителя тысяч — писать 1185.22 BYN, НЕ 1,185.22.
Тарифы — 4 знака после точки: 2.0757 BYN/м³.

Отвечай кратко и по делу. Используй эмодзи для наглядности.
Язык общения: русский.
${memoryContext?.factsPrompt ?? ''}
Текущая дата: ${new Date().toISOString().split('T')[0]}`;
  }
}