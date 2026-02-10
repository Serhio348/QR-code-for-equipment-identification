# 🔑 Подробная инструкция: Получение DeepSeek API ключа и интеграция провайдера

## 📊 Почему DeepSeek?

| Провайдер | Input (за 1M токенов) | Output (за 1M токенов) | Качество |
|---|---|---|---|
| **DeepSeek R1** | **$0.55** | **$2.19** | ≈ Claude Sonnet 4 |
| **DeepSeek V3** | **$0.27** | **$1.10** | Очень хорошее |
| Claude Sonnet 4 | $3.00 | $15.00 | Отличное |
| Gemini 2.5 Flash | $0 (15 req/min) | $0 | Хорошее |

**DeepSeek R1** — модель с "chain-of-thought" рассуждением, по качеству сопоставима с Claude Sonnet 4, но в ~7 раз дешевле.

**DeepSeek V3** — быстрая модель общего назначения, очень дёшевая.

---

## ⚠️ Важно перед началом

- DeepSeek — китайская компания (основана в 2023)
- API доступен глобально через **https://platform.deepseek.com**
- Модели работают с русским языком отлично
- DeepSeek R1 поддерживает изображения, PDF, Word, Excel (через tool calling)
- API **совместим с форматом OpenAI** — можно использовать `openai` SDK

---

## 📋 Пошаговая инструкция

### Шаг 1: Зарегистрируйтесь на платформе DeepSeek

1. Перейдите по ссылке: **https://platform.deepseek.com**
2. Нажмите **"Sign Up"** / **"Зарегистрироваться"**
3. Выберите способ регистрации:
   - По **email** (рекомендуется)
   - Через Google аккаунт
   - Через GitHub аккаунт

### Шаг 2: Подтвердите email

1. Введите ваш email адрес
2. Придумайте надёжный пароль (минимум 8 символов)
3. Нажмите **"Send Code"** для получения кода подтверждения
4. Проверьте почту — придёт письмо с 6-значным кодом
5. Введите код в форму
6. Нажмите **"Sign Up"**

**Если письмо не пришло:**
- Проверьте папку "Спам"
- Подождите 2-3 минуты
- Нажмите "Resend Code"

### Шаг 3: Пополните баланс

DeepSeek — платный сервис (без бесплатного tier как у Gemini).

1. После входа перейдите в **"Top Up"** / **"Пополнить"** (левое меню)
2. Или по ссылке: **https://platform.deepseek.com/top_up**
3. Выберите сумму пополнения (минимум обычно $2-5)
4. Способы оплаты:
   - Банковская карта (Visa, Mastercard)
   - Alipay (если доступно в вашей стране)
5. Введите данные карты и подтвердите платёж

**💡 Сколько нужно для старта:**
- $2-5 хватит на несколько тысяч запросов к DeepSeek R1
- Для активного использования (100 запросов/день) — ~$0.50/месяц

**⚠️ Примечание для РФ/Беларуси:**
- Карты Visa/Mastercard российских банков могут не работать
- Используйте карты иностранных банков или виртуальные карты (Revolut, Wise)
- Или обратитесь к посреднику для пополнения

### Шаг 4: Создайте API ключ

1. Перейдите в раздел **"API Keys"** в левом меню
2. Или по ссылке: **https://platform.deepseek.com/api_keys**
3. Нажмите **"Create new secret key"** / **"Создать новый ключ"**
4. Введите название ключа (например: `equipment-management-app`)
5. Нажмите **"Create secret key"**

### Шаг 5: Скопируйте API ключ

1. Появится окно с вашим ключом (формат: `sk-...`)
2. Нажмите кнопку **📋 Copy** (иконка копирования)
3. Или выделите ключ мышкой и скопируйте (Ctrl+C)

**⚠️ Важно:**
- Ключ показывается **только один раз** при создании
- Если не скопировали — нужно создать новый
- Не закрывайте окно, пока не скопируете и не сохранили ключ!

### Шаг 6: Сохраните ключ

1. Откройте текстовый файл или менеджер паролей
2. Вставьте ключ (Ctrl+V)
3. Добавьте метку: `DeepSeek API key - [дата создания]`
4. Сохраните в безопасном месте

---

## 🔧 Настройка ключа в проекте

### 1. Откройте файл `ai-consultant-api/.env`

```bash
cd ai-consultant-api
notepad .env
# или VS Code
code .env
```

### 2. Текущий вид файла и что нужно добавить

Текущий файл `ai-consultant-api/.env` содержит только ключи Anthropic и Gemini без явного указания провайдера:

