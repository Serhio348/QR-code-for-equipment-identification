/**
 * GeminiProvider.ts
 *
 * Провайдер для Google Gemini API.
 * Реализует интерфейс AIProvider для работы с Gemini.
 */

import { GoogleGenerativeAI, Content } from '@google/generative-ai';
import { BaseAIProvider } from '../AIProvider.js';
import { ChatMessage, ChatResponse, ToolDefinition, EquipmentContext, WaterDashboardContext, MemoryContext } from '../types.js';
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
    userId: string,
    equipmentContext?: EquipmentContext,
    waterContext?: WaterDashboardContext,
    memoryContext?: MemoryContext
  ): Promise<ChatResponse> {
    try {
      // Защита от бесконечного цикла
      let iteration = 0;

      // Массив для сбора имён вызванных tools
      const toolsUsed: string[] = [];

      // ----------------------------------------
      // Шаг 1: Подготовка модели и сообщений
      // ----------------------------------------

      // Создаём модель с системным промптом и tools (с учётом контекста оборудования)
      const genAI = this.client.getGenerativeModel({
        model: this.model,
        systemInstruction: this.getSystemPrompt(equipmentContext, waterContext),
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

      // Gemini выбрасывает ошибки с различными кодами в сообщении
      if (error instanceof Error) {
        const errorMessage = error.message || '';

        // 429 — слишком много запросов (rate limit)
        if (errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
          throw new Error(
            '⚠️ Превышен лимит запросов Gemini API\n\n' +
            'Код ошибки: 429 (Resource Exhausted)\n' +
            'Причина: Превышен бесплатный лимит (15 запросов/минуту для gemini-1.5-pro).\n\n' +
            'Что делать:\n' +
            '• Подождите 1 минуту и повторите запрос\n' +
            '• Используйте более быструю модель: gemini-1.5-flash (60 запросов/минуту)\n' +
            '• Перейдите на платный тариф на https://aistudio.google.com\n' +
            '• Настройте fallback на Claude в переменных окружения'
          );
        }

        // 401, 403 — неверный API ключ или доступ запрещен
        if (errorMessage.includes('401') || errorMessage.includes('403') ||
            errorMessage.includes('API_KEY_INVALID') || errorMessage.includes('PERMISSION_DENIED')) {
          throw new Error(
            '🔒 Ошибка авторизации Gemini API\n\n' +
            'Код ошибки: 401/403 (Unauthorized/Permission Denied)\n' +
            'Причина: Неверный API ключ или доступ запрещен.\n\n' +
            'Что делать:\n' +
            '• Проверьте, что переменная GEMINI_API_KEY установлена правильно\n' +
            '• Создайте новый API ключ на https://aistudio.google.com/app/apikey\n' +
            '• Убедитесь, что ключ начинается с "AIza"\n' +
            '• ВАЖНО: API ключ должен быть от того же Google аккаунта, что и проект'
          );
        }

        // 405 — метод не разрешён
        if (errorMessage.includes('405') || errorMessage.includes('METHOD_NOT_ALLOWED')) {
          throw new Error(
            '🚫 Неподдерживаемый метод запроса к Gemini API\n\n' +
            'Код ошибки: 405 (Method Not Allowed)\n' +
            'Причина: Использован неправильный HTTP метод (GET вместо POST или наоборот).\n\n' +
            'Что делать:\n' +
            '• Это ошибка в коде приложения, не в настройках\n' +
            '• Обратитесь к администратору системы\n' +
            '• Проверьте версию SDK @google/generative-ai (должна быть актуальной)'
          );
        }

        // 400 — неверный запрос
        if (errorMessage.includes('400') || errorMessage.includes('INVALID_ARGUMENT')) {
          throw new Error(
            '❌ Неверный формат запроса к Gemini API\n\n' +
            'Код ошибки: 400 (Invalid Argument)\n' +
            `Детали: ${errorMessage}\n\n` +
            'Причина: API не смог обработать запрос из-за неверного формата данных.\n\n' +
            'Возможные причины:\n' +
            '• Слишком большое изображение (макс. 10MB)\n' +
            '• Неподдерживаемый формат данных\n' +
            '• Слишком длинный текст запроса'
          );
        }

        // 500, 502, 503 — ошибки на стороне сервера
        if (errorMessage.includes('500') || errorMessage.includes('502') ||
            errorMessage.includes('503') || errorMessage.includes('INTERNAL') ||
            errorMessage.includes('UNAVAILABLE')) {
          throw new Error(
            '🔧 Технические проблемы на стороне Gemini API\n\n' +
            'Код ошибки: 500+ (Server Error)\n' +
            'Причина: Временные проблемы с серверами Google.\n\n' +
            'Что делать:\n' +
            '• Подождите 5-10 минут и повторите запрос\n' +
            '• Проверьте статус сервиса на https://status.cloud.google.com\n' +
            '• Используйте fallback на Claude (если настроен)\n' +
            '• Если проблема сохраняется, попробуйте другую модель'
          );
        }

        // Ошибка квоты (бесплатный лимит исчерпан)
        if (errorMessage.includes('QUOTA') || errorMessage.includes('quota')) {
          throw new Error(
            '💳 Исчерпан бесплатный лимит Gemini API\n\n' +
            'Код ошибки: Quota Exceeded\n' +
            'Причина: Бесплатный лимит исчерпан (например, лимит на день или месяц).\n\n' +
            'Что делать:\n' +
            '• Подождите до следующего дня/месяца\n' +
            '• Перейдите на платный тариф: https://aistudio.google.com/app/pricing\n' +
            '• Используйте Claude как основной провайдер\n' +
            '• Проверьте квоты: https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com/quotas'
          );
        }

        // Прочие ошибки Gemini
        throw new Error(
          `⚠️ Ошибка Gemini API\n\n` +
          `Детали: ${errorMessage}\n\n` +
          'Рекомендации:\n' +
          '• Попробуйте повторить запрос\n' +
          '• Настройте fallback на Claude\n' +
          '• Обратитесь к администратору системы'
        );
      }

      // Прочие ошибки (не Error)
      throw new Error(
        '❌ Неизвестная ошибка при работе с Gemini API\n\n' +
        'Обратитесь к администратору системы.'
      );
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
    } catch (error) {
      console.error('[GeminiProvider] Not available:', error instanceof Error ? error.message : error);
      return false;
    }
  }

  /**
   * Системный промпт для Gemini
   */
  private getSystemPrompt(equipmentContext?: EquipmentContext, waterContext?: WaterDashboardContext, memoryContext?: MemoryContext): string {
    const waterInfo = waterContext
      ? `\n\nТЕКУЩИЙ КОНТЕКСТ ВОДНОГО ДАШБОРДА (${waterContext.monthLabel}):
• Скважина (вход): ${waterContext.sourceMonth.toLocaleString('ru')} м³
• Производство: ${waterContext.productionMonth.toLocaleString('ru')} м³
• Хоз-питьевое водоснабжение: ${waterContext.domesticMonth.toLocaleString('ru')} м³
• Потери: ${waterContext.lossesMonth.toLocaleString('ru')} м³ (${waterContext.lossesPct}%)
  - Умягчённая вода (месяц): ${waterContext.softenedWaterMonth.toLocaleString('ru')} м³
  - Промывка (скважина − умягчённая): ${waterContext.filterLoss} м³
  - Осмос (умягчённая − производственные нужды): ${waterContext.osmosisLoss} м³
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
