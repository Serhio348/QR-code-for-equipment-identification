# План реализации Multi-Provider архитектуры для AI-консультанта

> **Цель:** Создать универсальную систему, поддерживающую несколько LLM провайдеров (Claude, Gemini, OpenAI, Ollama) с возможностью переключения через конфигурацию.

## 🚀 Быстрый старт

**У вас уже есть рабочий Claude!** Не нужно всё переписывать с нуля.

### Что делаем:
1. ✅ **Рефакторим** существующий `anthropic.ts` → класс `ClaudeProvider` (1-2 часа)
2. ✅ **Добавляем** Gemini провайдер для бесплатного использования (2-3 часа)
3. ✅ **Создаём** фабрику для переключения между провайдерами (30 минут)
4. ✅ **Тестируем** и деплоим на Railway (1 час)

**Итого:** 4-6 часов работы, 90% кода уже готов!

### С чего начать:
👉 Перейдите к разделу ["Миграция существующего кода Claude"](#миграция-существующего-кода-claude)

---

## 📋 Содержание

1. [Обзор архитектуры](#обзор-архитектуры)
2. [Миграция существующего кода Claude](#миграция-существующего-кода-claude) ⭐ **НАЧНИТЕ ЗДЕСЬ**
3. [Структура файлов](#структура-файлов)
4. [Пошаговая реализация](#пошаговая-реализация)
5. [Адаптация Tool Calling](#адаптация-tool-calling)
6. [Конфигурация и переменные окружения](#конфигурация-и-переменные-окружения)
7. [Тестирование](#тестирование)
8. [Деплой на Railway](#деплой-на-railway)
9. [Дополнительные возможности](#дополнительные-возможности)

---

## 🏗️ Обзор архитектуры

### Текущая архитектура (только Claude)

```
chat.ts → anthropic.ts → Claude API
                ↓
            tools/index.ts
```

### Новая архитектура (Multi-Provider)

```
chat.ts → ProviderFactory → AIProvider (интерфейс)
                               ↓
              ┌────────────────┼────────────────┐
              ↓                ↓                ↓
         ClaudeProvider   GeminiProvider   OpenAIProvider
              ↓                ↓                ↓
         Claude API       Gemini API       OpenAI API
              ↓                ↓                ↓
                    tools/index.ts
```

### Ключевые компоненты

1. **AIProvider (интерфейс)** - единый интерфейс для всех провайдеров
2. **Провайдеры** - адаптеры для каждого AI сервиса
3. **ProviderFactory** - фабрика для создания нужного провайдера
4. **Tool Adapters** - адаптация tool calling под формат каждого провайдера

---

## ⭐ Миграция существующего кода Claude

> **ВАЖНО:** У вас уже есть полностью рабочая реализация Claude в файле `ai-consultant-api/src/services/anthropic.ts`. Не нужно переписывать его с нуля - просто рефакторим под новую архитектуру!

### Что уже есть (не нужно создавать заново):

✅ **Полная реализация Claude API** в `anthropic.ts`
✅ **Агентный цикл (agentic loop)** с tool calling
✅ **Системный промпт** с русским языком
✅ **Обработка ошибок** и таймаутов
✅ **Поддержка мультимодального контента** (текст + фото)
✅ **Интеграция с вашими tools** через `executeToolCall`

### Что нужно сделать:

1. ✅ Создать интерфейс `AIProvider` (новый)
2. ✅ Создать адаптер `claudeToolAdapter.ts` (новый, но логика уже есть в `anthropic.ts`)
3. ✅ **Рефакторить** `anthropic.ts` → `ClaudeProvider.ts` (90% кода остаётся как есть)
4. ✅ Создать `GeminiProvider.ts` (новый)
5. ✅ Создать `OpenAIProvider.ts` (новый, опционально)
6. ✅ Создать `ProviderFactory.ts` (новый)
7. ✅ Обновить `chat.ts` для использования фабрики

### Быстрая миграция в 3 шага:

#### Шаг 1: Создать базовую структуру (5 минут)

```bash
cd ai-consultant-api/src/services
mkdir ai
cd ai
mkdir providers adapters
```

Создать файлы:
- `types.ts` - скопировать типы из `anthropic.ts`
- `AIProvider.ts` - новый интерфейс

#### Шаг 2: Рефакторить существующий код Claude (10 минут)

**Было:** `anthropic.ts` (370 строк)
**Станет:** `providers/ClaudeProvider.ts` + `adapters/claudeToolAdapter.ts`

**Что меняется:**
1. Обернуть код в класс `ClaudeProvider implements AIProvider`
2. Переименовать `processChatMessage()` → `chat()`
3. Вынести логику конвертации tools в адаптер
4. Добавить метод `isAvailable()`

**Что НЕ меняется:**
- ✅ Агентный цикл остаётся как есть
- ✅ Системный промпт остаётся как есть
- ✅ Обработка ошибок остаётся как есть
- ✅ Tool calling логика остаётся как есть

**Пример изменений:**

```typescript
// БЫЛО в anthropic.ts:
export async function processChatMessage(request: ChatRequest): Promise<ChatResponse> {
  const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
  // ... 300+ строк кода ...
}

// СТАЛО в ClaudeProvider.ts:
export class ClaudeProvider extends BaseAIProvider {
  readonly name = 'Claude';
  private client: Anthropic;

  constructor(apiKey: string, model: string) {
    super();
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async chat(messages: ChatMessage[], tools: ToolDefinition[], userId: string): Promise<ChatResponse> {
    // ⬇️ СКОПИРОВАТЬ СЮДА ВСЮ ЛОГИКУ ИЗ processChatMessage()
    // (90% кода остаётся без изменений)
  }
}
```

#### Шаг 3: Добавить новые провайдеры (15-20 минут каждый)

Создать `GeminiProvider.ts` и `OpenAIProvider.ts` по примеру из документа.

### Детальная инструкция по рефакторингу Claude

#### 1. Создать `adapters/claudeToolAdapter.ts`

Вынести 3 функции из `anthropic.ts`:

```typescript
// Из anthropic.ts строки 262-264:
const toolUseBlocks = response.content.filter(
  (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
);

// Становится:
export function extractClaudeToolCalls(content: Anthropic.ContentBlock[]) {
  return content
    .filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')
    .map(block => ({
      id: block.id,
      name: block.name,
      input: block.input as Record<string, unknown>,
    }));
}
```

```typescript
// Из anthropic.ts строки 282-296:
toolResults.push({
  type: 'tool_result',
  tool_use_id: toolUse.id,
  content: JSON.stringify(result),
  is_error: isError,
});

// Становится:
export function formatClaudeToolResults(results) {
  return results.map(({ id, result, isError }) => ({
    type: 'tool_result' as const,
    tool_use_id: id,
    content: JSON.stringify(result),
    is_error: isError,
  }));
}
```

#### 2. Создать `providers/ClaudeProvider.ts`

**Шаблон:**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { BaseAIProvider } from '../AIProvider.js';
import { ChatMessage, ChatResponse, ToolDefinition } from '../types.js';
import {
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

  async chat(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    userId: string
  ): Promise<ChatResponse> {
    // ⬇️⬇️⬇️ СКОПИРОВАТЬ СЮДА КОД ИЗ processChatMessage() ⬇️⬇️⬇️
    // Строки 200-346 из anthropic.ts
    // Заменить:
    // - config.claudeModel → this.model
    // - anthropic.messages.create → this.client.messages.create
    // - extractClaudeToolCalls(response.content) вместо filter()
    // - formatClaudeToolResults(toolResults) вместо ручного создания
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.messages.create({
        model: this.model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'test' }],
      });
      return true;
    } catch {
      return false;
    }
  }

  private getSystemPrompt(): string {
    // ⬇️ СКОПИРОВАТЬ КОНСТАНТУ SYSTEM_PROMPT из anthropic.ts (строки 76-104)
    return `Ты — AI-консультант по обслуживанию оборудования...`;
  }
}
```

#### 3. Тестирование после рефакторинга

После создания `ClaudeProvider` - протестируйте его отдельно:

```typescript
// test-claude.ts
import { ClaudeProvider } from './services/ai/providers/ClaudeProvider.js';
import { tools } from './tools/index.js';

const provider = new ClaudeProvider('your-api-key');

const response = await provider.chat(
  [{ role: 'user', content: 'Найди все оборудование' }],
  tools,
  'test-user'
);

console.log(response.message);
```

Если работает - значит миграция успешна! ✅

### Преимущества такого подхода:

✅ **Сохраняете весь рабочий код** - не нужно переписывать с нуля
✅ **Минимальные изменения** - 90% кода остаётся как есть
✅ **Постепенная миграция** - сначала рефакторите Claude, потом добавляете другие провайдеры
✅ **Обратная совместимость** - старый `anthropic.ts` можно оставить до полной миграции

### Сравнение объёма работы:

| Подход | Время | Сложность |
|--------|-------|-----------|
| **С нуля (все провайдеры)** | 2-3 дня | 🔴 Высокая |
| **Рефакторинг Claude → добавить Gemini** | 4-6 часов | 🟡 Средняя |
| **Только рефакторинг Claude** | 1-2 часа | 🟢 Низкая |

**Рекомендация:** Начните с рефакторинга Claude (1-2 часа), протестируйте, потом добавьте Gemini (2-3 часа).

---

## 📁 Структура файлов

Создайте следующую структуру в `ai-consultant-api/src/`:

```
src/
├── services/
│   ├── ai/                              # Новая папка для AI провайдеров
│   │   ├── types.ts                     # Общие типы и интерфейсы
│   │   ├── AIProvider.ts                # Базовый интерфейс провайдера
│   │   ├── providers/
│   │   │   ├── ClaudeProvider.ts        # Anthropic Claude
│   │   │   ├── GeminiProvider.ts        # Google Gemini
│   │   │   ├── OpenAIProvider.ts        # OpenAI GPT
│   │   │   └── OllamaProvider.ts        # Ollama (опционально)
│   │   ├── adapters/
│   │   │   ├── claudeToolAdapter.ts     # Адаптер tools для Claude
│   │   │   ├── geminiToolAdapter.ts     # Адаптер tools для Gemini
│   │   │   ├── openaiToolAdapter.ts     # Адаптер tools для OpenAI
│   │   │   └── ollamaToolAdapter.ts     # Адаптер tools для Ollama
│   │   ├── ProviderFactory.ts           # Фабрика провайдеров
│   │   └── index.ts                     # Экспорт
│   ├── anthropic.ts                     # СТАРЫЙ (удалить после миграции)
│   └── gasClient.ts
├── config/
│   └── env.ts                           # Обновить для multi-provider
├── routes/
│   └── chat.ts                          # Обновить для использования фабрики
└── tools/
    └── index.ts                         # Без изменений
```

---

## 🔨 Пошаговая реализация

### Шаг 1: Создать общие типы и интерфейс AIProvider

**Файл:** `src/services/ai/types.ts`

```typescript
/**
 * Общие типы для всех AI провайдеров
 */

// Блок текста в мультимодальном сообщении
export interface TextContentBlock {
  type: 'text';
  text: string;
}

// Блок изображения в мультимодальном сообщении
export interface ImageContentBlock {
  type: 'image';
  source: {
    type: 'base64';
    media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
    data: string; // Base64 без префикса
  };
}

// Сообщение в чате
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string | Array<TextContentBlock | ImageContentBlock>;
}

// Запрос к AI
export interface ChatRequest {
  messages: ChatMessage[];
  userId: string;
}

// Ответ от AI
export interface ChatResponse {
  message: string;
  toolsUsed?: string[];
  provider?: string; // Новое: какой провайдер использовался
  tokensUsed?: {     // Новое: статистика токенов
    input: number;
    output: number;
  };
}

// Определение tool (инструмента)
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

// Вызов tool от AI
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

// Результат выполнения tool
export interface ToolResult {
  id: string;
  result: unknown;
  isError?: boolean;
}
```

**Файл:** `src/services/ai/AIProvider.ts`

```typescript
import {
  ChatMessage,
  ChatResponse,
  ToolDefinition,
  ToolCall,
  ToolResult,
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
   * @returns Ответ от AI
   */
  chat(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    userId: string
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
    userId: string
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
```

---

### Шаг 2: Создать адаптеры для Tool Calling

> **Важно:** Каждый провайдер использует свой формат для tool calling. Адаптеры конвертируют наш универсальный формат в формат конкретного провайдера.

#### Шаг 2.1: Адаптер для Claude (Anthropic)

**Файл:** `src/services/ai/adapters/claudeToolAdapter.ts`

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { ToolDefinition } from '../types.js';

/**
 * Конвертирует универсальный формат tool в формат Anthropic API.
 *
 * Anthropic использует JSON Schema напрямую в input_schema.
 */
export function convertToClaudeTools(tools: ToolDefinition[]): Anthropic.Tool[] {
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.input_schema,
  }));
}

/**
 * Извлекает tool calls из ответа Claude
 */
export function extractClaudeToolCalls(
  content: Anthropic.ContentBlock[]
): Array<{ id: string; name: string; input: Record<string, unknown> }> {
  return content
    .filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')
    .map(block => ({
      id: block.id,
      name: block.name,
      input: block.input as Record<string, unknown>,
    }));
}

/**
 * Форматирует результаты tool для отправки обратно Claude
 */
export function formatClaudeToolResults(
  results: Array<{ id: string; result: unknown; isError?: boolean }>
): Anthropic.ToolResultBlockParam[] {
  return results.map(({ id, result, isError }) => ({
    type: 'tool_result' as const,
    tool_use_id: id,
    content: JSON.stringify(result),
    is_error: isError,
  }));
}
```

#### Шаг 2.2: Адаптер для Gemini (Google)

**Файл:** `src/services/ai/adapters/geminiToolAdapter.ts`

```typescript
import { ToolDefinition } from '../types.js';

/**
 * Конвертирует универсальный формат tool в формат Gemini API.
 *
 * Gemini использует "functionDeclarations" вместо "tools".
 * Формат parameters немного отличается от JSON Schema.
 */
export function convertToGeminiTools(tools: ToolDefinition[]) {
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: {
      type: 'object',
      properties: tool.input_schema.properties,
      required: tool.input_schema.required || [],
    },
  }));
}

/**
 * Извлекает function calls из ответа Gemini
 */
export function extractGeminiFunctionCalls(
  candidates: any[]
): Array<{ id: string; name: string; input: Record<string, unknown> }> {
  const calls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

  for (const candidate of candidates) {
    const functionCalls = candidate.content?.parts?.filter(
      (part: any) => part.functionCall
    );

    if (functionCalls) {
      functionCalls.forEach((call: any, index: number) => {
        calls.push({
          id: `call_${Date.now()}_${index}`, // Gemini не предоставляет ID, генерируем
          name: call.functionCall.name,
          input: call.functionCall.args || {},
        });
      });
    }
  }

  return calls;
}

/**
 * Форматирует результаты function для отправки обратно Gemini
 */
export function formatGeminiFunctionResults(
  results: Array<{ id: string; result: unknown; isError?: boolean }>
) {
  return results.map(({ result, isError }) => ({
    functionResponse: {
      name: 'function_result',
      response: {
        success: !isError,
        data: result,
      },
    },
  }));
}
```

#### Шаг 2.3: Адаптер для OpenAI (GPT)

**Файл:** `src/services/ai/adapters/openaiToolAdapter.ts`

```typescript
import { ToolDefinition } from '../types.js';

/**
 * Конвертирует универсальный формат tool в формат OpenAI API.
 *
 * OpenAI использует "functions" и JSON Schema в parameters.
 */
export function convertToOpenAITools(tools: ToolDefinition[]) {
  return tools.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  }));
}

/**
 * Извлекает tool calls из ответа OpenAI
 */
export function extractOpenAIToolCalls(
  message: any
): Array<{ id: string; name: string; input: Record<string, unknown> }> {
  if (!message.tool_calls) {
    return [];
  }

  return message.tool_calls.map((call: any) => ({
    id: call.id,
    name: call.function.name,
    input: JSON.parse(call.function.arguments),
  }));
}

/**
 * Форматирует результаты tool для отправки обратно OpenAI
 */
export function formatOpenAIToolResults(
  results: Array<{ id: string; result: unknown; isError?: boolean }>
) {
  return results.map(({ id, result }) => ({
    role: 'tool' as const,
    tool_call_id: id,
    content: JSON.stringify(result),
  }));
}
```

---

### Шаг 3: Реализовать провайдеры

#### Шаг 3.1: ClaudeProvider

> ⚠️ **ВАЖНО:** Большую часть кода для ClaudeProvider можно **скопировать из существующего файла** `anthropic.ts` (строки 200-370)! Не нужно писать с нуля - просто рефакторинг.

**Файл:** `src/services/ai/providers/ClaudeProvider.ts`

**Что делаем:**
1. Создаём класс `ClaudeProvider`
2. **Копируем** всю логику из функции `processChatMessage()` в метод `chat()`
3. **Заменяем** несколько переменных:
   - `config.claudeModel` → `this.model`
   - `anthropic.messages.create` → `this.client.messages.create`
4. **Используем** адаптеры вместо inline кода
5. Добавляем метод `isAvailable()`

```typescript
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

  async chat(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    userId: string
  ): Promise<ChatResponse> {
    try {
      const toolsUsed: string[] = [];
      let iteration = 0;

      // Системный промпт
      const systemPrompt = this.getSystemPrompt();

      // Конвертируем tools в формат Claude
      const claudeTools = convertToClaudeTools(tools);

      // Преобразуем сообщения в формат Claude
      const claudeMessages: Anthropic.MessageParam[] = messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      }));

      // Первый запрос к Claude
      let response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: systemPrompt,
        tools: claudeTools,
        messages: claudeMessages,
      });

      // Агентный цикл (tool calling loop)
      while (response.stop_reason === 'tool_use' && iteration < this.MAX_ITERATIONS) {
        iteration++;

        // Извлекаем tool calls
        const toolCalls = extractClaudeToolCalls(response.content);

        // Выполняем tools
        const toolResults = [];
        for (const call of toolCalls) {
          this.log(`Executing tool: ${call.name}`);
          toolsUsed.push(call.name);

          try {
            const result = await executeToolCall(call.name, call.input);
            toolResults.push({ id: call.id, result, isError: false });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            toolResults.push({ id: call.id, result: errorMessage, isError: true });
          }
        }

        // Добавляем ответ Claude и результаты tools в историю
        claudeMessages.push({
          role: 'assistant',
          content: response.content,
        });

        claudeMessages.push({
          role: 'user',
          content: formatClaudeToolResults(toolResults),
        });

        // Повторный запрос
        response = await this.client.messages.create({
          model: this.model,
          max_tokens: 4096,
          system: systemPrompt,
          tools: claudeTools,
          messages: claudeMessages,
        });
      }

      // Извлекаем текстовый ответ
      const textBlock = response.content.find(
        (block): block is Anthropic.TextBlock => block.type === 'text'
      );

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
      this.logError('Chat error', error);
      throw error;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Проверка доступности через простой запрос
      await this.client.messages.create({
        model: this.model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'test' }],
      });
      return true;
    } catch {
      return false;
    }
  }

  private getSystemPrompt(): string {
    return `Ты — AI-консультант по обслуживанию оборудования на производстве.
Твоя задача — помогать сотрудникам работать с оборудованием.

Ты можешь:
1. Искать оборудование по названию или характеристикам
2. Показывать информацию об оборудовании
3. Просматривать журнал обслуживания
4. Добавлять записи в журнал
5. Читать документацию (PDF файлы)
6. Искать файлы в папках Google Drive
7. Работать с фото обслуживания

При работе с фото:
- Анализируй изображения
- Запрашивай подтверждение перед загрузкой

При добавлении записей:
- Всегда запрашивай подтверждение
- Формат даты: YYYY-MM-DD

Отвечай кратко и по делу.
Язык общения: русский.

Текущая дата: ${new Date().toISOString().split('T')[0]}`;
  }
}
```

**📝 Маппинг изменений из `anthropic.ts`:**

| Было в anthropic.ts | Стало в ClaudeProvider.ts | Комментарий |
|---------------------|---------------------------|-------------|
| `const anthropic = new Anthropic(...)` | `this.client = new Anthropic(...)` | В конструкторе |
| `config.claudeModel` | `this.model` | Параметр конструктора |
| `config.anthropicApiKey` | `apiKey` параметр | Передаётся в конструктор |
| `SYSTEM_PROMPT` константа | `this.getSystemPrompt()` | Приватный метод |
| `export async function processChatMessage(...)` | `async chat(...)` | Метод класса |
| Строки 262-264 (filter tool_use) | `extractClaudeToolCalls()` | Адаптер |
| Строки 282-296 (создание tool_result) | `formatClaudeToolResults()` | Адаптер |
| `return { message, toolsUsed }` | `return { message, toolsUsed, provider: this.name, tokensUsed }` | Добавлены поля |

**Копируйте без изменений:**
- ✅ Весь агентный цикл (`while (response.stop_reason === 'tool_use')`)
- ✅ Логику выполнения tools (`for (const toolUse of toolUseBlocks)`)
- ✅ Обработку ошибок (`try/catch` блоки)
- ✅ Извлечение финального ответа (`response.content.find`)

#### Шаг 3.2: GeminiProvider

**Установите SDK:**
```bash
cd ai-consultant-api
npm install @google/generative-ai
```

**Файл:** `src/services/ai/providers/GeminiProvider.ts`

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';
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

  constructor(apiKey: string, model: string = 'gemini-1.5-pro') {
    super();
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = model;
  }

  async chat(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    userId: string
  ): Promise<ChatResponse> {
    try {
      const toolsUsed: string[] = [];
      let iteration = 0;

      // Конвертируем tools в формат Gemini
      const geminiTools = convertToGeminiTools(tools);

      // Создаем модель с tools
      const model = this.client.getGenerativeModel({
        model: this.model,
        tools: [{ functionDeclarations: geminiTools }],
        systemInstruction: this.getSystemPrompt(),
      });

      // Конвертируем историю в формат Gemini
      const geminiHistory = this.convertMessagesToGeminiFormat(messages.slice(0, -1));

      // Последнее сообщение пользователя
      const lastMessage = messages[messages.length - 1];
      const userMessage = typeof lastMessage.content === 'string'
        ? lastMessage.content
        : this.convertContentToGeminiParts(lastMessage.content);

      // Начинаем чат
      const chat = model.startChat({ history: geminiHistory });

      // Первый запрос
      let result = await chat.sendMessage(userMessage);

      // Агентный цикл
      while (iteration < this.MAX_ITERATIONS) {
        iteration++;

        const functionCalls = extractGeminiFunctionCalls(result.response.candidates || []);

        if (functionCalls.length === 0) {
          // Нет tool calls - получили финальный ответ
          break;
        }

        // Выполняем function calls
        const functionResults = [];
        for (const call of functionCalls) {
          this.log(`Executing function: ${call.name}`);
          toolsUsed.push(call.name);

          try {
            const result = await executeToolCall(call.name, call.input);
            functionResults.push({ id: call.id, result, isError: false });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            functionResults.push({ id: call.id, result: errorMessage, isError: true });
          }
        }

        // Отправляем результаты обратно
        const formattedResults = formatGeminiFunctionResults(functionResults);
        result = await chat.sendMessage(formattedResults);
      }

      // Извлекаем текстовый ответ
      const responseText = result.response.text();

      return {
        message: responseText || 'Не удалось получить ответ',
        toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
        provider: this.name,
        tokensUsed: {
          input: result.response.usageMetadata?.promptTokenCount || 0,
          output: result.response.usageMetadata?.candidatesTokenCount || 0,
        },
      };
    } catch (error) {
      this.logError('Chat error', error);
      throw error;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const model = this.client.getGenerativeModel({ model: this.model });
      await model.generateContent('test');
      return true;
    } catch {
      return false;
    }
  }

  private getSystemPrompt(): string {
    return `Ты — AI-консультант по обслуживанию оборудования на производстве.
Твоя задача — помогать сотрудникам работать с оборудованием.

Ты можешь:
1. Искать оборудование по названию или характеристикам
2. Показывать информацию об оборудовании
3. Просматривать журнал обслуживания
4. Добавлять записи в журнал
5. Читать документацию (PDF файлы)
6. Искать файлы в папках Google Drive
7. Работать с фото обслуживания

При работе с фото:
- Анализируй изображения
- Запрашивай подтверждение перед загрузкой

При добавлении записей:
- Всегда запрашивай подтверждение
- Формат даты: YYYY-MM-DD

Отвечай кратко и по делу.
Язык общения: русский.

Текущая дата: ${new Date().toISOString().split('T')[0]}`;
  }

  private convertMessagesToGeminiFormat(messages: ChatMessage[]) {
    return messages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: typeof msg.content === 'string'
        ? [{ text: msg.content }]
        : this.convertContentToGeminiParts(msg.content),
    }));
  }

  private convertContentToGeminiParts(content: any[]) {
    return content.map(block => {
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
      return { text: '' };
    });
  }
}
```

#### Шаг 3.3: OpenAIProvider

**Установите SDK:**
```bash
cd ai-consultant-api
npm install openai
```

**Файл:** `src/services/ai/providers/OpenAIProvider.ts`

```typescript
import OpenAI from 'openai';
import { BaseAIProvider } from '../AIProvider.js';
import { ChatMessage, ChatResponse, ToolDefinition } from '../types.js';
import {
  convertToOpenAITools,
  extractOpenAIToolCalls,
  formatOpenAIToolResults,
} from '../adapters/openaiToolAdapter.js';
import { executeToolCall } from '../../../tools/index.js';

export class OpenAIProvider extends BaseAIProvider {
  readonly name = 'OpenAI';
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string = 'gpt-4o') {
    super();
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async chat(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    userId: string
  ): Promise<ChatResponse> {
    try {
      const toolsUsed: string[] = [];
      let iteration = 0;

      // Конвертируем tools в формат OpenAI
      const openaiTools = convertToOpenAITools(tools);

      // Добавляем системное сообщение
      const openaiMessages: any[] = [
        { role: 'system', content: this.getSystemPrompt() },
        ...this.convertMessagesToOpenAIFormat(messages),
      ];

      // Первый запрос
      let response = await this.client.chat.completions.create({
        model: this.model,
        messages: openaiMessages,
        tools: openaiTools,
        tool_choice: 'auto',
      });

      // Агентный цикл
      while (iteration < this.MAX_ITERATIONS) {
        iteration++;

        const message = response.choices[0].message;

        // Проверяем наличие tool calls
        if (!message.tool_calls || message.tool_calls.length === 0) {
          // Нет tool calls - финальный ответ
          break;
        }

        // Добавляем ответ ассистента в историю
        openaiMessages.push(message);

        // Извлекаем tool calls
        const toolCalls = extractOpenAIToolCalls(message);

        // Выполняем tools
        const toolResults = [];
        for (const call of toolCalls) {
          this.log(`Executing tool: ${call.name}`);
          toolsUsed.push(call.name);

          try {
            const result = await executeToolCall(call.name, call.input);
            toolResults.push({ id: call.id, result, isError: false });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            toolResults.push({ id: call.id, result: errorMessage, isError: true });
          }
        }

        // Добавляем результаты в историю
        openaiMessages.push(...formatOpenAIToolResults(toolResults));

        // Повторный запрос
        response = await this.client.chat.completions.create({
          model: this.model,
          messages: openaiMessages,
          tools: openaiTools,
          tool_choice: 'auto',
        });
      }

      // Извлекаем финальный ответ
      const finalMessage = response.choices[0].message.content;

      return {
        message: finalMessage || 'Не удалось получить ответ',
        toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
        provider: this.name,
        tokensUsed: {
          input: response.usage?.prompt_tokens || 0,
          output: response.usage?.completion_tokens || 0,
        },
      };
    } catch (error) {
      this.logError('Chat error', error);
      throw error;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 5,
      });
      return true;
    } catch {
      return false;
    }
  }

  private getSystemPrompt(): string {
    return `Ты — AI-консультант по обслуживанию оборудования на производстве.
Твоя задача — помогать сотрудникам работать с оборудованием.

Ты можешь:
1. Искать оборудование по названию или характеристикам
2. Показывать информацию об оборудовании
3. Просматривать журнал обслуживания
4. Добавлять записи в журнал
5. Читать документацию (PDF файлы)
6. Искать файлы в папках Google Drive
7. Работать с фото обслуживания

При работе с фото:
- Анализируй изображения
- Запрашивай подтверждение перед загрузкой

При добавлении записей:
- Всегда запрашивай подтверждение
- Формат даты: YYYY-MM-DD

Отвечай кратко и по делу.
Язык общения: русский.

Текущая дата: ${new Date().toISOString().split('T')[0]}`;
  }

  private convertMessagesToOpenAIFormat(messages: ChatMessage[]) {
    return messages.map(msg => {
      if (typeof msg.content === 'string') {
        return { role: msg.role, content: msg.content };
      }

      // Мультимодальный контент
      const content = msg.content.map(block => {
        if (block.type === 'text') {
          return { type: 'text', text: block.text };
        } else if (block.type === 'image') {
          return {
            type: 'image_url',
            image_url: {
              url: `data:${block.source.media_type};base64,${block.source.data}`,
            },
          };
        }
        return null;
      }).filter(Boolean);

      return { role: msg.role, content };
    });
  }
}
```

---

### Шаг 4: Создать фабрику провайдеров

**Файл:** `src/services/ai/ProviderFactory.ts`

```typescript
import { AIProvider } from './AIProvider.js';
import { ClaudeProvider } from './providers/ClaudeProvider.js';
import { GeminiProvider } from './providers/GeminiProvider.js';
import { OpenAIProvider } from './providers/OpenAIProvider.js';
import { config } from '../../config/env.js';

export type ProviderType = 'claude' | 'gemini' | 'openai' | 'ollama';

/**
 * Фабрика для создания AI провайдера на основе конфигурации.
 *
 * Читает переменную AI_PROVIDER из .env и создаёт соответствующий провайдер.
 * Поддерживает fallback: если основной провайдер недоступен, использует запасной.
 */
export class ProviderFactory {
  /**
   * Создать провайдер на основе конфигурации
   */
  static async create(): Promise<AIProvider> {
    const primaryProvider = config.aiProvider as ProviderType;
    const fallbackProvider = config.fallbackProvider as ProviderType | undefined;

    console.log(`[ProviderFactory] Creating primary provider: ${primaryProvider}`);

    // Создаем основного провайдера
    let provider = this.createProvider(primaryProvider);

    // Проверяем доступность
    const isAvailable = await provider.isAvailable();

    if (!isAvailable && fallbackProvider) {
      console.warn(
        `[ProviderFactory] Primary provider ${primaryProvider} unavailable, using fallback: ${fallbackProvider}`
      );
      provider = this.createProvider(fallbackProvider);
    }

    return provider;
  }

  /**
   * Создать конкретный провайдер по типу
   */
  private static createProvider(type: ProviderType): AIProvider {
    switch (type) {
      case 'claude':
        if (!config.anthropicApiKey) {
          throw new Error('ANTHROPIC_API_KEY not configured');
        }
        return new ClaudeProvider(config.anthropicApiKey, config.claudeModel);

      case 'gemini':
        if (!config.geminiApiKey) {
          throw new Error('GEMINI_API_KEY not configured');
        }
        return new GeminiProvider(config.geminiApiKey, config.geminiModel);

      case 'openai':
        if (!config.openaiApiKey) {
          throw new Error('OPENAI_API_KEY not configured');
        }
        return new OpenAIProvider(config.openaiApiKey, config.openaiModel);

      case 'ollama':
        throw new Error('Ollama provider not implemented yet');

      default:
        throw new Error(`Unknown provider type: ${type}`);
    }
  }

  /**
   * Получить список доступных провайдеров
   */
  static getAvailableProviders(): ProviderType[] {
    const available: ProviderType[] = [];

    if (config.anthropicApiKey) available.push('claude');
    if (config.geminiApiKey) available.push('gemini');
    if (config.openaiApiKey) available.push('openai');

    return available;
  }
}
```

**Файл:** `src/services/ai/index.ts`

```typescript
export * from './types.js';
export * from './AIProvider.js';
export * from './ProviderFactory.js';
export * from './providers/ClaudeProvider.js';
export * from './providers/GeminiProvider.js';
export * from './providers/OpenAIProvider.js';
```

---

### Шаг 5: Обновить конфигурацию

**Файл:** `src/config/env.ts`

Добавьте новые переменные окружения:

```typescript
import dotenv from 'dotenv';

dotenv.config();

interface Config {
  // Существующие
  supabaseUrl: string;
  supabaseServiceKey: string;
  gasApiUrl: string;
  port: number;
  allowedOrigins: string[];
  maxAgentIterations: number;

  // AI Provider Configuration
  aiProvider: string;                    // claude | gemini | openai | ollama
  fallbackProvider?: string;             // Запасной провайдер

  // API Keys для разных провайдеров
  anthropicApiKey?: string;              // Claude
  geminiApiKey?: string;                 // Gemini
  openaiApiKey?: string;                 // OpenAI

  // Модели
  claudeModel: string;
  geminiModel: string;
  openaiModel: string;
}

function validateEnv(): Config {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
  const gasApiUrl = process.env.GAS_API_URL;

  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL is required');
  }

  if (!supabaseServiceKey) {
    throw new Error('SUPABASE_SERVICE_KEY is required');
  }

  if (!gasApiUrl) {
    throw new Error('GAS_API_URL is required');
  }

  // Провайдер по умолчанию
  const aiProvider = process.env.AI_PROVIDER || 'gemini';

  // Проверяем наличие хотя бы одного API ключа
  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
  const hasGeminiKey = !!process.env.GEMINI_API_KEY;
  const hasOpenAIKey = !!process.env.OPENAI_API_KEY;

  if (!hasAnthropicKey && !hasGeminiKey && !hasOpenAIKey) {
    throw new Error(
      'At least one AI provider API key is required: ANTHROPIC_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY'
    );
  }

  return {
    supabaseUrl,
    supabaseServiceKey,
    gasApiUrl,
    port: parseInt(process.env.PORT || '3001', 10),
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || [],
    maxAgentIterations: parseInt(process.env.MAX_AGENT_ITERATIONS || '10', 10),

    // AI Provider
    aiProvider,
    fallbackProvider: process.env.FALLBACK_PROVIDER,

    // API Keys
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    geminiApiKey: process.env.GEMINI_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,

    // Models
    claudeModel: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-pro',
    openaiModel: process.env.OPENAI_MODEL || 'gpt-4o',
  };
}

export const config = validateEnv();
```

---

### Шаг 6: Обновить маршрут чата

**Файл:** `src/routes/chat.ts`

Замените использование `processChatMessage` из `anthropic.ts` на фабрику:

```typescript
import { Router, Request, Response } from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { ProviderFactory } from '../services/ai/index.js';
import { tools } from '../tools/index.js';
import type { ChatRequest } from '../services/ai/types.js';

const router = Router();

/**
 * POST /api/chat
 *
 * Обработка сообщений AI-консультанта.
 * Теперь использует multi-provider архитектуру.
 */
router.post('/', authenticateUser, async (req: Request, res: Response) => {
  try {
    const { messages } = req.body as ChatRequest;
    const userId = (req as any).userId;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    // Создаем провайдер через фабрику
    const provider = await ProviderFactory.create();

    console.log(`[Chat] Using provider: ${provider.name}`);

    // Обрабатываем сообщение
    const response = await provider.chat(messages, tools, userId);

    // Логируем использование токенов
    if (response.tokensUsed) {
      console.log(
        `[Chat] Tokens: ${response.tokensUsed.input} in, ${response.tokensUsed.output} out`
      );
    }

    res.json(response);
  } catch (error) {
    console.error('Chat error:', error);

    if (error instanceof Error) {
      res.status(500).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

export default router;
```

---

### Шаг 7: Обновить .env файл

**Файл:** `ai-consultant-api/.env`

```env
# Supabase
SUPABASE_URL=https://wslcojroanewczgqtfuk.supabase.co
SUPABASE_SERVICE_KEY=your_service_key_here

# GAS API
GAS_API_URL=https://script.google.com/macros/s/your_gas_id/exec

# Server
PORT=3001
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

# ============================================
# AI Provider Configuration
# ============================================

# Основной провайдер: claude | gemini | openai
AI_PROVIDER=gemini

# Запасной провайдер (опционально)
FALLBACK_PROVIDER=claude

# ============================================
# API Keys (добавьте ключи только для используемых провайдеров)
# ============================================

# Claude (Anthropic) - https://console.anthropic.com/settings/keys
ANTHROPIC_API_KEY=sk-ant-api03-...

# Gemini (Google) - https://ai.google.dev/
GEMINI_API_KEY=AIza...

# OpenAI - https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-proj-...

# ============================================
# Models (опционально, есть дефолтные значения)
# ============================================

# Claude models: claude-sonnet-4-20250514, claude-opus-4-20250514
CLAUDE_MODEL=claude-sonnet-4-20250514

# Gemini models: gemini-1.5-pro, gemini-1.5-flash
GEMINI_MODEL=gemini-1.5-pro

# OpenAI models: gpt-4o, gpt-4-turbo, gpt-3.5-turbo
OPENAI_MODEL=gpt-4o

# ============================================
# Other
# ============================================

MAX_AGENT_ITERATIONS=10
```

---

## 🔧 Адаптация Tool Calling

### Ключевые отличия между провайдерами

| Аспект | Claude (Anthropic) | Gemini (Google) | OpenAI (GPT) |
|--------|-------------------|-----------------|--------------|
| **Название** | Tools | Function Declarations | Functions/Tools |
| **Формат определения** | `tools[]` с `input_schema` | `functionDeclarations[]` с `parameters` | `tools[]` с `function.parameters` |
| **Вызов** | `tool_use` блоки | `functionCall` в `parts` | `tool_calls[]` в message |
| **Результаты** | `tool_result` блоки | `functionResponse` в `parts` | Сообщения с `role: "tool"` |
| **ID вызова** | Генерируется API | Нужно генерировать вручную | Генерируется API |

### Универсальный формат (ваш текущий)

```typescript
{
  name: "get_equipment_details",
  description: "Получить детальную информацию об оборудовании",
  input_schema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "ID оборудования"
      }
    },
    required: ["id"]
  }
}
```

Адаптеры конвертируют этот формат в специфичный для каждого провайдера.

---

## 🔧 Конфигурация и переменные окружения

### Файл .env

```env
# ===== ОСНОВНАЯ КОНФИГУРАЦИЯ =====
AI_PROVIDER=gemini                    # claude | gemini | openai
FALLBACK_PROVIDER=claude              # Опционально

# ===== API КЛЮЧИ =====
# Добавьте только те, которые используете

# Claude (платный, лучшее качество)
ANTHROPIC_API_KEY=sk-ant-api03-...   # https://console.anthropic.com/settings/keys

# Gemini (бесплатный tier)
GEMINI_API_KEY=AIza...                # https://ai.google.dev/

# OpenAI (платный)
OPENAI_API_KEY=sk-proj-...            # https://platform.openai.com/api-keys

# ===== МОДЕЛИ =====
# Опционально, есть дефолтные значения

CLAUDE_MODEL=claude-sonnet-4-20250514
GEMINI_MODEL=gemini-1.5-pro
OPENAI_MODEL=gpt-4o
```

### Получение API ключей

#### Gemini (бесплатно)
1. Перейти на https://ai.google.dev/
2. Нажать "Get API key in Google AI Studio"
3. Создать новый проект
4. Создать API ключ
5. Скопировать ключ (формат: `AIza...`)

**Лимиты бесплатного tier:**
- 15 requests/minute (gemini-1.5-pro)
- 60 requests/minute (gemini-1.5-flash)

#### Claude (платный)
1. Зарегистрироваться на https://console.anthropic.com
2. Добавить баланс ($5-10)
3. Создать API ключ в Settings → API Keys
4. Скопировать ключ (формат: `sk-ant-api03-...`)

**Стоимость:**
- ~$0.05 за запрос (Sonnet 4.5)
- $10 = ~200 запросов

#### OpenAI (платный)
1. Зарегистрироваться на https://platform.openai.com
2. Добавить баланс ($5-20)
3. Создать API ключ
4. Скопировать ключ (формат: `sk-proj-...`)

**Стоимость:**
- ~$0.03 за запрос (GPT-4o)
- $10 = ~300 запросов

---

## 🧪 Тестирование

### Шаг 1: Локальное тестирование

```bash
# В ai-consultant-api/
npm run dev
```

### Шаг 2: Проверка доступных провайдеров

Добавьте endpoint для проверки:

**Файл:** `src/routes/health.ts`

```typescript
import { Router } from 'express';
import { ProviderFactory } from '../services/ai/index.js';

const router = Router();

router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    providers: ProviderFactory.getAvailableProviders(),
    activeProvider: process.env.AI_PROVIDER || 'gemini',
  });
});