```env
ANTHROPIC_API_KEY=sk-ant-api03-...   # (уже есть)
GEMINI_API_KEY=AIzaSy...             # (уже есть)
GEMINI_MODEL=gemini-2.5-flash        # (уже есть)
```

Добавьте **три строки** сразу после блока с Gemini:

```env
# Google Gemini API
GEMINI_API_KEY=AIzaSy...             # (уже есть — не трогать)
GEMINI_MODEL=gemini-2.5-flash        # (уже есть — не трогать)

# ↓↓↓ ДОБАВИТЬ ЭТИ СТРОКИ ↓↓↓
# DeepSeek API
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-...              # ← вставьте ваш реальный ключ
DEEPSEEK_MODEL=deepseek-reasoner
```

**Итоговый вид блока AI в `.env` после изменений:**

```env
ANTHROPIC_API_KEY=sk-ant-api03-...

GEMINI_API_KEY=AIzaSy...
GEMINI_MODEL=gemini-2.5-flash

AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxx
DEEPSEEK_MODEL=deepseek-reasoner
```

> **Без строки `AI_PROVIDER`** сервер будет использовать `gemini` по умолчанию
> (значение по умолчанию прописано в `env.ts`: `process.env.AI_PROVIDER || 'gemini'`).
> Строка `AI_PROVIDER=deepseek` явно переключает основной провайдер на DeepSeek.

### 3. Выбор модели

| Модель | Описание | Цена input | Цена output | Рекомендуется для |
|---|---|---|---|---|
| `deepseek-reasoner` | DeepSeek R1 — рассуждает перед ответом | $0.55/1M | $2.19/1M | Сложные задачи, анализ |
| `deepseek-chat` | DeepSeek V3 — быстрый, общего назначения | $0.27/1M | $1.10/1M | Повседневные запросы |

**Рекомендация:** Начните с `deepseek-reasoner` (R1) — качество как у Claude Sonnet 4.

### 4. Сохраните файл и перезапустите сервер

```bash
# Остановите сервер (Ctrl+C)
npm run dev
```

---

## 🏗️ Как реализовать провайдер DeepSeek

DeepSeek использует **OpenAI-совместимый API**. Нужно использовать `openai` SDK с кастомным `baseURL`.

### Шаг 1: Установите пакет `openai`

```bash
cd ai-consultant-api
npm install openai
```

### Шаг 2: Создайте адаптер `deepseekToolAdapter.ts`

Файл: `ai-consultant-api/src/services/ai/adapters/deepseekToolAdapter.ts`

DeepSeek использует формат OpenAI для tool calling:

```typescript
import OpenAI from 'openai';
import { ToolDefinition } from '../types.js';

/**
 * Конвертирует ToolDefinition[] в формат OpenAI/DeepSeek function calling.
 */
export function convertToDeepSeekTools(tools: ToolDefinition[]): OpenAI.ChatCompletionTool[] {
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
 * Извлекает tool calls из ответа DeepSeek/OpenAI.
 */
export function extractDeepSeekToolCalls(
  message: OpenAI.ChatCompletionMessage
): Array<{ id: string; name: string; input: Record<string, unknown> }> {
  if (!message.tool_calls) return [];

  return message.tool_calls.map(tc => ({
    id: tc.id,
    name: tc.function.name,
    input: JSON.parse(tc.function.arguments) as Record<string, unknown>,
  }));
}

/**
 * Форматирует результаты tools для отправки обратно DeepSeek/OpenAI.
 */
export function formatDeepSeekToolResults(
  results: Array<{ id: string; result: unknown; isError?: boolean }>
): OpenAI.ChatCompletionToolMessageParam[] {
  return results.map(({ id, result, isError }) => ({
    role: 'tool' as const,
    tool_call_id: id,
    content: isError
      ? `Ошибка: ${JSON.stringify(result)}`
      : JSON.stringify(result),
  }));
}
```

### Шаг 3: Создайте провайдер `DeepSeekProvider.ts`

Файл: `ai-consultant-api/src/services/ai/providers/DeepSeekProvider.ts`

