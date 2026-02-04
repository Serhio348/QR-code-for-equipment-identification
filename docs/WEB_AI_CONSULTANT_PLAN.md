# AI Веб-консультант для приложения управления оборудованием

## Обзор проекта

AI-консультант, встроенный в веб-приложение, для помощи сотрудникам в работе с оборудованием. Консультант позволяет:
- Задавать вопросы на естественном языке
- Искать оборудование и просматривать документацию
- Добавлять записи в журнал обслуживания голосом или текстом
- **Прикреплять фото к записям обслуживания** (с камеры или галереи)
- Читать содержимое PDF инструкций
- Получать рекомендации по обслуживанию

**Ключевое преимущество перед Telegram ботом:** Работает прямо в приложении, не требует отдельного мессенджера, глубокая интеграция с интерфейсом.

---

## Архитектура решения

### Почему нужен прокси-сервер?

**Проблема:** Anthropic API (Claude) недоступен из некоторых стран (Беларусь, Россия и др.).

**Решение:** Создаём Backend API на Railway, который:
1. Принимает запросы от фронтенда
2. Проксирует их к Claude API
3. Railway серверы находятся в США/Европе — блокировок нет

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Браузер       │  HTTPS  │   Railway        │  HTTPS  │   Anthropic     │
│   (Беларусь)    │────────▶│   Proxy API      │────────▶│   Claude API    │
│                 │◀────────│   (США/Европа)   │◀────────│                 │
└─────────────────┘         └────────┬─────────┘         └─────────────────┘
                                     │
                        ┌────────────┼────────────┐
                        ▼            ▼            ▼
                 ┌───────────┐ ┌───────────┐ ┌───────────┐
                 │  Supabase │ │  GAS API  │ │  Google   │
                 │  (Auth)   │ │(Equipment)│ │  Drive    │
                 └───────────┘ └───────────┘ └───────────┘
```

### Компоненты системы

| Компонент | Технология | Расположение |
|-----------|------------|--------------|
| Чат-виджет | React + TypeScript | Frontend (существующее приложение) |
| Proxy API | Node.js + Express | Railway (новый сервис) |
| AI | Anthropic Claude API | Через прокси |
| Speech-to-Text | Web Speech API | Браузер (бесплатно) |
| Чтение PDF | GAS + Drive API | Существующий MCP-сервер |
| **Загрузка фото** | GAS + Drive API | Google Drive (папка оборудования) |
| Авторизация | Supabase | Существующий |

---

## Часть 1: Backend Proxy API

### Шаг 1.1: Создать структуру проекта

Создать новую папку в корне проекта:

```
ai-consultant-api/
├── src/
│   ├── index.ts              # Точка входа
│   ├── routes/
│   │   ├── chat.ts           # API для чата
│   │   ├── upload.ts         # API для загрузки фото
│   │   └── health.ts         # Health check
│   ├── services/
│   │   ├── anthropic.ts      # Клиент Claude API
│   │   ├── gasClient.ts      # Клиент GAS API
│   │   └── toolExecutor.ts   # Исполнитель tools
│   ├── tools/
│   │   ├── index.ts          # Регистрация tools
│   │   ├── equipmentTools.ts # Tools для оборудования
│   │   ├── photoTools.ts     # Tools для работы с фото
│   │   └── driveTools.ts     # Tools для файлов
│   ├── middleware/
│   │   ├── auth.ts           # Проверка токена Supabase
│   │   ├── cors.ts           # CORS настройки
│   │   └── rateLimit.ts      # Ограничение запросов
│   ├── config/
│   │   └── env.ts            # Переменные окружения
│   └── types/
│       └── index.ts          # TypeScript типы
├── package.json
├── tsconfig.json
├── Dockerfile
└── railway.toml
```

### Шаг 1.2: Инициализировать проект

```bash
mkdir ai-consultant-api
cd ai-consultant-api
npm init -y
```

### Шаг 1.3: Установить зависимости

```bash
npm install express cors helmet @anthropic-ai/sdk @supabase/supabase-js dotenv
npm install -D typescript @types/express @types/cors @types/node tsx
```

### Шаг 1.4: Создать package.json

```json
{
  "name": "ai-consultant-api",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.71.2",
    "@supabase/supabase-js": "^2.89.0",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.21.0",
    "helmet": "^7.1.0"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/node": "^22.0.0",
    "tsx": "^4.7.0",
    "typescript": "^5.6.0"
  }
}
```

### Шаг 1.5: Создать tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### Шаг 1.6: Создать конфигурацию окружения

**Файл: `src/config/env.ts`**

```typescript
import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Сервер
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Anthropic Claude API
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  claudeModel: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',

  // Supabase (для проверки токенов)
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY || '',

  // GAS API (для работы с оборудованием)
  gasApiUrl: process.env.GAS_API_URL || '',

  // CORS
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(','),

  // Rate limiting
  rateLimitWindowMs: 60 * 1000, // 1 минута
  rateLimitMaxRequests: 30, // 30 запросов в минуту
};

// Проверка обязательных переменных
export function validateConfig(): void {
  const required = [
    'anthropicApiKey',
    'supabaseUrl',
    'supabaseServiceKey',
    'gasApiUrl',
  ];

  const missing = required.filter(key => !config[key as keyof typeof config]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
```

### Шаг 1.7: Создать middleware для авторизации

**Файл: `src/middleware/auth.ts`**

```typescript
import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config/env.js';

// Supabase клиент с service key для проверки токенов
const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
}

/**
 * Middleware для проверки авторизации через Supabase JWT
 */
export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Получаем токен из заголовка Authorization
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Отсутствует токен авторизации' });
      return;
    }

    const token = authHeader.substring(7);

    // Проверяем токен через Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({ error: 'Недействительный токен' });
      return;
    }

    // Добавляем пользователя в request
    req.user = {
      id: user.id,
      email: user.email || '',
    };

    next();

  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Ошибка авторизации' });
  }
}
```

### Шаг 1.8: Создать сервис для Claude API

**Файл: `src/services/anthropic.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/env.js';
import { tools, executeToolCall } from '../tools/index.js';

// Инициализация клиента Anthropic
const anthropic = new Anthropic({
  apiKey: config.anthropicApiKey,
});

// Системный промпт для консультанта
const SYSTEM_PROMPT = `Ты — AI-консультант по обслуживанию оборудования на производстве.
Твоя задача — помогать сотрудникам работать с оборудованием.

Ты можешь:
1. Искать оборудование по названию или характеристикам
2. Показывать информацию об оборудовании (характеристики, дату ввода, последнее обслуживание)
3. Просматривать журнал обслуживания оборудования
4. Добавлять записи в журнал обслуживания
5. Читать содержимое документации и инструкций (PDF файлы)
6. Искать файлы в папках оборудования на Google Drive

При добавлении записей в журнал:
- Всегда запрашивай подтверждение перед сохранением
- Уточняй детали, если информация неполная
- Формат даты: YYYY-MM-DD

Отвечай кратко и по делу. Используй эмодзи для наглядности.
Язык общения: русский.

Текущая дата: ${new Date().toISOString().split('T')[0]}`;

// Типы сообщений
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  userId: string;
}

export interface ChatResponse {
  message: string;
  toolsUsed?: string[];
}

/**
 * Обработка сообщения чата через Claude API
 */