export default router;
```

### Шаг 3: Тестирование каждого провайдера

Изменяйте `AI_PROVIDER` в `.env` и перезапускайте сервер:

```bash
# Тест с Gemini
AI_PROVIDER=gemini npm run dev

# Тест с Claude
AI_PROVIDER=claude npm run dev

# Тест с OpenAI
AI_PROVIDER=openai npm run dev
```

### Шаг 4: Тестирование через фронтенд

Отправьте простой запрос через AI-консультант:

```
"Найди фильтр ФО-0,8"
```

Проверьте в консоли backend:
```
[ProviderFactory] Creating primary provider: gemini
[Gemini] Executing function: get_all_equipment
[Chat] Using provider: Gemini
[Chat] Tokens: 1234 in, 567 out
```

### Шаг 5: Тестирование fallback

Установите недоступный провайдер как основной:

```env
AI_PROVIDER=claude
ANTHROPIC_API_KEY=invalid_key
FALLBACK_PROVIDER=gemini
```

Должно появиться в логах:
```
[ProviderFactory] Primary provider claude unavailable, using fallback: gemini
```

---

## 🚀 Деплой на Railway

### Шаг 1: Обновить существующий сервис backend

В Railway перейдите в ai-consultant-api сервис → Variables:

```env
AI_PROVIDER=gemini
FALLBACK_PROVIDER=claude

