/**
 * anthropic.ts
 *
 * Сервис для взаимодействия с Claude API (Anthropic).
 *
 * Это "мозг" AI-консультанта. Файл отвечает за:
 * 1. Отправку сообщений пользователя в Claude API
 * 2. Обработку tool calls (вызовы инструментов — поиск оборудования, чтение файлов и т.д.)
 * 3. Возврат финального текстового ответа пользователю
 *
 * Схема работы (agentic loop — агентный цикл):
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ 1. Пользователь: "Покажи журнал обслуживания фильтра ФО-0,8"      │
 * │                          ↓                                         │
 * │ 2. Claude анализирует запрос и решает вызвать tool:                │
 * │    → tool_use: search_equipment({search: "ФО-0,8"})               │
 * │                          ↓                                         │
 * │ 3. Сервер выполняет tool и возвращает результат Claude             │
 * │    → tool_result: [{id: "abc", name: "Фильтр ФО-0,8-1,5"}]       │
 * │                          ↓                                         │
 * │ 4. Claude видит результат и вызывает ещё один tool:               │
 * │    → tool_use: get_maintenance_log({equipmentId: "abc"})          │
 * │                          ↓                                         │
 * │ 5. Сервер выполняет tool, возвращает журнал                       │
 * │                          ↓                                         │
 * │ 6. Claude формирует финальный текстовый ответ пользователю        │
 * │    → stop_reason: "end_turn"                                      │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Цикл повторяется, пока Claude не перестанет вызывать tools
 * (stop_reason меняется с "tool_use" на "end_turn").
 */

// Официальный SDK Anthropic для работы с Claude API
import Anthropic from '@anthropic-ai/sdk';

// Конфигурация (API ключ, модель)
import { config } from '../config/env.js';

// Определения tools (инструментов) и функция их выполнения
import { tools, executeToolCall } from '../tools/index.js';

// ============================================
// Инициализация клиента Anthropic
// ============================================

/**
 * Создаём клиент Anthropic SDK.
 *
 * apiKey — секретный ключ, начинается с "sk-ant-..."
 * Получить: https://console.anthropic.com/settings/keys
 *
 * Клиент создаётся один раз при загрузке модуля
 * и переиспользуется для всех запросов.
 */
const anthropic = new Anthropic({
  apiKey: config.anthropicApiKey,
});

// ============================================
// Системный промпт
// ============================================

/**
 * Системный промпт определяет "личность" и поведение AI.
 *
 * Claude получает этот промпт с КАЖДЫМ запросом,
 * но пользователь его не видит — это "закулисные" инструкции.
 *
 * Важные моменты:
 * - Описываем ЧТО умеет консультант (список возможностей)
 * - Задаём ПРАВИЛА поведения (подтверждение перед записью, формат даты)
 * - Указываем ЯЗЫК и СТИЛЬ ответов
 * - Передаём текущую дату (Claude не знает какой сегодня день)
 */