export async function processChatMessage(request: ChatRequest): Promise<ChatResponse> {
  try {
    const toolsUsed: string[] = [];

    // Преобразуем сообщения в формат Anthropic
    const messages: Anthropic.MessageParam[] = request.messages.map(msg => ({
      role: msg.role,
      content: msg.content,
    }));

    // Первый запрос к Claude
    let response = await anthropic.messages.create({
      model: config.claudeModel,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: tools,
      messages: messages,
    });

    // Обрабатываем tool_use в цикле
    while (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      // Выполняем все вызовы tools
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        console.log(`Executing tool: ${toolUse.name}`);
        toolsUsed.push(toolUse.name);

        try {
          const result = await executeToolCall(toolUse.name, toolUse.input as Record<string, unknown>);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
          });
        } catch (error) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: `Ошибка выполнения: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
            is_error: true,
          });
        }
      }

      // Добавляем результаты tools и продолжаем диалог
      messages.push({
        role: 'assistant',
        content: response.content,
      });

      messages.push({
        role: 'user',
        content: toolResults,
      });

      // Повторный запрос к Claude с результатами tools
      response = await anthropic.messages.create({
        model: config.claudeModel,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: tools,
        messages: messages,
      });
    }

    // Извлекаем текстовый ответ
    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );

    return {
      message: textBlock?.text || 'Не удалось получить ответ',
      toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
    };

  } catch (error) {
    console.error('Claude API error:', error);

    if (error instanceof Anthropic.APIError) {
      if (error.status === 429) {
        throw new Error('Превышен лимит запросов. Подождите немного.');
      }
      if (error.status === 401) {
        throw new Error('Ошибка авторизации Claude API');
      }
    }

    throw error;
  }
}
```

### Шаг 1.9: Создать Tools для оборудования

**Файл: `src/tools/equipmentTools.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { gasClient } from '../services/gasClient.js';

/**
 * Tool definitions для работы с оборудованием
 */
export const equipmentTools: Anthropic.Tool[] = [
  {
    name: 'get_all_equipment',
    description: 'Получить список всего оборудования. Можно фильтровать по типу, статусу или искать по названию.',
    input_schema: {
      type: 'object' as const,
      properties: {
        search: {
          type: 'string',
          description: 'Поисковый запрос по названию оборудования',
        },
        type: {
          type: 'string',
          description: 'Тип оборудования (filter, pump, tank, valve и т.д.)',
        },
        status: {
          type: 'string',
          enum: ['active', 'inactive', 'archived'],
          description: 'Статус оборудования',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_equipment_details',
    description: 'Получить детальную информацию об одном оборудовании по его ID. Включает характеристики, даты, ссылки на документацию.',
    input_schema: {
      type: 'object' as const,
      properties: {
        equipment_id: {
          type: 'string',
          description: 'ID оборудования (UUID)',
        },
      },
      required: ['equipment_id'],
    },
  },
  {
    name: 'get_maintenance_log',
    description: 'Получить журнал обслуживания оборудования. Показывает историю всех работ.',
    input_schema: {
      type: 'object' as const,
      properties: {
        equipment_id: {
          type: 'string',
          description: 'ID оборудования',
        },
        status: {
          type: 'string',
          enum: ['completed', 'planned', 'in_progress', 'cancelled'],
          description: 'Фильтр по статусу записи',
        },
        limit: {
          type: 'number',
          description: 'Максимальное количество записей (по умолчанию 10)',
        },
      },
      required: ['equipment_id'],
    },
  },
  {
    name: 'add_maintenance_entry',
    description: 'Добавить новую запись в журнал обслуживания. ВАЖНО: Перед вызовом этого инструмента покажи пользователю превью записи и запроси подтверждение.',
    input_schema: {
      type: 'object' as const,
      properties: {
        equipment_id: {
          type: 'string',
          description: 'ID оборудования',
        },
        date: {
          type: 'string',
          description: 'Дата в формате YYYY-MM-DD',
        },
        type: {
          type: 'string',
          description: 'Тип работ (Техническое обслуживание, Ремонт, Осмотр, Замена и т.д.)',
        },
        description: {
          type: 'string',
          description: 'Подробное описание выполненных работ',
        },
        performed_by: {
          type: 'string',
          description: 'ФИО исполнителя',
        },
        status: {
          type: 'string',
          enum: ['completed', 'planned', 'in_progress'],
          description: 'Статус записи (по умолчанию completed)',
        },
      },
      required: ['equipment_id', 'date', 'type', 'description', 'performed_by'],
    },
  },
];

/**
 * Выполнение tools для оборудования
 */
export async function executeEquipmentTool(
  name: string,
  input: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case 'get_all_equipment':
      return await gasClient.get('getAll', {
        search: input.search as string | undefined,
        type: input.type as string | undefined,
        status: input.status as string | undefined,
      });

    case 'get_equipment_details':
      return await gasClient.get('getById', {
        id: input.equipment_id as string,
      });

    case 'get_maintenance_log':
      return await gasClient.get('getMaintenanceLog', {
        equipmentId: input.equipment_id as string,
        status: input.status as string | undefined,
        limit: input.limit ? String(input.limit) : undefined,
      });

    case 'add_maintenance_entry':
      return await gasClient.post('addMaintenanceEntry', {
        equipmentId: input.equipment_id,
        date: input.date,
        type: input.type,
        description: input.description,
        performedBy: input.performed_by,
        status: input.status || 'completed',
      });

    default:
      throw new Error(`Unknown equipment tool: ${name}`);
  }
}
```

### Шаг 1.10: Создать Tools для Google Drive

**Файл: `src/tools/driveTools.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { gasClient } from '../services/gasClient.js';

/**
 * Tool definitions для работы с Google Drive
 */
export const driveTools: Anthropic.Tool[] = [
  {
    name: 'search_files_in_folder',
    description: 'Поиск файлов в папке оборудования на Google Drive. Возвращает список файлов с названиями и ссылками.',
    input_schema: {
      type: 'object' as const,
      properties: {
        folder_url: {
          type: 'string',
          description: 'URL папки Google Drive или ID папки',
        },
        query: {
          type: 'string',
          description: 'Поисковый запрос по названию файла',
        },
        mime_type: {
          type: 'string',
          description: 'Фильтр по типу файла (application/pdf, image/jpeg и т.д.)',
        },
      },
      required: ['folder_url'],
    },
  },
  {
    name: 'read_file_content',
    description: 'Прочитать текстовое содержимое файла из Google Drive. Поддерживает PDF (с OCR), Google Docs, текстовые файлы. Используй для чтения инструкций и паспортов оборудования.',
    input_schema: {
      type: 'object' as const,
      properties: {
        file_url: {
          type: 'string',
          description: 'URL файла на Google Drive или его ID',
        },
        max_length: {
          type: 'number',
          description: 'Максимальная длина текста в символах (по умолчанию 30000)',
        },
      },
      required: ['file_url'],
    },
  },
];

/**
 * Выполнение tools для Google Drive
 */
export async function executeDriveTool(
  name: string,
  input: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case 'search_files_in_folder':
      return await gasClient.get('getFolderFiles', {
        folderId: extractDriveId(input.folder_url as string),
        query: input.query as string | undefined,
        mimeType: input.mime_type as string | undefined,
      });

    case 'read_file_content':
      return await gasClient.get('getFileContent', {
        fileId: extractDriveId(input.file_url as string),
        maxLength: input.max_length ? String(input.max_length) : '30000',
      });

    default:
      throw new Error(`Unknown drive tool: ${name}`);
  }
}

/**
 * Извлечь ID из URL Google Drive
 */
function extractDriveId(urlOrId: string): string {
  if (!urlOrId) return '';

  // URL формата /folders/ID
  const foldersMatch = urlOrId.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (foldersMatch) return foldersMatch[1];

  // URL формата /file/d/ID
  const fileMatch = urlOrId.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return fileMatch[1];

  // URL формата ?id=ID
  const idMatch = urlOrId.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch) return idMatch[1];

  // Прямой ID
  if (/^[a-zA-Z0-9_-]{20,}$/.test(urlOrId)) {
    return urlOrId;
  }

  return urlOrId;
}
```

### Шаг 1.11: Создать регистрацию всех Tools

**Файл: `src/tools/index.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { equipmentTools, executeEquipmentTool } from './equipmentTools.js';
import { driveTools, executeDriveTool } from './driveTools.js';

// Объединяем все tools
export const tools: Anthropic.Tool[] = [
  ...equipmentTools,
  ...driveTools,
];

// Маппинг tools к их исполнителям
const toolExecutors: Record<string, (name: string, input: Record<string, unknown>) => Promise<unknown>> = {
  // Equipment tools
  'get_all_equipment': executeEquipmentTool,
  'get_equipment_details': executeEquipmentTool,
  'get_maintenance_log': executeEquipmentTool,
  'add_maintenance_entry': executeEquipmentTool,

  // Drive tools
  'search_files_in_folder': executeDriveTool,
  'read_file_content': executeDriveTool,
};

/**
 * Выполнить вызов tool по имени
 */
export async function executeToolCall(
  name: string,
  input: Record<string, unknown>
): Promise<unknown> {
  const executor = toolExecutors[name];

  if (!executor) {
    throw new Error(`Unknown tool: ${name}`);
  }

  return await executor(name, input);
}
```

### Шаг 1.12: Создать GAS клиент

**Файл: `src/services/gasClient.ts`**

```typescript
import { config } from '../config/env.js';

interface GasResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Клиент для работы с Google Apps Script API
 */
class GasClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.gasApiUrl;
  }

  /**
   * GET запрос к GAS API
   */
  async get<T>(action: string, params?: Record<string, string | undefined>): Promise<T> {
    const url = new URL(this.baseUrl);
    url.searchParams.append('action', action);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.append(key, value);
        }
      });
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`GAS API error: ${response.status} ${response.statusText}`);
    }

    const json = await response.json() as GasResponse<T>;

    if (!json.success) {
      throw new Error(json.error || 'Unknown GAS API error');
    }

    return json.data as T;
  }

  /**
   * POST запрос к GAS API
   */
  async post<T>(action: string, data: Record<string, unknown>): Promise<T> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ action, ...data }),
    });

    if (!response.ok) {
      throw new Error(`GAS API error: ${response.status} ${response.statusText}`);
    }

    const json = await response.json() as GasResponse<T>;

    if (!json.success) {
      throw new Error(json.error || 'Unknown GAS API error');
    }

    return json.data as T;
  }
}

export const gasClient = new GasClient();
```

### Шаг 1.13: Создать роут для чата

**Файл: `src/routes/chat.ts`**

```typescript
import { Router, Response } from 'express';
import { processChatMessage, ChatMessage } from '../services/anthropic.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

interface ChatRequestBody {
  messages: ChatMessage[];
}

/**
 * POST /api/chat
 * Обработка сообщения чата
 */
router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { messages } = req.body as ChatRequestBody;

    // Валидация
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'Messages array is required' });
      return;
    }

    // Проверяем формат сообщений
    for (const msg of messages) {
      if (!msg.role || !msg.content) {
        res.status(400).json({ error: 'Invalid message format' });
        return;
      }
      if (msg.role !== 'user' && msg.role !== 'assistant') {
        res.status(400).json({ error: 'Invalid message role' });
        return;
      }
    }

    console.log(`Chat request from user ${req.user?.email}, messages: ${messages.length}`);

    // Обрабатываем сообщение через Claude
    const response = await processChatMessage({
      messages,
      userId: req.user?.id || '',
    });

    res.json({
      success: true,
      data: response,
    });

  } catch (error) {
    console.error('Chat error:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

export default router;
```

### Шаг 1.14: Создать роут health check

**Файл: `src/routes/health.ts`**

```typescript
import { Router, Request, Response } from 'express';

const router = Router();

/**
 * GET /health
 * Проверка состояния сервиса
 */
router.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
  });
});

export default router;
```

### Шаг 1.15: Создать главный файл сервера

**Файл: `src/index.ts`**

```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config, validateConfig } from './config/env.js';
import chatRouter from './routes/chat.js';
import healthRouter from './routes/health.js';

// Валидация конфигурации
validateConfig();

// Создаём Express приложение
const app = express();

// Middleware безопасности
app.use(helmet());

// CORS
app.use(cors({
  origin: config.allowedOrigins,
  credentials: true,
}));

// Парсинг JSON
app.use(express.json({ limit: '1mb' }));

// Логирование запросов
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Роуты
app.use('/health', healthRouter);
app.use('/api/chat', chatRouter);

// Обработка 404
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Обработка ошибок
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Запуск сервера
app.listen(config.port, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║   AI Consultant API Server                   ║
╠══════════════════════════════════════════════╣
║   Port: ${config.port.toString().padEnd(37)}║
║   Environment: ${config.nodeEnv.padEnd(30)}║
║   Allowed origins: ${config.allowedOrigins.length.toString().padEnd(25)}║
╚══════════════════════════════════════════════╝
  `);
});
```

### Шаг 1.16: Создать Dockerfile

**Файл: `Dockerfile`**

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Копируем package files
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci --only=production

# Копируем исходный код
COPY . .

# Собираем TypeScript
RUN npm run build

# Порт
EXPOSE 3001

# Запуск
CMD ["npm", "start"]
```