GEMINI_API_KEY=AIza...
ANTHROPIC_API_KEY=sk-ant-api03-...  # Опционально

GEMINI_MODEL=gemini-1.5-pro
```

### Шаг 2: Добавить зависимости

Убедитесь, что в `package.json` есть:

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.30.0",
    "@google/generative-ai": "^0.21.0",
    "openai": "^4.70.0"
  }
}
```

### Шаг 3: Push изменений

```bash
git add .
git commit -m "feat: multi-provider AI architecture"
git push
```

Railway автоматически:
1. Обнаружит изменения
2. Установит новые зависимости
3. Пересоберёт и задеплоит backend

### Шаг 4: Проверка на production

```bash
curl https://your-backend.railway.app/api/health
```

Ответ:
```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "providers": ["gemini", "claude"],
  "activeProvider": "gemini"
}
```

### Шаг 5: Мониторинг

В Railway → Logs смотрите:
```
[ProviderFactory] Creating primary provider: gemini
[Gemini] Chat completed
[Chat] Tokens: 1500 in, 800 out
```

---

## 🎯 Дополнительные возможности

### 1. Smart Routing (умная маршрутизация)

Выбирать провайдера в зависимости от сложности запроса:

**Файл:** `src/services/ai/SmartRouter.ts`

```typescript
import { AIProvider } from './AIProvider.js';
import { ChatMessage } from './types.js';
import { ClaudeProvider } from './providers/ClaudeProvider.js';
import { GeminiProvider } from './providers/GeminiProvider.js';
import { config } from '../../config/env.js';

export class SmartRouter {
  private claudeProvider?: ClaudeProvider;
  private geminiProvider: GeminiProvider;

  constructor() {
    if (config.anthropicApiKey) {
      this.claudeProvider = new ClaudeProvider(config.anthropicApiKey);
    }
    this.geminiProvider = new GeminiProvider(config.geminiApiKey!);
  }

  /**
   * Выбирает провайдера на основе сложности запроса
   */
  selectProvider(messages: ChatMessage[]): AIProvider {
    const lastMessage = messages[messages.length - 1];

    // Если есть фото - используем Claude (лучше работает с изображениями)
    if (this.hasImages(lastMessage)) {
      return this.claudeProvider || this.geminiProvider;
    }

    // Если запрос простой - используем Gemini (бесплатно)
    if (this.isSimpleQuery(lastMessage)) {
      return this.geminiProvider;
    }

    // Сложный запрос - Claude
    return this.claudeProvider || this.geminiProvider;
  }

  private hasImages(message: ChatMessage): boolean {
    if (typeof message.content === 'string') return false;
    return message.content.some(block => block.type === 'image');
  }

  private isSimpleQuery(message: ChatMessage): boolean {
    const text = typeof message.content === 'string'
      ? message.content
      : message.content.find(b => b.type === 'text')?.text || '';

    // Простые паттерны
    const simplePatterns = [
      /^найди/i,
      /^покажи список/i,
      /^какие есть/i,
    ];

    return simplePatterns.some(pattern => pattern.test(text));
  }
}
```