const SYSTEM_PROMPT = `Ты — AI-консультант по обслуживанию оборудования на производстве.
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

// ============================================
// Типы
// ============================================

/**
 * Блок текста в мультимодальном сообщении.
 */
export interface TextContentBlock {
  type: 'text';
  text: string;
}

/**
 * Блок изображения в мультимодальном сообщении.
 */
export interface ImageContentBlock {
  type: 'image';
  source: {
    type: 'base64';
    media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
    data: string; // Base64 строка без префикса data:image/...
  };
}

/**
 * Сообщение в чате (от пользователя или ассистента).
 *
 * Поддерживает два формата:
 * 1. Простой текст: content: "текст сообщения"
 * 2. Мультимодальный: content: [{ type: 'text', text: '...' }, { type: 'image', source: {...} }]
 *
 * Мультимодальный формат используется для отправки фото вместе с текстом.
 */
export interface ChatMessage {
  /** Кто отправил: 'user' — пользователь, 'assistant' — AI */
  role: 'user' | 'assistant';

  /** Содержимое сообщения: текст или массив блоков (текст + изображения) */
  content: string | Array<TextContentBlock | ImageContentBlock>;
}

/**
 * Входящий запрос на обработку чата.
 *
 * Приходит с фронтенда через POST /api/chat.
 */
export interface ChatRequest {
  /** История сообщений (вся переписка для контекста) */
  messages: ChatMessage[];

  /** ID авторизованного пользователя (из Supabase) */
  userId: string;
}

/**
 * Ответ от AI-консультанта.
 *
 * Возвращается на фронтенд.
 */
export interface ChatResponse {
  /** Текстовый ответ от Claude */
  message: string;

  /**
   * Список tools, которые Claude вызвал для формирования ответа.
   * Опционально — для отладки и отображения в UI.
   *
   * @example ['search_equipment', 'get_maintenance_log']
   */
  toolsUsed?: string[];
}

// ============================================
// Основная функция
// ============================================

/**
 * Обработка сообщения чата через Claude API.
 *
 * Это главная функция файла. Реализует "agentic loop" —
 * цикл, в котором Claude может многократно вызывать tools,
 * пока не сформирует финальный ответ.
 *
 * @param request - Запрос с историей сообщений и ID пользователя
 * @returns Ответ с текстом и списком использованных tools
 *
 * @example
 * const response = await processChatMessage({
 *   messages: [{ role: 'user', content: 'Найди фильтр ФО-0,8' }],
 *   userId: 'abc-123',
 * });
 * console.log(response.message);   // "Найден фильтр: ФО-0,8-1,5..."
 * console.log(response.toolsUsed); // ['search_equipment']
 */
export async function processChatMessage(request: ChatRequest): Promise<ChatResponse> {
  try {

    // Защита от бесконечного цикла
    let iteration = 0;
    const MAX_ITERATIONS = config.maxAgentIterations || 10;

    // Массив для сбора имён вызванных tools (для отладки/UI)
    const toolsUsed: string[] = [];

    // ----------------------------------------
    // Шаг 1: Подготовка сообщений
    // ----------------------------------------

    // Преобразуем наш формат ChatMessage[] в формат Anthropic API.
    // Anthropic ожидает массив объектов { role, content }.
    // На этом этапе формат совпадает, но типы разные.
    const messages: Anthropic.MessageParam[] = request.messages.map(msg => ({
      role: msg.role,
      content: msg.content,
    }));

    // ----------------------------------------
    // Шаг 2: Первый запрос к Claude
    // ----------------------------------------

    // Отправляем всю историю переписки + системный промпт + определения tools.
    // Claude проанализирует контекст и либо:
    // а) Сразу ответит текстом (stop_reason: "end_turn")
    // б) Запросит вызов tool (stop_reason: "tool_use")
    let response = await anthropic.messages.create({
      model: config.claudeModel,    // Модель: "claude-sonnet-4-20250514" и т.д.
      max_tokens: 4096,             // Максимум токенов в ответе
      system: SYSTEM_PROMPT,        // Системные инструкции
      tools: tools,                 // Доступные инструменты (поиск, чтение файлов и др.)
      messages: messages,           // История переписки
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
    while (response.stop_reason === 'tool_use' && iteration < MAX_ITERATIONS) {

      iteration++;

      if (iteration === MAX_ITERATIONS) {
        throw new Error('AI агент превысил максимальное количество шагов анализа');
      }

      // Извлекаем блоки tool_use из ответа Claude.
      // Ответ Claude может содержать несколько блоков разных типов:
      // - TextBlock (текст)
      // - ToolUseBlock (вызов инструмента)
      // Фильтруем только ToolUseBlock
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      // Массив результатов выполнения tools
      // (формат ToolResultBlockParam требуется Anthropic API)
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      // Выполняем каждый tool по очереди
      for (const toolUse of toolUseBlocks) {
        console.log(`Executing tool: ${toolUse.name}`);
        toolsUsed.push(toolUse.name);

        try {
          // executeToolCall — вызывает соответствующую функцию
          // (например, search_equipment → запрос к GAS API)
          // toolUse.input — параметры, которые Claude передал инструменту
          const result = await executeToolCall(toolUse.name, toolUse.input as Record<string, unknown>);

          // Успешный результат: передаём JSON строку обратно Claude
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,       // ID вызова (связывает запрос с результатом)
            content: JSON.stringify(result), // Результат в виде JSON строки
          });
        } catch (error) {
          // Ошибка выполнения: сообщаем Claude об ошибке.
          // is_error: true — Claude поймёт, что tool не сработал
          // и может попробовать другой подход или сообщить пользователю
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: `Ошибка выполнения: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
            is_error: true,
          });
        }
      }

      // ----------------------------------------
      // Шаг 4: Отправляем результаты tools обратно Claude
      // ----------------------------------------

      // Добавляем ответ Claude (с tool_use блоками) в историю
      // как сообщение от assistant
      messages.push({
        role: 'assistant',
        content: response.content,
      });

      // Добавляем результаты tools как сообщение от user.
      // Это особенность Anthropic API: результаты tools
      // передаются в роли "user" с типом "tool_result"
      messages.push({
        role: 'user',
        content: toolResults,
      });

      // Повторный запрос к Claude с обновлённой историей.
      // Claude увидит результаты tools и либо:
      // - Вызовет ещё один tool (цикл продолжится)
      // - Сформирует текстовый ответ (цикл завершится)
      response = await anthropic.messages.create({
        model: config.claudeModel,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: tools,
        messages: messages,
      });
    }

    // ----------------------------------------
    // Шаг 5: Извлекаем финальный текстовый ответ
    // ----------------------------------------

    // После выхода из цикла, ответ содержит текстовый блок.
    // Ищем первый TextBlock в массиве content
    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );

    // Возвращаем текст и список использованных tools
    return {
      message: textBlock?.text || 'Не удалось получить ответ',
      toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
    };

  } catch (error) {
    // ----------------------------------------
    // Обработка ошибок API
    // ----------------------------------------

    console.error('Claude API error:', error);

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