```typescript
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

  constructor(apiKey: string, model: string = 'deepseek-reasoner') {
    super();
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
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 5,
      });
      return !!response.choices[0];
    } catch (error) {
      console.error('[DeepSeekProvider] Not available:', error instanceof Error ? error.message : error);
      return false;
    }
  }

  /**
   * Преобразует ChatMessage[] в формат OpenAI
   */
  private convertMessages(messages: ChatMessage[]): OpenAI.ChatCompletionMessageParam[] {
    return messages.map(msg => {
      if (typeof msg.content === 'string') {
        return { role: msg.role, content: msg.content };
      }

      // Мультимодальный контент (текст + изображения)
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

      return { role: msg.role, content };
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
- Тип: ${equipmentContext.type}${equipmentContext.googleDriveUrl ? `\n- Папка Google Drive: ${equipmentContext.googleDriveUrl}` : ''}

🚨 КРИТИЧЕСКИ ВАЖНО:
Когда пользователь запрашивает информацию БЕЗ указания конкретного оборудования, АВТОМАТИЧЕСКИ используй ID этого оборудования: ${equipmentContext.id}

Примеры:
- "Покажи журнал обслуживания" → используй equipment_id="${equipmentContext.id}" в get_maintenance_log
- "Покажи файлы" → используй folderId из Google Drive URL этого оборудования
- "Добавь запись о ремонте" → используй equipment_id="${equipmentContext.id}" в add_maintenance_entry
- "Когда последнее обслуживание?" → сначала вызови get_maintenance_log с equipment_id="${equipmentContext.id}"

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
```

### Шаг 4: Обновите `env.ts`

Файл: `ai-consultant-api/src/config/env.ts`

Добавьте в объект `config`:

```typescript
// DeepSeek API
deepseekApiKey: process.env.DEEPSEEK_API_KEY || '',
deepseekModel: process.env.DEEPSEEK_MODEL || 'deepseek-reasoner',
```

Обновите проверку `hasAnyProvider`:

```typescript
const hasAnyProvider = config.anthropicApiKey || config.geminiApiKey || config.deepseekApiKey;
```

### Шаг 5: Обновите `ProviderFactory.ts`

Файл: `ai-consultant-api/src/services/ai/ProviderFactory.ts`

1. Добавьте импорт:
```typescript
import { DeepSeekProvider } from './providers/DeepSeekProvider.js';
```

2. Добавьте `'deepseek'` в тип:
```typescript
export type ProviderType = 'claude' | 'gemini' | 'deepseek';
```

3. Добавьте `case 'deepseek'` в метод `createProviderByType()`:
```typescript
case 'deepseek':
  if (!config.deepseekApiKey) {
    throw new Error('DEEPSEEK_API_KEY is not configured');
  }
  return new DeepSeekProvider(config.deepseekApiKey, config.deepseekModel);
```

4. Добавьте в `getAvailableProviders()`:
```typescript
if (config.deepseekApiKey) available.push('deepseek');
```

### Шаг 6: Обновите `index.ts`

Файл: `ai-consultant-api/src/services/ai/index.ts`

Добавьте экспорт:
```typescript
export { DeepSeekProvider } from './providers/DeepSeekProvider.js';
```

### Шаг 7: Проверьте сборку

```bash
cd ai-consultant-api
npm run build
```

Не должно быть ошибок TypeScript.

---

## ✅ Проверка: Работает ли ключ?

### Способ 1: Через логи сервера

```bash
cd ai-consultant-api
npm run dev
```

**Успех:**
```
[ProviderFactory] Creating primary provider: deepseek
[ProviderFactory] Using provider: DeepSeek (model: deepseek-reasoner)
Server running on port 3001
```

**Ошибка:**
```
[ProviderFactory] Failed to create deepseek provider: Incorrect API key provided
[ProviderFactory] Trying fallback provider: gemini
```

### Способ 2: Health check

```bash
curl http://localhost:3001/health
```

Ответ должен содержать `"provider": "DeepSeek"`.

### Способ 3: Тестовый запрос к чату

```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SUPABASE_JWT" \
  -d '{
    "messages": [{"role": "user", "content": "Привет, какой ты провайдер?"}]
  }'
```

**Ответ при успехе:**
```json
{
  "success": true,
  "data": {
    "message": "Привет! Я AI-консультант на базе DeepSeek R1...",
    "provider": "DeepSeek",
    "tokensUsed": { "input": 150, "output": 45 }
  }
}
```

---

## 🔄 Конфигурация в Railway

В Railway Dashboard для сервиса `ai-consultant-api` добавьте переменные:

```
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_MODEL=deepseek-reasoner
FALLBACK_PROVIDER=gemini        # резервный провайдер
```

**Варианты конфигурации:**

**Только DeepSeek:**
```env
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-...
```

**DeepSeek + Claude fallback (рекомендуется):**
```env
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-...
FALLBACK_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-api03-...
```

**DeepSeek + Gemini fallback (экономично):**
```env
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-...
FALLBACK_PROVIDER=gemini
GEMINI_API_KEY=AIza...
```

---

## 📊 Лимиты и квоты

| Параметр | Значение |
|---|---|
| Запросов в минуту | 60 (по умолчанию) |
| Токенов в запросе (контекст) | 64,000 |
| Макс. токенов в ответе | 8,192 |
| Мультимодальность | Да (изображения) |
| Tool calling | Да |
| Стриминг | Да |