**Использование в chat.ts:**

```typescript
const router = new SmartRouter();
const provider = router.selectProvider(messages);
```

### 2. Cost Tracking (учёт затрат)

**Файл:** `src/services/ai/CostTracker.ts`

```typescript
interface CostConfig {
  claude: { input: number; output: number };  // $ per 1M tokens
  gemini: { input: number; output: number };
  openai: { input: number; output: number };
}

const COST_PER_MILLION: CostConfig = {
  claude: { input: 3.0, output: 15.0 },
  gemini: { input: 0, output: 0 },  // Бесплатный tier
  openai: { input: 2.5, output: 10.0 },
};

export class CostTracker {
  static calculateCost(
    provider: string,
    inputTokens: number,
    outputTokens: number
  ): number {
    const costs = COST_PER_MILLION[provider as keyof CostConfig];
    if (!costs) return 0;

    const inputCost = (inputTokens / 1_000_000) * costs.input;
    const outputCost = (outputTokens / 1_000_000) * costs.output;

    return inputCost + outputCost;
  }

  static logCost(
    provider: string,
    inputTokens: number,
    outputTokens: number
  ): void {
    const cost = this.calculateCost(provider, inputTokens, outputTokens);
    console.log(
      `[CostTracker] ${provider}: ${inputTokens} in + ${outputTokens} out = $${cost.toFixed(4)}`
    );
  }
}
```