### Шаг 1.17: Создать railway.toml

**Файл: `railway.toml`**

```toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile"

[deploy]
startCommand = "npm start"
healthcheckPath = "/health"
healthcheckTimeout = 100
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10
```

### Шаг 1.18: Создать .env.example

**Файл: `.env.example`**

```env
# Server
PORT=3001
NODE_ENV=development

# Anthropic Claude API
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx

# Claude Model (рекомендуется claude-sonnet-4-20250514)
CLAUDE_MODEL=claude-sonnet-4-20250514

# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxxxx

# GAS API URL
GAS_API_URL=https://script.google.com/macros/s/xxxxx/exec

# CORS (разделённые запятой origins)
ALLOWED_ORIGINS=https://your-app.railway.app,http://localhost:5173
```

---

## Часть 2: Деплой на Railway

### Шаг 2.1: Создать новый сервис на Railway

1. Войти в [Railway](https://railway.app)
2. Открыть существующий проект с приложением
3. Нажать **"+ New"** → **"GitHub Repo"**
4. Выбрать репозиторий (если API в том же репо — выбрать его)
5. Указать путь к папке: `ai-consultant-api`

### Шаг 2.2: Настроить переменные окружения

В настройках сервиса на Railway добавить:

| Переменная | Значение |
|------------|----------|
| `PORT` | `3001` |
| `NODE_ENV` | `production` |
| `ANTHROPIC_API_KEY` | `sk-ant-api03-...` (получить на [console.anthropic.com](https://console.anthropic.com)) |
| `CLAUDE_MODEL` | `claude-sonnet-4-20250514` |
| `SUPABASE_URL` | URL из настроек Supabase |
| `SUPABASE_SERVICE_KEY` | Service Role Key из Supabase |
| `GAS_API_URL` | URL вашего GAS Web App |
| `ALLOWED_ORIGINS` | `https://your-app.railway.app` |

### Шаг 2.3: Получить URL сервиса

После деплоя Railway выдаст URL вида:
```
https://ai-consultant-api-production-xxxx.up.railway.app
```

Сохраните этот URL — он понадобится для фронтенда.

### Шаг 2.4: Проверить работу API

```bash
curl https://ai-consultant-api-production-xxxx.up.railway.app/health
```

Ожидаемый ответ:
```json
{"status":"ok","timestamp":"2024-01-15T10:30:00.000Z","version":"1.0.0"}
```

---

## Часть 3: Frontend — Чат-виджет

### Шаг 3.1: Создать структуру компонентов

Создать в существующем приложении:

```
src/features/ai-consultant/
├── components/
│   ├── ChatWidget.tsx        # Основной виджет
│   ├── ChatWidget.css        # Стили виджета
│   ├── ChatMessage.tsx       # Компонент сообщения
│   ├── ChatInput.tsx         # Поле ввода с микрофоном
│   └── VoiceButton.tsx       # Кнопка голосового ввода
├── hooks/
│   ├── useChat.ts            # Хук для работы с чатом
│   └── useSpeechRecognition.ts # Хук для голосового ввода
├── services/
│   └── consultantApi.ts      # API клиент
└── types/
    └── index.ts              # TypeScript типы
```

### Шаг 3.2: Создать API клиент

**Файл: `src/features/ai-consultant/services/consultantApi.ts`**

```typescript
import { supabase } from '../../auth/supabase';

// URL API (из переменных окружения)
const API_URL = import.meta.env.VITE_AI_CONSULTANT_API_URL || '';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  success: boolean;
  data?: {
    message: string;
    toolsUsed?: string[];
  };
  error?: string;
}

/**
 * Отправить сообщение в AI-консультант
 */
export async function sendChatMessage(messages: ChatMessage[]): Promise<ChatResponse> {
  // Получаем текущий токен сессии
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Не авторизован');
  }

  const response = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ messages }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  return await response.json();
}
```

### Шаг 3.3: Создать хук для чата

**Файл: `src/features/ai-consultant/hooks/useChat.ts`**

```typescript
import { useState, useCallback } from 'react';
import { ChatMessage, sendChatMessage } from '../services/consultantApi';

export interface UseChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (text: string) => Promise<void>;
  clearMessages: () => void;
}

export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    setError(null);
    setIsLoading(true);

    // Добавляем сообщение пользователя
    const userMessage: ChatMessage = { role: 'user', content: text };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);

    try {
      // Отправляем на сервер
      const response = await sendChatMessage(newMessages);

      if (response.success && response.data) {
        // Добавляем ответ ассистента
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: response.data.message,
        };
        setMessages([...newMessages, assistantMessage]);
      } else {
        setError(response.error || 'Неизвестная ошибка');
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка отправки');
      // Откатываем сообщение пользователя при ошибке
      setMessages(messages);
    } finally {
      setIsLoading(false);
    }
  }, [messages, isLoading]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearMessages,
  };
}
```

### Шаг 3.4: Создать хук для голосового ввода

**Файл: `src/features/ai-consultant/hooks/useSpeechRecognition.ts`**

```typescript
import { useState, useCallback, useRef, useEffect } from 'react';

// Типы для Web Speech API
interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionError {
  error: string;
  message?: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionError) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}

export interface UseSpeechRecognitionReturn {
  isSupported: boolean;
  isListening: boolean;
  transcript: string;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
}

export function useSpeechRecognition(): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Проверяем поддержку
  const isSupported = typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    if (!isSupported) return;

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'ru-RU';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        }
      }

      if (finalTranscript) {
        setTranscript(prev => prev + finalTranscript);
      }
    };

    recognition.onerror = (event: SpeechRecognitionError) => {
      console.error('Speech recognition error:', event.error);

      switch (event.error) {
        case 'no-speech':
          setError('Речь не обнаружена. Попробуйте ещё раз.');
          break;
        case 'audio-capture':
          setError('Микрофон не найден или не работает.');
          break;
        case 'not-allowed':
          setError('Доступ к микрофону запрещён. Разрешите доступ в настройках браузера.');
          break;
        default:
          setError(`Ошибка распознавания: ${event.error}`);
      }

      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.abort();
    };
  }, [isSupported]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current || isListening) return;

    setError(null);
    setTranscript('');

    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch (err) {
      console.error('Failed to start recognition:', err);
      setError('Не удалось запустить распознавание');
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current || !isListening) return;

    recognitionRef.current.stop();
    setIsListening(false);
  }, [isListening]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setError(null);
  }, []);

  return {
    isSupported,
    isListening,
    transcript,
    error,
    startListening,
    stopListening,
    resetTranscript,
  };
}
```

### Шаг 3.5: Создать компонент сообщения

**Файл: `src/features/ai-consultant/components/ChatMessage.tsx`**

```tsx
import React from 'react';
import './ChatWidget.css';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ role, content }) => {
  return (
    <div className={`ai-chat-message ai-chat-message--${role}`}>
      <div className="ai-chat-message__avatar">
        {role === 'user' ? '👤' : '🤖'}
      </div>
      <div className="ai-chat-message__content">
        <div className="ai-chat-message__text">
          {content.split('\n').map((line, index) => (
            <React.Fragment key={index}>
              {line}
              {index < content.split('\n').length - 1 && <br />}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};
```

### Шаг 3.6: Создать компонент поля ввода

**Файл: `src/features/ai-consultant/components/ChatInput.tsx`**

```tsx
import React, { useState, useRef, useEffect } from 'react';
import { VoiceButton } from './VoiceButton';
import './ChatWidget.css';

interface ChatInputProps {
  onSend: (text: string) => void;
  isLoading: boolean;
  voiceTranscript?: string;
  onVoiceTranscriptUsed?: () => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  isLoading,
  voiceTranscript,
  onVoiceTranscriptUsed,
}) => {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Обновляем текст при получении голосового ввода
  useEffect(() => {
    if (voiceTranscript) {
      setText(prev => prev + (prev ? ' ' : '') + voiceTranscript);
      onVoiceTranscriptUsed?.();
    }
  }, [voiceTranscript, onVoiceTranscriptUsed]);

  // Автоматическое изменение высоты textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [text]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();

    if (text.trim() && !isLoading) {
      onSend(text.trim());
      setText('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <form className="ai-chat-input" onSubmit={handleSubmit}>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Задайте вопрос об оборудовании..."
        disabled={isLoading}
        rows={1}
        className="ai-chat-input__textarea"
      />

      <VoiceButton disabled={isLoading} />

      <button
        type="submit"
        disabled={!text.trim() || isLoading}
        className="ai-chat-input__send"
        title="Отправить"
      >
        {isLoading ? '⏳' : '➤'}
      </button>
    </form>
  );
};
```

### Шаг 3.7: Создать компонент кнопки микрофона

**Файл: `src/features/ai-consultant/components/VoiceButton.tsx`**

```tsx
import React from 'react';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import './ChatWidget.css';

interface VoiceButtonProps {
  disabled?: boolean;
  onTranscript?: (text: string) => void;
}

export const VoiceButton: React.FC<VoiceButtonProps> = ({ disabled, onTranscript }) => {
  const {
    isSupported,
    isListening,
    transcript,
    error,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition();

  // Вызываем callback при получении транскрипции
  React.useEffect(() => {
    if (transcript && onTranscript) {
      onTranscript(transcript);
      resetTranscript();
    }
  }, [transcript, onTranscript, resetTranscript]);

  if (!isSupported) {
    return null; // Скрываем кнопку, если браузер не поддерживает
  }

  const handleClick = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={`ai-chat-voice-btn ${isListening ? 'ai-chat-voice-btn--listening' : ''}`}
      title={isListening ? 'Остановить запись' : 'Голосовой ввод'}
    >
      {isListening ? '🔴' : '🎤'}
      {error && <span className="ai-chat-voice-error">{error}</span>}
    </button>
  );
};
```

### Шаг 3.8: Создать основной виджет чата

**Файл: `src/features/ai-consultant/components/ChatWidget.tsx`**

```tsx
import React, { useState, useRef, useEffect } from 'react';
import { useChat } from '../hooks/useChat';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import './ChatWidget.css';

interface ChatWidgetProps {
  initialOpen?: boolean;
}

export const ChatWidget: React.FC<ChatWidgetProps> = ({ initialOpen = false }) => {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, isLoading, error, sendMessage, clearMessages } = useChat();
  const { transcript, resetTranscript } = useSpeechRecognition();

  // Автопрокрутка к последнему сообщению
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const toggleOpen = () => {
    setIsOpen(!isOpen);
  };

  const handleVoiceTranscriptUsed = () => {
    resetTranscript();
  };

  return (
    <div className={`ai-chat-widget ${isOpen ? 'ai-chat-widget--open' : ''}`}>
      {/* Кнопка открытия */}
      <button
        className="ai-chat-widget__toggle"
        onClick={toggleOpen}
        title={isOpen ? 'Закрыть консультанта' : 'AI Консультант'}
      >
        {isOpen ? '✕' : '💬'}
      </button>

      {/* Окно чата */}
      {isOpen && (
        <div className="ai-chat-widget__window">
          {/* Заголовок */}
          <div className="ai-chat-widget__header">
            <span className="ai-chat-widget__title">
              🤖 AI Консультант
            </span>
            <button
              className="ai-chat-widget__clear"
              onClick={clearMessages}
              title="Очистить историю"
            >
              🗑️
            </button>
          </div>

          {/* Сообщения */}
          <div className="ai-chat-widget__messages">
            {messages.length === 0 && (
              <div className="ai-chat-widget__welcome">
                <p>👋 Привет! Я AI-консультант по оборудованию.</p>
                <p>Вы можете спросить меня:</p>
                <ul>
                  <li>«Покажи список оборудования»</li>
                  <li>«Найди фильтр обезжелезивания»</li>
                  <li>«Покажи журнал обслуживания котла»</li>
                  <li>«Добавь запись о ремонте»</li>
                  <li>«Прочитай инструкцию к насосу»</li>
                </ul>
              </div>
            )}

            {messages.map((msg, index) => (
              <ChatMessage key={index} role={msg.role} content={msg.content} />
            ))}

            {isLoading && (
              <div className="ai-chat-widget__loading">
                <span className="ai-chat-widget__loading-dots">
                  <span>.</span><span>.</span><span>.</span>
                </span>
                Думаю...
              </div>
            )}

            {error && (
              <div className="ai-chat-widget__error">
                ❌ {error}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Поле ввода */}
          <ChatInput
            onSend={sendMessage}
            isLoading={isLoading}
            voiceTranscript={transcript}
            onVoiceTranscriptUsed={handleVoiceTranscriptUsed}
          />
        </div>
      )}
    </div>
  );
};
```

### Шаг 3.9: Создать стили виджета

**Файл: `src/features/ai-consultant/components/ChatWidget.css`**

```css
/* ==========================================
   AI Chat Widget Styles
   ========================================== */

/* Переменные */
:root {
  --ai-chat-primary: #2563eb;
  --ai-chat-primary-hover: #1d4ed8;
  --ai-chat-bg: #ffffff;
  --ai-chat-border: #e5e7eb;
  --ai-chat-text: #1f2937;
  --ai-chat-text-muted: #6b7280;
  --ai-chat-user-bg: #2563eb;
  --ai-chat-user-text: #ffffff;
  --ai-chat-assistant-bg: #f3f4f6;
  --ai-chat-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
  --ai-chat-radius: 16px;
}

/* Основной контейнер */
.ai-chat-widget {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 9999;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* Кнопка открытия */
.ai-chat-widget__toggle {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  border: none;
  background: var(--ai-chat-primary);
  color: white;
  font-size: 24px;
  cursor: pointer;
  box-shadow: var(--ai-chat-shadow);
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ai-chat-widget__toggle:hover {
  background: var(--ai-chat-primary-hover);
  transform: scale(1.05);
}

.ai-chat-widget--open .ai-chat-widget__toggle {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 40px;
  height: 40px;
  font-size: 18px;
  z-index: 10;
}

/* Окно чата */
.ai-chat-widget__window {
  position: absolute;
  bottom: 70px;
  right: 0;
  width: 380px;
  max-width: calc(100vw - 40px);
  height: 550px;
  max-height: calc(100vh - 100px);
  background: var(--ai-chat-bg);
  border-radius: var(--ai-chat-radius);
  box-shadow: var(--ai-chat-shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: ai-chat-slide-up 0.3s ease;
}

@keyframes ai-chat-slide-up {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Заголовок */
.ai-chat-widget__header {
  padding: 16px 20px;
  background: var(--ai-chat-primary);
  color: white;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ai-chat-widget__title {
  font-weight: 600;
  font-size: 16px;
}

.ai-chat-widget__clear {
  background: transparent;
  border: none;
  color: white;
  font-size: 16px;
  cursor: pointer;
  opacity: 0.8;
  transition: opacity 0.2s;
}

.ai-chat-widget__clear:hover {
  opacity: 1;
}

/* Область сообщений */
.ai-chat-widget__messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Приветствие */
.ai-chat-widget__welcome {
  background: var(--ai-chat-assistant-bg);
  padding: 16px;
  border-radius: 12px;
  font-size: 14px;
  color: var(--ai-chat-text);
}

.ai-chat-widget__welcome p {
  margin: 0 0 8px;
}

.ai-chat-widget__welcome ul {
  margin: 8px 0 0;
  padding-left: 20px;
}

.ai-chat-widget__welcome li {
  margin: 4px 0;
  color: var(--ai-chat-text-muted);
}

/* Сообщение */
.ai-chat-message {
  display: flex;
  gap: 10px;
  max-width: 90%;
}

.ai-chat-message--user {
  align-self: flex-end;
  flex-direction: row-reverse;
}

.ai-chat-message--assistant {
  align-self: flex-start;
}

.ai-chat-message__avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--ai-chat-border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
}

.ai-chat-message--user .ai-chat-message__avatar {
  background: var(--ai-chat-user-bg);
}

.ai-chat-message__content {
  flex: 1;
}

.ai-chat-message__text {
  padding: 10px 14px;
  border-radius: 16px;
  font-size: 14px;
  line-height: 1.5;
  word-wrap: break-word;
}

.ai-chat-message--user .ai-chat-message__text {
  background: var(--ai-chat-user-bg);
  color: var(--ai-chat-user-text);
  border-bottom-right-radius: 4px;
}

.ai-chat-message--assistant .ai-chat-message__text {
  background: var(--ai-chat-assistant-bg);
  color: var(--ai-chat-text);
  border-bottom-left-radius: 4px;
}

/* Загрузка */
.ai-chat-widget__loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--ai-chat-text-muted);
  font-size: 14px;
  padding: 10px;
}

.ai-chat-widget__loading-dots span {
  animation: ai-chat-dots 1.4s infinite;
  animation-fill-mode: both;
}

.ai-chat-widget__loading-dots span:nth-child(2) {
  animation-delay: 0.2s;
}

.ai-chat-widget__loading-dots span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes ai-chat-dots {
  0%, 80%, 100% { opacity: 0; }
  40% { opacity: 1; }
}

/* Ошибка */
.ai-chat-widget__error {
  background: #fef2f2;
  color: #dc2626;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
}

/* Поле ввода */
.ai-chat-input {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--ai-chat-border);
  background: var(--ai-chat-bg);
}

.ai-chat-input__textarea {
  flex: 1;
  border: 1px solid var(--ai-chat-border);
  border-radius: 20px;
  padding: 10px 16px;
  font-size: 14px;
  resize: none;
  max-height: 120px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.2s;
}

.ai-chat-input__textarea:focus {
  border-color: var(--ai-chat-primary);
}

.ai-chat-input__textarea:disabled {
  background: #f9fafb;
}

.ai-chat-input__send {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  background: var(--ai-chat-primary);
  color: white;
  font-size: 18px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ai-chat-input__send:hover:not(:disabled) {
  background: var(--ai-chat-primary-hover);
}

.ai-chat-input__send:disabled {
  background: var(--ai-chat-border);
  cursor: not-allowed;
}

/* Кнопка микрофона */
.ai-chat-voice-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid var(--ai-chat-border);
  background: white;
  font-size: 18px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ai-chat-voice-btn:hover:not(:disabled) {
  background: #f9fafb;
}

.ai-chat-voice-btn--listening {
  background: #fef2f2;
  border-color: #dc2626;
  animation: ai-chat-pulse 1.5s infinite;
}

@keyframes ai-chat-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}

.ai-chat-voice-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Мобильная адаптация */
@media (max-width: 480px) {
  .ai-chat-widget__window {
    width: 100%;
    height: calc(100vh - 80px);
    max-height: none;
    bottom: 0;
    right: 0;
    border-radius: var(--ai-chat-radius) var(--ai-chat-radius) 0 0;
  }

  .ai-chat-widget--open .ai-chat-widget__toggle {
    top: 10px;
    right: 10px;
    bottom: auto;
  }
}
```

### Шаг 3.10: Интегрировать виджет в приложение

**Файл: `src/App.tsx` (добавить импорт и компонент)**

```tsx
// В начало файла добавить импорт
import { ChatWidget } from './features/ai-consultant/components/ChatWidget';

// В конец JSX (перед закрывающим тегом) добавить
<ChatWidget />
```

### Шаг 3.11: Добавить переменную окружения для фронтенда

**Файл: `.env` (локально)**

```env
VITE_AI_CONSULTANT_API_URL=http://localhost:3001
```

**На Railway** добавить переменную в настройках фронтенд-сервиса:

```
VITE_AI_CONSULTANT_API_URL=https://ai-consultant-api-production-xxxx.up.railway.app
```

---

## Часть 4: Интеграция с чтением PDF

### Шаг 4.1: Добавить функцию getFileContent в GAS

Если вы уже реализовали инструкцию из `PDF_READING_IMPLEMENTATION.md`, то tools для чтения файлов уже готовы.

Если нет — следуйте инструкции в файле `docs/PDF_READING_IMPLEMENTATION.md`.

### Шаг 4.2: Добавить обработчик в Code.gs

Убедитесь, что в `Code.gs` есть case для `getFileContent`:

```javascript
case 'getFileContent':
  return handleGetFileContent(params);
```

---

## Часть 5: Работа с фото обслуживания

Эта часть описывает функциональность прикрепления фотографий к записям журнала обслуживания.

### Архитектура работы с фото

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Браузер       │     │   Railway API    │     │   Google Apps   │
│   (Камера/      │────▶│   (Base64)       │────▶│   Script        │
│   Галерея)      │     │                  │     │                 │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                                                          ▼
                                               ┌─────────────────────┐
                                               │   Google Drive      │
                                               │   📁 Оборудование/  │
                                               │   └── 📁 Фильтр №1/ │
                                               │       └── 📁 Фото   │
                                               │           обслуж./  │
                                               │           └── 📷    │
                                               └─────────────────────┘
```

### Структура папок на Google Drive

```
📁 Оборудование/
├── 📁 Фильтр обезжелезивания №1/
│   ├── 📄 Паспорт.pdf
│   ├── 📄 Журнал обслуживания (Google Sheet)
│   └── 📁 Фото обслуживания/           ← Создаётся автоматически
│       ├── 📷 2024-01-15_ТО_замена_фильтра.jpg
│       ├── 📷 2024-01-20_Осмотр.jpg
│       └── 📷 2024-02-01_Ремонт_корпуса.jpg
```

### Шаг 5.1: Добавить функции для работы с фото в GAS

**Файл: `DriveOperations.gs` — добавить в конец:**

```javascript
// ============================================================================
// ФУНКЦИИ РАБОТЫ С ФОТО ОБСЛУЖИВАНИЯ
// ============================================================================

/**
 * Загрузить фото в папку оборудования
 *
 * Автоматически создаёт подпапку "Фото обслуживания" если её нет.
 * Имя файла формируется из даты и описания.
 *
 * @param {Object} params - Параметры загрузки
 * @param {string} params.equipmentFolderId - ID папки оборудования в Google Drive
 * @param {string} params.photoBase64 - Фото в формате Base64
 * @param {string} params.mimeType - MIME тип (image/jpeg, image/png)
 * @param {string} params.description - Описание фото (для имени файла)
 * @param {string} params.date - Дата в формате YYYY-MM-DD
 * @param {string} params.maintenanceType - Тип работ (ТО, Ремонт, Осмотр)
 * @returns {Object} {success, fileId, fileUrl, fileName, error}
 */
function uploadMaintenancePhoto(params) {
  try {
    Logger.log('📷 uploadMaintenancePhoto: начало');
    Logger.log('  - equipmentFolderId: ' + params.equipmentFolderId);
    Logger.log('  - mimeType: ' + params.mimeType);
    Logger.log('  - description: ' + params.description);
    Logger.log('  - date: ' + params.date);

    // Проверка обязательных параметров
    if (!params.equipmentFolderId) {
      return { success: false, error: 'ID папки оборудования не указан' };
    }
    if (!params.photoBase64) {
      return { success: false, error: 'Фото не передано' };
    }

    // Получаем папку оборудования
    const equipmentFolder = DriveApp.getFolderById(params.equipmentFolderId);
    Logger.log('  - Папка оборудования: ' + equipmentFolder.getName());

    // Ищем или создаём подпапку "Фото обслуживания"
    const photoFolderName = 'Фото обслуживания';
    let photoFolder;

    const folders = equipmentFolder.getFoldersByName(photoFolderName);
    if (folders.hasNext()) {
      photoFolder = folders.next();
      Logger.log('  - Папка "Фото обслуживания" найдена');
    } else {
      photoFolder = equipmentFolder.createFolder(photoFolderName);
      Logger.log('  - Папка "Фото обслуживания" создана');

      // Наследуем доступ от родительской папки
      try {
        const usersWithAccess = getUsersWithEquipmentAccess();
        for (let i = 0; i < usersWithAccess.length; i++) {
          try {
            photoFolder.addViewer(usersWithAccess[i]);
          } catch (e) {
            Logger.log('  ⚠️ Не удалось добавить viewer: ' + usersWithAccess[i]);
          }
        }
      } catch (accessError) {
        Logger.log('  ⚠️ Ошибка настройки доступа: ' + accessError);
      }
    }

    // Формируем имя файла
    const date = params.date || new Date().toISOString().split('T')[0];
    const maintenanceType = params.maintenanceType || 'Обслуживание';
    const description = params.description || '';

    // Очищаем описание от недопустимых символов
    const cleanDescription = description
      .replace(/[/\\:*?"<>|]/g, '_')
      .substring(0, 50)
      .trim();

    // Определяем расширение по MIME типу
    const mimeType = params.mimeType || 'image/jpeg';
    const extension = mimeType === 'image/png' ? 'png' : 'jpg';

    // Формируем имя: 2024-01-15_ТО_описание.jpg
    let fileName = date + '_' + maintenanceType;
    if (cleanDescription) {
      fileName += '_' + cleanDescription;
    }
    fileName += '.' + extension;

    Logger.log('  - Имя файла: ' + fileName);

    // Декодируем Base64
    // Удаляем префикс data:image/...;base64, если есть
    let base64Data = params.photoBase64;
    if (base64Data.includes(',')) {
      base64Data = base64Data.split(',')[1];
    }

    const blob = Utilities.newBlob(
      Utilities.base64Decode(base64Data),
      mimeType,
      fileName
    );

    // Создаём файл в папке
    const file = photoFolder.createFile(blob);

    Logger.log('✅ Фото загружено: ' + file.getUrl());

    return {
      success: true,
      fileId: file.getId(),
      fileUrl: file.getUrl(),
      fileName: fileName,
      folderUrl: photoFolder.getUrl()
    };

  } catch (error) {
    Logger.log('❌ uploadMaintenancePhoto ошибка: ' + error.toString());
    Logger.log('  - Stack: ' + (error.stack || 'нет стека'));

    return {
      success: false,
      error: 'Ошибка загрузки фото: ' + error.toString()
    };
  }
}

/**
 * Получить список фото обслуживания для оборудования
 *
 * @param {string} equipmentFolderId - ID папки оборудования
 * @returns {Object} {success, photos: Array, error}
 */
function getMaintenancePhotos(equipmentFolderId) {
  try {
    Logger.log('📷 getMaintenancePhotos: ' + equipmentFolderId);

    if (!equipmentFolderId) {
      return { success: false, error: 'ID папки не указан', photos: [] };
    }

    const equipmentFolder = DriveApp.getFolderById(equipmentFolderId);

    // Ищем папку "Фото обслуживания"
    const folders = equipmentFolder.getFoldersByName('Фото обслуживания');

    if (!folders.hasNext()) {
      Logger.log('  - Папка "Фото обслуживания" не найдена');
      return { success: true, photos: [], message: 'Фото обслуживания отсутствуют' };
    }

    const photoFolder = folders.next();
    const files = photoFolder.getFiles();
    const photos = [];

    while (files.hasNext()) {
      const file = files.next();
      const mimeType = file.getMimeType();

      // Фильтруем только изображения
      if (mimeType.startsWith('image/')) {
        photos.push({
          id: file.getId(),
          name: file.getName(),
          url: file.getUrl(),
          thumbnailUrl: 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w200',
          size: file.getSize(),
          mimeType: mimeType,
          createdTime: file.getDateCreated().toISOString(),
          modifiedTime: file.getLastUpdated().toISOString()
        });
      }
    }

    // Сортируем по дате создания (новые сначала)
    photos.sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));

    Logger.log('  - Найдено фото: ' + photos.length);

    return {
      success: true,
      photos: photos,
      folderUrl: photoFolder.getUrl()
    };

  } catch (error) {
    Logger.log('❌ getMaintenancePhotos ошибка: ' + error.toString());

    return {
      success: false,
      error: 'Ошибка получения фото: ' + error.toString(),
      photos: []
    };
  }
}

/**
 * Извлечь ID папки из URL Google Drive
 * (вспомогательная функция, если не существует)
 */
function extractFolderIdFromUrl(folderUrl) {
  if (!folderUrl) return null;

  const match = folderUrl.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];

  // Если это уже ID
  if (/^[a-zA-Z0-9_-]{20,}$/.test(folderUrl)) {
    return folderUrl;
  }

  return null;
}
```

### Шаг 5.2: Добавить обработчики в Code.gs

**Файл: `Code.gs` — добавить cases:**

```javascript
case 'uploadMaintenancePhoto':
  return handleUploadMaintenancePhoto(data);

case 'getMaintenancePhotos':
  return handleGetMaintenancePhotos(params);
```

**Добавить функции-обработчики:**

```javascript
/**
 * Обработчик загрузки фото обслуживания
 */
function handleUploadMaintenancePhoto(data) {
  try {
    Logger.log('📷 handleUploadMaintenancePhoto');

    // Если передан equipmentId вместо folderId, получаем folderId из оборудования
    let folderId = data.equipmentFolderId;

    if (!folderId && data.equipmentId) {
      // Получаем оборудование по ID
      const equipment = getEquipmentById(data.equipmentId);
      if (equipment && equipment.googleDriveUrl) {
        folderId = extractFolderIdFromUrl(equipment.googleDriveUrl);
      }
    }

    if (!folderId) {
      return createErrorResponse('Не указан ID папки или оборудования');
    }

    const result = uploadMaintenancePhoto({
      equipmentFolderId: folderId,
      photoBase64: data.photoBase64,
      mimeType: data.mimeType || 'image/jpeg',
      description: data.description || '',
      date: data.date || new Date().toISOString().split('T')[0],
      maintenanceType: data.maintenanceType || 'Обслуживание'
    });

    if (result.success) {
      return createJsonResponse(result);
    } else {
      return createErrorResponse(result.error);
    }

  } catch (error) {
    Logger.log('❌ handleUploadMaintenancePhoto ошибка: ' + error.toString());
    return createErrorResponse('Ошибка: ' + error.toString());
  }
}

/**
 * Обработчик получения списка фото
 */
function handleGetMaintenancePhotos(params) {
  try {
    Logger.log('📷 handleGetMaintenancePhotos');

    let folderId = params.folderId;

    // Если передан equipmentId, получаем folderId
    if (!folderId && params.equipmentId) {
      const equipment = getEquipmentById(params.equipmentId);
      if (equipment && equipment.googleDriveUrl) {
        folderId = extractFolderIdFromUrl(equipment.googleDriveUrl);
      }
    }

    if (!folderId) {
      return createErrorResponse('Не указан ID папки или оборудования');
    }

    const result = getMaintenancePhotos(folderId);
    return createJsonResponse(result);

  } catch (error) {
    Logger.log('❌ handleGetMaintenancePhotos ошибка: ' + error.toString());
    return createErrorResponse('Ошибка: ' + error.toString());
  }
}
```

### Шаг 5.3: Добавить Tools для фото в Backend API

**Файл: `ai-consultant-api/src/tools/photoTools.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { gasClient } from '../services/gasClient.js';

/**
 * Tool definitions для работы с фото
 */
export const photoTools: Anthropic.Tool[] = [
  {
    name: 'upload_maintenance_photo',
    description: 'Загрузить фото обслуживания в папку оборудования на Google Drive. ' +
      'Создаёт подпапку "Фото обслуживания" если её нет. ' +
      'ВАЖНО: Перед загрузкой покажи пользователю превью и запроси подтверждение.',
    input_schema: {
      type: 'object' as const,
      properties: {
        equipment_id: {
          type: 'string',
          description: 'ID оборудования',
        },
        photo_base64: {
          type: 'string',
          description: 'Фото в формате Base64 (без префикса data:image/...)',
        },
        mime_type: {
          type: 'string',
          enum: ['image/jpeg', 'image/png'],
          description: 'MIME тип изображения',
        },
        description: {
          type: 'string',
          description: 'Краткое описание фото (для имени файла)',
        },
        date: {
          type: 'string',
          description: 'Дата в формате YYYY-MM-DD',
        },
        maintenance_type: {
          type: 'string',
          description: 'Тип работ (ТО, Ремонт, Осмотр, Замена и т.д.)',
        },
      },
      required: ['equipment_id', 'photo_base64'],
    },
  },
  {
    name: 'get_maintenance_photos',
    description: 'Получить список всех фото обслуживания для оборудования.',
    input_schema: {
      type: 'object' as const,
      properties: {
        equipment_id: {
          type: 'string',
          description: 'ID оборудования',
        },
      },
      required: ['equipment_id'],
    },
  },
];

/**
 * Выполнение tools для фото
 */
export async function executePhotoTool(
  name: string,
  input: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case 'upload_maintenance_photo':
      return await gasClient.post('uploadMaintenancePhoto', {
        equipmentId: input.equipment_id,
        photoBase64: input.photo_base64,
        mimeType: input.mime_type || 'image/jpeg',
        description: input.description || '',
        date: input.date,
        maintenanceType: input.maintenance_type || 'Обслуживание',
      });

    case 'get_maintenance_photos':
      return await gasClient.get('getMaintenancePhotos', {
        equipmentId: input.equipment_id as string,
      });

    default:
      throw new Error(`Unknown photo tool: ${name}`);
  }
}
```

### Шаг 5.4: Зарегистрировать photo tools

**Файл: `ai-consultant-api/src/tools/index.ts` — обновить:**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { equipmentTools, executeEquipmentTool } from './equipmentTools.js';
import { driveTools, executeDriveTool } from './driveTools.js';
import { photoTools, executePhotoTool } from './photoTools.js';

// Объединяем все tools
export const tools: Anthropic.Tool[] = [
  ...equipmentTools,
  ...driveTools,
  ...photoTools,
];

// Маппинг tools к их исполнителям
const toolExecutors: Record<string, (name: string, input: Record<string, unknown>) => Promise<unknown>> = {
  // Equipment tools
  'get_all_equipment': executeEquipmentTool,
  'get_equipment_details': executeEquipmentTool,
  'get_maintenance_log': executeEquipmentTool,
  'add_maintenance_entry': executeEquipmentTool,

  // Drive tools
  'search_files_in_folder': executeDriveTool,
  'read_file_content': executeDriveTool,

  // Photo tools
  'upload_maintenance_photo': executePhotoTool,
  'get_maintenance_photos': executePhotoTool,
};

// ... остальной код без изменений
```

### Шаг 5.5: Добавить endpoint для загрузки фото в Backend API

**Файл: `ai-consultant-api/src/routes/upload.ts`**

```typescript
import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { gasClient } from '../services/gasClient.js';

const router = Router();

// Максимальный размер фото: 10MB
const MAX_PHOTO_SIZE = 10 * 1024 * 1024;

interface UploadRequestBody {
  equipmentId: string;
  photoBase64: string;
  mimeType?: string;
  description?: string;
  date?: string;
  maintenanceType?: string;
}

/**
 * POST /api/upload/photo
 * Загрузка фото обслуживания
 */
router.post('/photo', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = req.body as UploadRequestBody;

    // Валидация
    if (!body.equipmentId) {
      res.status(400).json({ error: 'equipmentId is required' });
      return;
    }

    if (!body.photoBase64) {
      res.status(400).json({ error: 'photoBase64 is required' });
      return;
    }

    // Проверяем размер
    const base64Size = body.photoBase64.length * 0.75; // примерный размер в байтах
    if (base64Size > MAX_PHOTO_SIZE) {
      res.status(400).json({ error: 'Photo is too large. Maximum size is 10MB' });
      return;
    }

    console.log(`Photo upload from user ${req.user?.email}, equipment: ${body.equipmentId}`);

    // Загружаем через GAS API
    const result = await gasClient.post('uploadMaintenancePhoto', {
      equipmentId: body.equipmentId,
      photoBase64: body.photoBase64,
      mimeType: body.mimeType || 'image/jpeg',
      description: body.description || '',
      date: body.date || new Date().toISOString().split('T')[0],
      maintenanceType: body.maintenanceType || 'Обслуживание',
    });

    res.json({
      success: true,
      data: result,
    });

  } catch (error) {
    console.error('Upload error:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

/**
 * GET /api/upload/photos/:equipmentId
 * Получить список фото оборудования
 */
router.get('/photos/:equipmentId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { equipmentId } = req.params;

    const result = await gasClient.get('getMaintenancePhotos', {
      equipmentId,
    });

    res.json({
      success: true,
      data: result,
    });

  } catch (error) {
    console.error('Get photos error:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

export default router;
```

### Шаг 5.6: Зарегистрировать роут в index.ts

**Файл: `ai-consultant-api/src/index.ts` — добавить:**

```typescript
import uploadRouter from './routes/upload.js';

// ... после других роутов
app.use('/api/upload', uploadRouter);
```

### Шаг 5.7: Добавить компонент для фото в Frontend

**Файл: `src/features/ai-consultant/components/PhotoButton.tsx`**

```tsx
import React, { useRef, useState } from 'react';
import './ChatWidget.css';

interface PhotoButtonProps {
  disabled?: boolean;
  onPhotoSelected: (photo: { base64: string; mimeType: string }) => void;
}

export const PhotoButton: React.FC<PhotoButtonProps> = ({ disabled, onPhotoSelected }) => {
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Проверяем тип файла
    if (!file.type.startsWith('image/')) {
      alert('Пожалуйста, выберите изображение');
      return;
    }

    // Проверяем размер (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('Файл слишком большой. Максимальный размер: 10MB');
      return;
    }

    setIsLoading(true);

    try {
      // Конвертируем в Base64
      const base64 = await fileToBase64(file);

      onPhotoSelected({
        base64,
        mimeType: file.type,
      });

    } catch (error) {
      console.error('Error reading file:', error);
      alert('Ошибка чтения файла');
    } finally {
      setIsLoading(false);
      // Сбрасываем input для возможности выбора того же файла
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment" // Открывает камеру на мобильных
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || isLoading}
        className="ai-chat-photo-btn"
        title="Прикрепить фото"
      >
        {isLoading ? '⏳' : '📷'}
      </button>
    </>
  );
};

/**
 * Конвертировать файл в Base64
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result as string;
      // Удаляем префикс data:image/...;base64,
      const base64 = result.split(',')[1];
      resolve(base64);
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsDataURL(file);
  });
}
```

### Шаг 5.8: Добавить стили для кнопки фото

**Файл: `src/features/ai-consultant/components/ChatWidget.css` — добавить:**

```css
/* Кнопка фото */
.ai-chat-photo-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid var(--ai-chat-border);
  background: white;
  font-size: 18px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ai-chat-photo-btn:hover:not(:disabled) {
  background: #f0f9ff;
  border-color: var(--ai-chat-primary);
}

.ai-chat-photo-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Превью фото в чате */
.ai-chat-photo-preview {
  max-width: 200px;
  max-height: 150px;
  border-radius: 8px;
  margin: 8px 0;
  cursor: pointer;
}

.ai-chat-photo-preview:hover {
  opacity: 0.9;
}
```

### Шаг 5.9: Обновить ChatInput для поддержки фото

**Файл: `src/features/ai-consultant/components/ChatInput.tsx` — обновить:**

```tsx
import React, { useState, useRef, useEffect } from 'react';
import { VoiceButton } from './VoiceButton';
import { PhotoButton } from './PhotoButton';
import './ChatWidget.css';

interface ChatInputProps {
  onSend: (text: string, photo?: { base64: string; mimeType: string }) => void;
  isLoading: boolean;
  voiceTranscript?: string;
  onVoiceTranscriptUsed?: () => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  isLoading,
  voiceTranscript,
  onVoiceTranscriptUsed,
}) => {
  const [text, setText] = useState('');
  const [pendingPhoto, setPendingPhoto] = useState<{ base64: string; mimeType: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ... остальной код

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();

    if ((text.trim() || pendingPhoto) && !isLoading) {
      onSend(text.trim(), pendingPhoto || undefined);
      setText('');
      setPendingPhoto(null);
    }
  };

  const handlePhotoSelected = (photo: { base64: string; mimeType: string }) => {
    setPendingPhoto(photo);
    // Фокусируем на textarea для ввода описания
    textareaRef.current?.focus();
  };

  const handleRemovePhoto = () => {
    setPendingPhoto(null);
  };

  return (
    <form className="ai-chat-input" onSubmit={handleSubmit}>
      {/* Превью прикреплённого фото */}
      {pendingPhoto && (
        <div className="ai-chat-input__photo-preview">
          <img
            src={`data:${pendingPhoto.mimeType};base64,${pendingPhoto.base64}`}
            alt="Preview"
            className="ai-chat-photo-preview"
          />
          <button
            type="button"
            onClick={handleRemovePhoto}
            className="ai-chat-input__remove-photo"
            title="Удалить фото"
          >
            ✕
          </button>
        </div>
      )}

      <div className="ai-chat-input__row">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={pendingPhoto ? "Добавьте описание к фото..." : "Задайте вопрос..."}
          disabled={isLoading}
          rows={1}
          className="ai-chat-input__textarea"
        />

        <PhotoButton
          disabled={isLoading}
          onPhotoSelected={handlePhotoSelected}
        />

        <VoiceButton disabled={isLoading} />

        <button
          type="submit"
          disabled={(!text.trim() && !pendingPhoto) || isLoading}
          className="ai-chat-input__send"
          title="Отправить"
        >
          {isLoading ? '⏳' : '➤'}
        </button>
      </div>
    </form>
  );
};
```

### Шаг 5.10: Обновить useChat для поддержки фото

**Файл: `src/features/ai-consultant/hooks/useChat.ts` — обновить sendMessage:**

```typescript
const sendMessage = useCallback(async (
  text: string,
  photo?: { base64: string; mimeType: string }
) => {
  if ((!text.trim() && !photo) || isLoading) return;

  setError(null);
  setIsLoading(true);

  // Формируем сообщение пользователя
  let userContent = text;
  if (photo) {
    userContent = text
      ? `[Фото прикреплено]\n${text}`
      : '[Фото прикреплено]';
  }

  const userMessage: ChatMessage = { role: 'user', content: userContent };
  const newMessages = [...messages, userMessage];
  setMessages(newMessages);

  try {
    // Если есть фото, сначала загружаем его
    // (или передаём в API для обработки Claude)
    const response = await sendChatMessage(newMessages, photo);

    // ... остальной код
  } catch (err) {
    // ...
  }
}, [messages, isLoading]);
```

---

## Часть 6: Тестирование

### Тест 1: Проверка Backend API

```bash
# Health check
curl https://your-api.railway.app/health

# Тест авторизации (нужен токен)
curl -X POST https://your-api.railway.app/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SUPABASE_TOKEN" \
  -d '{"messages":[{"role":"user","content":"Привет"}]}'
```

### Тест 2: Проверка фронтенда

1. Открыть приложение в браузере
2. Нажать на кнопку чата (💬 в правом нижнем углу)
3. Написать "Покажи список оборудования"
4. Проверить ответ

### Тест 3: Проверка голосового ввода

1. Открыть чат
2. Нажать кнопку микрофона (🎤)
3. Разрешить доступ к микрофону
4. Сказать "Найди фильтр обезжелезивания"
5. Проверить, что текст распознался и появился в поле ввода

### Тест 4: Проверка чтения PDF

1. Открыть чат
2. Написать "Прочитай инструкцию на фильтр обезжелезивания №2"
3. Проверить, что консультант нашёл файл и показал содержимое

### Тест 5: Проверка загрузки фото

1. Открыть чат
2. Нажать кнопку камеры (📷)
3. Сделать фото или выбрать из галереи
4. Добавить описание: "Заменил фильтрующий элемент на фильтре №1"
5. Отправить сообщение
6. Проверить, что:
   - Консультант распознал оборудование
   - Предложил создать запись в журнале
   - Фото загрузилось в папку "Фото обслуживания"
7. Проверить на Google Drive, что создалась папка и файл

### Тест 6: Проверка получения списка фото

1. Открыть чат
2. Написать "Покажи фото обслуживания фильтра №1"
3. Проверить, что консультант показал список фото с ссылками

---

## Часть 7: Структура файлов после реализации

```
project/
├── ai-consultant-api/           # NEW: Backend Proxy API
│   ├── src/
│   │   ├── index.ts
│   │   ├── routes/
│   │   │   ├── chat.ts
│   │   │   ├── upload.ts        # NEW: Загрузка фото
│   │   │   └── health.ts
│   │   ├── services/
│   │   │   ├── anthropic.ts
│   │   │   └── gasClient.ts
│   │   ├── tools/
│   │   │   ├── index.ts
│   │   │   ├── equipmentTools.ts
│   │   │   ├── driveTools.ts
│   │   │   └── photoTools.ts    # NEW: Tools для фото
│   │   ├── middleware/
│   │   └── config/
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   └── railway.toml
│
├── src/
│   ├── features/
│   │   ├── ai-consultant/       # NEW: Frontend Chat Widget
│   │   │   ├── components/
│   │   │   │   ├── ChatWidget.tsx
│   │   │   │   ├── ChatWidget.css
│   │   │   │   ├── ChatMessage.tsx
│   │   │   │   ├── ChatInput.tsx
│   │   │   │   ├── VoiceButton.tsx
│   │   │   │   └── PhotoButton.tsx  # NEW: Кнопка фото
│   │   │   ├── hooks/
│   │   │   │   ├── useChat.ts
│   │   │   │   └── useSpeechRecognition.ts
│   │   │   ├── services/
│   │   │   │   └── consultantApi.ts
│   │   │   └── types/
│   │   │       └── index.ts
│   │   └── ... (existing features)
│   └── App.tsx                  # MODIFIED: добавлен ChatWidget
│
├── backend/equipment-db/        # EXISTING: Google Apps Script
│   ├── DriveOperations.gs       # MODIFIED: +getFileContent, +uploadMaintenancePhoto
│   └── Code.gs                  # MODIFIED: +handleGetFileContent, +handleUploadPhoto
│
└── docs/
    ├── WEB_AI_CONSULTANT_PLAN.md    # NEW: Эта инструкция
    ├── PDF_READING_IMPLEMENTATION.md # Инструкция по чтению PDF
    └── TELEGRAM_BOT_PLAN.md         # План Telegram бота
```

---

## Часть 8: Сравнение с Telegram ботом

| Критерий | Web Консультант | Telegram Бот |
|----------|-----------------|--------------|
| **Установка** | Не требуется | Требуется Telegram |
| **Авторизация** | Автоматическая (Supabase) | Через email |
| **Голосовой ввод** | Web Speech API (браузер) | Whisper (сервер) |
| **Интеграция с UI** | Глубокая (в приложении) | Отдельное приложение |
| **Push уведомления** | Ограничены | Полноценные |
| **Работа офлайн** | Нет | Нет |
| **Стоимость** | ~$5-15/мес | ~$5-15/мес |
| **Время разработки** | 8-12 дней | 12-18 дней |
| **Мобильный доступ** | PWA | Нативное приложение |

### Рекомендация

**Web Консультант лучше если:**
- Пользователи уже работают в веб-приложении
- Важна глубокая интеграция с интерфейсом
- Не нужны push-уведомления

**Telegram Бот лучше если:**
- Пользователи часто используют Telegram
- Важны push-уведомления о ТО
- Нужен быстрый доступ с телефона без открытия браузера

---

## Часть 9: Стоимость эксплуатации

| Компонент | Стоимость | Примечание |
|-----------|-----------|------------|
| Railway (Proxy API) | ~$5/мес | Hobby plan достаточно |
| Anthropic Claude | ~$0.01-0.03/запрос | Sonnet для сложных |
| Web Speech API | Бесплатно | Работает в браузере |
| Supabase | Бесплатно | Free tier |
| Google Drive | Бесплатно | Существующий аккаунт |

**Итого: ~$5-15/месяц**

---

## Примеры диалогов с фото

### Пример 1: Добавление фото с описанием работ

```
Пользователь: [📷 Фото] + "Заменил фильтрующий элемент на фильтре №2"

Консультант: 📷 Фото получено!

Я определил:
- 🔧 Оборудование: Фильтр обезжелезивания ФО-0,8-1,5 №2
- 📅 Дата: 2024-02-02
- 📋 Тип работ: Замена
- 📝 Описание: Заменил фильтрующий элемент

Создать запись в журнале обслуживания с этим фото?

Пользователь: Да, исполнитель Петров

Консультант: ✅ Запись добавлена в журнал обслуживания!
📷 Фото сохранено: https://drive.google.com/file/d/xxx/view

Папка: Фильтр обезжелезивания №2 / Фото обслуживания
```

### Пример 2: Запрос фото обслуживания

```
Пользователь: Покажи все фото обслуживания котла Clayton

Консультант: 📷 Фото обслуживания парогенератора Clayton SEG-60-1:

1. 📸 2024-01-15_ТО_очистка_змеевика.jpg
   🔗 [Открыть](https://drive.google.com/file/d/xxx/view)

2. 📸 2024-01-10_Осмотр_деаратор.jpg
   🔗 [Открыть](https://drive.google.com/file/d/yyy/view)

3. 📸 2023-12-20_Ремонт_клапаны.jpg
   🔗 [Открыть](https://drive.google.com/file/d/zzz/view)

📁 [Открыть папку](https://drive.google.com/drive/folders/xxx)
```

### Пример 3: Голосовое сообщение + фото

```
Пользователь: [📷 Фото] + 🎤 "Сегодня провели осмотр насоса, обнаружил течь сальника"

Консультант: 🎤 Распознано: "Сегодня провели осмотр насоса, обнаружил течь сальника"
📷 Фото получено!

Создать запись о неисправности?

- 🔧 Оборудование: (уточните какой насос)
- 📅 Дата: 2024-02-02
- 📋 Тип: Осмотр
- ⚠️ Обнаружено: Течь сальника
- 📷 Фото: приложено

Укажите, какой именно насос.

Пользователь: Grundfos на водоподготовке

Консультант: ✅ Запись добавлена в журнал!

⚠️ Рекомендация: Течь сальника требует скорейшего ремонта.
Запланировать работы по замене?
```

---

## Дальнейшее развитие

1. **Кэширование ответов** — сохранять частые запросы
2. **История диалогов** — сохранять в Supabase
3. **Контекст страницы** — автоматически определять текущее оборудование
4. **Режим обучения** — подсказки для новых пользователей
5. **Аналитика** — статистика использования консультанта
6. **Мультиязычность** — поддержка английского языка