**Проверить баланс:**
https://platform.deepseek.com/usage

---

## 🐛 Troubleshooting

### Ошибка: "Incorrect API key provided"

**Причины:**
- Ключ скопирован не полностью
- Лишние пробелы в начале или конце
- Ключ удалён в личном кабинете

**Решение:**
1. Убедитесь, что ключ начинается с `sk-`
2. Проверьте отсутствие пробелов: `DEEPSEEK_API_KEY=sk-...` (без пробелов вокруг `=`)
3. Создайте новый ключ на https://platform.deepseek.com/api_keys

### Ошибка: "Insufficient balance"

**Причина:** Нулевой или недостаточный баланс.

**Решение:**
1. Пополните баланс: https://platform.deepseek.com/top_up
2. Минимальное пополнение обычно $2-5

### Ошибка: TypeScript "Cannot find module 'openai'"

**Причина:** Не установлен пакет `openai`.

**Решение:**
```bash
cd ai-consultant-api
npm install openai
```

### DeepSeek R1 "думает" слишком долго

**Причина:** `deepseek-reasoner` использует chain-of-thought и может занимать 10-30 секунд.

**Решение:**
- Для простых запросов используйте `deepseek-chat` (V3) — быстрее и дешевле
- Для сложного анализа оставьте `deepseek-reasoner` (R1)
- Увеличьте таймаут в `env.ts`: `API_TIMEOUT=60000`

### Ошибка: "Model not found"

**Решение:** Проверьте правильность названия модели:
- ✅ `deepseek-reasoner` — модель R1
- ✅ `deepseek-chat` — модель V3
- ❌ `deepseek-r1` — неверное название

---

## 🔐 Безопасность API ключа

### ✅ Правильно:

```env
# .env файл (НЕ коммитить в Git!)
DEEPSEEK_API_KEY=sk-...
```

### ❌ Неправильно:

```typescript
// НЕ ДЕЛАЙТЕ ТАК!
const apiKey = 'sk-...'; // Хардкод в коде
```

### Проверьте .gitignore

```bash
# В .gitignore должно быть:
.env
.env.local
ai-consultant-api/.env
```

---

## 📚 Полезные ссылки

- 🔑 **Создать API ключ:** https://platform.deepseek.com/api_keys
- 💰 **Пополнить баланс:** https://platform.deepseek.com/top_up
- 📖 **Документация API:** https://api-docs.deepseek.com
- 💻 **Совместимость с OpenAI:** https://api-docs.deepseek.com/zh-cn/guides/openai_compatibility
- 📊 **Проверить использование:** https://platform.deepseek.com/usage
- 🧪 **Playground:** https://chat.deepseek.com (веб-интерфейс для тестов)
- 🤖 **Модели DeepSeek:** https://api-docs.deepseek.com/zh-cn/quick_start/pricing

---

## ✅ Чеклист: Готово к работе

**Регистрация и ключ:**
- [ ] Зарегистрирован на https://platform.deepseek.com
- [ ] Баланс пополнен (минимум $2-5)
- [ ] API ключ создан и начинается с `sk-`
- [ ] Ключ скопирован и сохранён в безопасном месте

**Настройка проекта:**
- [ ] Установлен пакет `openai` (`npm install openai`)
- [ ] Создан файл `adapters/deepseekToolAdapter.ts`
- [ ] Создан файл `providers/DeepSeekProvider.ts`
- [ ] Обновлён `config/env.ts` — добавлены `deepseekApiKey`, `deepseekModel`
- [ ] Обновлён `ProviderFactory.ts` — добавлен `case 'deepseek'`
- [ ] Обновлён `index.ts` — экспорт `DeepSeekProvider`
- [ ] Ключ добавлен в `.env` файл
- [ ] `.env` файл НЕ в Git (проверьте `.gitignore`)

**Проверка:**
- [ ] `npm run build` — без ошибок TypeScript
- [ ] Сервер запускается: `npm run dev`
- [ ] В логах: `[ProviderFactory] Creating primary provider: deepseek`
- [ ] Тестовый запрос возвращает `"provider": "DeepSeek"`

**Если все галочки стоят — всё готово! 🎉**

---

## 🆘 Нужна помощь?

1. **Проверьте логи сервера** — там будут подсказки
2. **Откройте** `MULTI_PROVIDER_SETUP.md` — общая архитектура провайдеров
3. **Сравните** с `providers/GeminiProvider.ts` — похожая структура
4. **Документация DeepSeek API:** https://api-docs.deepseek.com

Удачи с настройкой! 🚀