### 3. Rate Limiting (защита от превышения лимитов)

**Файл:** `src/services/ai/RateLimiter.ts`

```typescript
export class RateLimiter {
  private requests: Map<string, number[]> = new Map();

  /**
   * Проверяет, можно ли сделать запрос
   * @param provider - имя провайдера
   * @param limit - лимит запросов в минуту
   */
  canMakeRequest(provider: string, limit: number): boolean {
    const now = Date.now();
    const minute = 60 * 1000;

    // Получаем историю запросов
    let timestamps = this.requests.get(provider) || [];

    // Удаляем старые (более минуты назад)
    timestamps = timestamps.filter(ts => now - ts < minute);

    // Проверяем лимит
    if (timestamps.length >= limit) {
      console.warn(`[RateLimiter] ${provider} rate limit reached (${limit}/min)`);
      return false;
    }

    // Добавляем текущий запрос
    timestamps.push(now);
    this.requests.set(provider, timestamps);

    return true;
  }
}
```

**Использование:**

```typescript
const rateLimiter = new RateLimiter();

// Gemini: 15 req/min
if (!rateLimiter.canMakeRequest('gemini', 15)) {
  // Переключиться на другой провайдер
  provider = fallbackProvider;
}
```

### 4. Fallback Chain (цепочка запасных провайдеров)

