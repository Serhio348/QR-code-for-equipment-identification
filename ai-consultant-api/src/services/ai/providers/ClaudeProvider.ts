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
import { ChatMessage, ChatResponse, ToolDefinition, EquipmentContext, WaterDashboardContext, MemoryContext, StreamEvent } from '../types.js';
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
    userId: string,
    equipmentContext?: EquipmentContext,
    waterContext?: WaterDashboardContext,
    memoryContext?: MemoryContext
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

      // Системный промпт с учётом контекста оборудования и дашборда воды
      const systemPrompt = this.getSystemPrompt(equipmentContext, waterContext, memoryContext);

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

        // Выполняем все tool calls параллельно
        toolCalls.forEach(tc => { this.log(`Выполняю инструмент: ${tc.name}`); toolsUsed.push(tc.name); });

        const toolResults = await Promise.all(toolCalls.map(async (toolCall) => {
          try {
            const result = await executeToolCall(toolCall.name, toolCall.input);
            return { id: toolCall.id, result, isError: false };
          } catch (error) {
            this.logError(`Инструмент ${toolCall.name} завершился ошибкой`, error);
            return { id: toolCall.id, result: `Ошибка выполнения: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`, isError: true };
          }
        }));

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
        const errorMessage = error.message || '';

        // 429 — слишком много запросов (rate limit)
        if (error.status === 429) {
          throw new Error(
            '⚠️ Превышен лимит запросов Claude API\n\n' +
            'Код ошибки: 429 (Too Many Requests)\n' +
            'Причина: Слишком много запросов к API за короткий промежуток времени.\n\n' +
            'Что делать:\n' +
            '• Подождите 1-2 минуты и повторите запрос\n' +
            '• Проверьте лимиты на https://console.anthropic.com/settings/limits\n' +
            '• Рассмотрите увеличение лимита или переход на другой тарифный план'
          );
        }

        // 401 — неверный API ключ
        if (error.status === 401) {
          throw new Error(
            '🔒 Ошибка авторизации Claude API\n\n' +
            'Код ошибки: 401 (Unauthorized)\n' +
            'Причина: Неверный или отсутствующий API ключ.\n\n' +
            'Что делать:\n' +
            '• Проверьте, что переменная ANTHROPIC_API_KEY установлена правильно\n' +
            '• Создайте новый API ключ на https://console.anthropic.com/settings/keys\n' +
            '• Убедитесь, что ключ начинается с "sk-ant-api03-"'
          );
        }

        // 403 — доступ запрещен (часто из-за отрицательного баланса)
        if (error.status === 403) {
          throw new Error(
            '💳 Недостаточно средств на балансе Claude API\n\n' +
            'Код ошибки: 403 (Forbidden)\n' +
            'Причина: На вашем аккаунте закончились средства или аккаунт заблокирован.\n\n' +
            'Что делать:\n' +
            '• Пополните баланс на https://console.anthropic.com/settings/billing\n' +
            '• Проверьте статус аккаунта\n' +
            '• Минимальное пополнение: $5\n' +
            '• Стоимость запроса: ~$0.05'
          );
        }

        // 405 — метод не разрешён
        if (error.status === 405) {
          throw new Error(
            '🚫 Неподдерживаемый метод запроса к Claude API\n\n' +
            'Код ошибки: 405 (Method Not Allowed)\n' +
            'Причина: Использован неправильный HTTP метод (GET вместо POST или наоборот).\n\n' +
            'Что делать:\n' +
            '• Это ошибка в коде приложения, не в настройках\n' +
            '• Обратитесь к администратору системы\n' +
            '• Проверьте, что используется правильный endpoint API'
          );
        }

        // 400 — неверный запрос
        if (error.status === 400) {
          throw new Error(
            '❌ Неверный формат запроса к Claude API\n\n' +
            'Код ошибки: 400 (Bad Request)\n' +
            `Детали: ${errorMessage}\n\n` +
            'Причина: API не смог обработать запрос из-за неверного формата данных.'
          );
        }

        // 500, 502, 503 — ошибки на стороне сервера
        if (error.status >= 500) {
          throw new Error(
            '🔧 Технические проблемы на стороне Claude API\n\n' +
            `Код ошибки: ${error.status} (Server Error)\n` +
            'Причина: Временные проблемы с серверами Anthropic.\n\n' +
            'Что делать:\n' +
            '• Подождите 5-10 минут и повторите запрос\n' +
            '• Проверьте статус сервиса на https://status.anthropic.com\n' +
            '• Если проблема сохраняется, обратитесь в поддержку'
          );
        }

        // Прочие ошибки API
        throw new Error(
          `⚠️ Ошибка Claude API\n\n` +
          `Код ошибки: ${error.status || 'unknown'}\n` +
          `Детали: ${errorMessage}\n\n` +
          'Обратитесь к администратору системы.'
        );
      }

      // Прочие ошибки (не APIError)
      throw new Error(
        '❌ Неизвестная ошибка при работе с Claude API\n\n' +
        `Детали: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}\n\n` +
        'Обратитесь к администратору системы.'
      );
    }
  }

  /**
   * Проверка доступности Claude API.
   * Не делаем тестовый запрос — он тратит токены, может вызвать 429 и
   * спровоцировать лишний fallback на Gemini/DeepSeek (у которых нет стриминга).
   * Достаточно проверить, что клиент инициализирован с API ключом.
   */
  async isAvailable(): Promise<boolean> {
    return !!(this.client);
  }

  /**
   * Системный промпт для Claude
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
   - Создавать подпапки внутри папки оборудования (для сортировки фото и документов)
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

При загрузке фото в выбранную папку Google Drive (или подпапку внутри папки оборудования):
- Если пользователь указал ссылку/ID папки — используй её как папку назначения
- Если папку не указал, но есть контекст оборудования с googleDriveUrl — используй её как базовую папку
- Если нужен путь подпапок (например "Фото/2026-03-26/До ремонта"):
  1) вызови ensure_drive_folder_path({parent_folder_url: googleDriveUrl, subfolder_path: "..."})
  2) загрузи фото через upload_photos_to_folder({folder_url: "<итоговая папка>", photos: [...]})
- Перед ensure_drive_folder_path и upload_photos_to_folder ВСЕГДА запрашивай подтверждение у пользователя

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
    - get_invoice_file — данные счёта из БД + возможность скачать PDF.
      После вызова get_invoice_file для каждого найденного счёта ОБЯЗАТЕЛЬНО добавь кнопку скачивания в формате:
      [📄 Открыть PDF {account_number}-{period}.pdf](pdf:{period}:{account_number})
      Например: [📄 Открыть PDF 107.00-2025-08.pdf](pdf:2025-08:107.00)
      Эта ссылка будет автоматически преобразована в кнопку скачивания в интерфейсе.

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

  /**
   * Стриминговый чат с настоящим SSE-стримингом финального текста.
   *
   * Алгоритм:
   *   1. Для каждого запроса в агентном цикле используем messages.stream().
   *   2. Если ответ содержит tool_use — эмитим tool_call события, выполняем
   *      инструменты, добавляем результаты в историю и повторяем.
   *   3. Если ответ содержит текст — эмитим text_delta в реальном времени
   *      (символы появляются на фронтенде по мере генерации).
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

    const claudeMessages: Anthropic.MessageParam[] = messages.map(msg => ({
      role: msg.role,
      content: msg.content as string | Anthropic.ContentBlockParam[],
    }));

    const claudeTools = convertToClaudeTools(tools);
    const systemPrompt = this.getSystemPrompt(equipmentContext, waterContext, memoryContext);

    let iteration = 0;

    while (iteration < this.MAX_ITERATIONS) {
      iteration++;

      // Накопленные блоки контента из потока
      const responseContent: Anthropic.ContentBlock[] = [];
      const toolInputAccumulator: Record<number, string> = {};
      let stopReason = '';

      // Стриминговый запрос к Claude
      const stream = this.client.messages.stream({
        model: this.model,
        max_tokens: 4096,
        system: systemPrompt,
        tools: claudeTools,
        messages: claudeMessages,
      });

      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          const block = event.content_block;
          if (block.type === 'tool_use') {
            responseContent[event.index] = { ...block, input: {} };
            toolInputAccumulator[event.index] = '';
          } else if (block.type === 'text') {
            responseContent[event.index] = { type: 'text', text: '', citations: [] } as Anthropic.TextBlock;
          }
        } else if (event.type === 'content_block_delta') {
          const delta = event.delta;
          if (delta.type === 'text_delta') {
            // Стриминг текста в реальном времени!
            onEvent({ type: 'text_delta', delta: delta.text });
            const textBlock = responseContent[event.index] as Anthropic.TextBlock;
            if (textBlock) textBlock.text = (textBlock.text || '') + delta.text;
          } else if (delta.type === 'input_json_delta') {
            toolInputAccumulator[event.index] = (toolInputAccumulator[event.index] || '') + delta.partial_json;
          }
        } else if (event.type === 'message_delta') {
          stopReason = event.delta.stop_reason || '';
        }
      }

      // Парсим JSON ввода инструментов из накопленных строк
      for (const [idx, jsonStr] of Object.entries(toolInputAccumulator)) {
        const toolBlock = responseContent[parseInt(idx)] as Anthropic.ToolUseBlock;
        if (toolBlock && jsonStr) {
          try {
            toolBlock.input = JSON.parse(jsonStr) as Record<string, unknown>;
          } catch {
            toolBlock.input = {};
          }
        }
      }

      // Если не tool_use — финальный ответ уже был заэмичен через text_delta
      if (stopReason !== 'tool_use') {
        onEvent({ type: 'done', toolsUsed, provider: this.name });
        return;
      }

      // Выполняем инструменты параллельно
      const toolCalls = extractClaudeToolCalls(responseContent);
      toolCalls.forEach(tc => { onEvent({ type: 'tool_call', name: tc.name }); toolsUsed.push(tc.name); this.log(`Выполняю инструмент (стриминг): ${tc.name}`); });

      const toolResults = await Promise.all(toolCalls.map(async (toolCall) => {
        try {
          const result = await executeToolCall(toolCall.name, toolCall.input);
          return { id: toolCall.id, result, isError: false };
        } catch (error) {
          this.logError(`Инструмент ${toolCall.name} завершился ошибкой`, error);
          return { id: toolCall.id, result: `Ошибка: ${error instanceof Error ? error.message : String(error)}`, isError: true };
        }
      }));

      // Добавляем ответ агента и результаты инструментов в историю
      claudeMessages.push({ role: 'assistant', content: responseContent });
      claudeMessages.push({ role: 'user', content: formatClaudeToolResults(toolResults) });
    }

    onEvent({ type: 'error', message: 'Превышен лимит итераций агента' });
  }
}