**Файл:** `src/services/ai/FallbackChain.ts`

```typescript
export class FallbackChain {
  private providers: AIProvider[];

  constructor(providers: AIProvider[]) {
    this.providers = providers;
  }

  /**
   * Пробует провайдеров по очереди, пока не получит успешный ответ
   */
  async chat(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    userId: string
  ): Promise<ChatResponse> {
    let lastError: Error | null = null;

    for (const provider of this.providers) {
      try {
        console.log(`[FallbackChain] Trying ${provider.name}...`);
        const response = await provider.chat(messages, tools, userId);
        console.log(`[FallbackChain] Success with ${provider.name}`);
        return response;
      } catch (error) {
        console.warn(`[FallbackChain] ${provider.name} failed:`, error);
        lastError = error as Error;
        // Пробуем следующего
      }
    }

    throw new Error(
      `All providers failed. Last error: ${lastError?.message}`
    );
  }
}
```

**Использование:**

```typescript
const chain = new FallbackChain([
  geminiProvider,    // Пробуем бесплатный Gemini
  claudeProvider,    // Если не вышло - Claude
  openaiProvider,    // Если и Claude не вышел - OpenAI
]);

const response = await chain.chat(messages, tools, userId);
```

---

## ✅ Чеклист реализации

### Этап 1: Базовая структура
- [ ] Создать папку `src/services/ai/`
- [ ] Создать `types.ts` с общими интерфейсами
- [ ] Создать `AIProvider.ts` с базовым интерфейсом
- [ ] Создать папку `adapters/`
- [ ] Создать папку `providers/`

### Этап 2: Адаптеры
- [ ] **Рефакторить** логику из `anthropic.ts` → `claudeToolAdapter.ts` ⭐ (вынести 3 функции)
- [ ] Реализовать `geminiToolAdapter.ts` (новый)
- [ ] Реализовать `openaiToolAdapter.ts` (новый, опционально)

### Этап 3: Провайдеры
- [ ] Установить `@google/generative-ai`
- [ ] Установить `openai`
- [ ] **Рефакторить** `anthropic.ts` → `ClaudeProvider.ts` ⭐ (копировать существующий код)
- [ ] Реализовать `GeminiProvider.ts` (новый)
- [ ] Реализовать `OpenAIProvider.ts` (новый, опционально)

### Этап 4: Фабрика
- [ ] Реализовать `ProviderFactory.ts`
- [ ] Добавить метод `create()`
- [ ] Добавить метод `getAvailableProviders()`
- [ ] Создать `index.ts` с экспортами

### Этап 5: Конфигурация
- [ ] Обновить `env.ts`
- [ ] Добавить `AI_PROVIDER`
- [ ] Добавить `FALLBACK_PROVIDER`
- [ ] Добавить ключи для всех провайдеров
- [ ] Обновить `.env` файл

### Этап 6: Интеграция
- [ ] Обновить `chat.ts` для использования фабрики
- [ ] Обновить `health.ts` для показа провайдеров
- [ ] Удалить старый `anthropic.ts` (опционально)

### Этап 7: Тестирование
- [ ] Протестировать локально с Gemini
- [ ] Протестировать локально с Claude
- [ ] Протестировать локально с OpenAI
- [ ] Протестировать fallback механизм
- [ ] Протестировать с фото
- [ ] Протестировать tool calling

### Этап 8: Деплой
- [ ] Push в Git
- [ ] Обновить переменные в Railway
- [ ] Проверить деплой
- [ ] Протестировать на production
- [ ] Проверить логи

### Этап 9: Дополнительно (опционально)
- [ ] Реализовать Smart Router
- [ ] Реализовать Cost Tracker
- [ ] Реализовать Rate Limiter
- [ ] Реализовать Fallback Chain
- [ ] Добавить метрики и мониторинг

---

## 📚 Полезные ссылки

### Документация API

- **Claude (Anthropic)**: https://docs.anthropic.com/claude/reference/messages_post
- **Gemini (Google)**: https://ai.google.dev/api/generate-content
- **OpenAI (GPT)**: https://platform.openai.com/docs/api-reference/chat

### Получение API ключей

- **Gemini**: https://ai.google.dev/ (бесплатно)
- **Claude**: https://console.anthropic.com/settings/keys (платно)
- **OpenAI**: https://platform.openai.com/api-keys (платно)

### Сравнение провайдеров

| Провайдер | Качество | Скорость | Стоимость | Лимиты |
|-----------|----------|----------|-----------|--------|
| Claude Sonnet 4.5 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | $0.05/запрос | Платно |
| Gemini 1.5 Pro | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Бесплатно | 15 req/min |
| GPT-4o | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | $0.03/запрос | Платно |

---

## 🎉 Заключение

После реализации у вас будет:

✅ Гибкая система с поддержкой 3+ провайдеров
✅ Переключение через `.env` без изменения кода
✅ Автоматический fallback при недоступности провайдера
✅ Возможность использовать бесплатный Gemini для экономии
✅ Готовая архитектура для добавления новых провайдеров

**Рекомендуемая конфигурация для старта:**
```env
AI_PROVIDER=gemini              # Бесплатный, хорошее качество
FALLBACK_PROVIDER=claude        # Если Gemini недоступен
```

**Удачи в реализации! 🚀**

---

*Документ создан: 2025-02-08*
*Версия: 1.0*
