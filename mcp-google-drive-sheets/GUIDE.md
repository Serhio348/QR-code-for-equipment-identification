# Пошаговое руководство: Создание MCP сервера для Google Drive/Sheets

## Архитектура: MCP как обёртка над GAS

**ВАЖНО:** MCP сервер — это **обёртка** над существующим Google Apps Script бэкендом, а НЕ дублирование логики!

### Как работает создание оборудования (уже реализовано в GAS):

```
1. Вызывается addEquipment({ name: "Фильтр ФО-0,8", type: "filter" })
2. GAS автоматически создаёт папку "Фильтр ФО-0,8" в Google Drive
3. URL папки сохраняется в поле googleDriveUrl
4. QR код = ссылка на эту папку
5. Данные записываются в Google Sheets
```

### Что делает MCP сервер:

```
┌─────────────────────────┐      ┌─────────────────────────┐
│      MCP сервер         │      │    GAS бэкенд           │
│   (просто обёртка)      │ ───► │  (вся логика здесь)     │
└─────────────────────────┘      └─────────────────────────┘

MCP инструмент              →    GAS функция
─────────────────────────────────────────────────────────────
sheets_create_equipment     →    addEquipment() + createDriveFolder()
sheets_delete_equipment     →    deleteEquipment() + deleteDriveFolder()
drive_search_files          →    getFolderFiles()
drive_upload_file           →    googleapis (новое, нет в GAS)
```

### Зачем тогда MCP?

1. **Унифицированный интерфейс** — Claude может работать с оборудованием
2. **Валидация** — проверка данных перед отправкой
3. **Загрузка файлов** — googleapis для загрузки в папки (этого нет в GAS)

---

## Содержание
1. [Этап 1: Инициализация проекта](#этап-1-инициализация-проекта)
2. [Этап 2: Конфигурация TypeScript](#этап-2-конфигурация-typescript)
3. [Этап 3: Переменные окружения](#этап-3-переменные-окружения)
4. [Этап 4: Типы данных](#этап-4-типы-данных)
5. [Этап 5: GAS Client](#этап-5-gas-client)
6. [Этап 6: Google Drive Client (только для загрузки файлов)](#этап-6-google-drive-client)
7. [Этап 7: MCP Server](#этап-7-mcp-server)
8. [Этап 8: Инструменты](#этап-8-инструменты)
9. [Этап 9: Тестирование](#этап-9-тестирование)

---

## Этап 1: Инициализация проекта

### Шаг 1.1: Создание директории
Откройте терминал в корне проекта и выполните:

```bash
cd e:/Projects/QR-code-for-equipment-identification
mkdir mcp-google-drive-sheets
cd mcp-google-drive-sheets
```

### Шаг 1.2: Инициализация npm проекта
```bash
npm init -y
```

Это создаст `package.json`. Откройте его и замените содержимое на:

```json
{
  "name": "mcp-google-drive-sheets",
  "version": "1.0.0",
  "description": "MCP сервер для работы с Google Drive и Sheets для управления оборудованием",
  "main": "dist/index.js",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsc --watch",
    "test": "vitest"
  },
  "keywords": ["mcp", "google-drive", "google-sheets"],
  "license": "MIT"
}
```

**Объяснение каждого поля:**
- `"name"` - имя пакета (используется при публикации в npm)
- `"version"` - версия пакета в формате semver (major.minor.patch)
- `"description"` - краткое описание для npm
- `"main"` - точка входа после компиляции (TypeScript → JavaScript)
- `"type": "module"` - использовать ES модули (import/export) вместо CommonJS (require)
- `"scripts"` - команды npm:
  - `build` - компилирует TypeScript в JavaScript
  - `start` - запускает скомпилированный сервер
  - `dev` - следит за изменениями и перекомпилирует
  - `test` - запускает тесты

### Шаг 1.3: Установка зависимостей

```bash
npm install @modelcontextprotocol/sdk googleapis zod dotenv
```

**Объяснение пакетов:**
- `@modelcontextprotocol/sdk` - официальный SDK для создания MCP серверов
- `googleapis` - официальная библиотека Google для работы с их API (Drive, Sheets и др.)
- `zod` - библиотека для валидации данных и создания схем
- `dotenv` - загружает переменные окружения из файла `.env`

```bash
npm install -D typescript @types/node vitest
```

**Dev-зависимости:**
- `typescript` - компилятор TypeScript
- `@types/node` - типы для Node.js API
- `vitest` - современный фреймворк для тестирования

### Шаг 1.4: Создание структуры папок

```bash
mkdir -p src/config src/tools src/clients src/types src/utils credentials
```

**Структура:**
```
mcp-google-drive-sheets/
├── src/
│   ├── config/     # Конфигурация приложения
│   ├── tools/      # MCP инструменты (drive, equipment, maintenance)
│   ├── clients/    # HTTP клиенты для API
│   ├── types/      # TypeScript типы и интерфейсы
│   └── utils/      # Вспомогательные функции
├── credentials/    # Google Service Account ключи (НЕ коммитить!)
└── dist/           # Скомпилированный JavaScript (создается автоматически)
```

---

## Этап 2: Конфигурация TypeScript

### Шаг 2.1: Создание tsconfig.json

Создайте файл `tsconfig.json` в корне `mcp-google-drive-sheets/`:

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
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Объяснение каждой опции:**

```json
"target": "ES2022"
```
- Указывает версию JavaScript для вывода
- ES2022 поддерживает современные фичи: top-level await, private fields и др.

```json
"module": "NodeNext"
```
- Система модулей для Node.js
- Поддерживает и ESM (.mjs) и CommonJS (.cjs)

```json
"moduleResolution": "NodeNext"
```
- Как TypeScript ищет импортированные модули
- NodeNext - современный алгоритм для Node.js 16+

```json
"lib": ["ES2022"]
```
- Какие встроенные типы включить
- ES2022 включает Promise, Array методы и т.д.

```json
"outDir": "./dist"
```
- Куда помещать скомпилированные .js файлы

```json
"rootDir": "./src"
```
- Откуда брать исходные .ts файлы

```json
"strict": true
```
- Включает все строгие проверки типов:
  - noImplicitAny - нельзя неявный any
  - strictNullChecks - null и undefined проверяются
  - strictFunctionTypes - строгая проверка типов функций

```json
"esModuleInterop": true
```
- Позволяет импортировать CommonJS модули как ES модули
- `import express from 'express'` вместо `import * as express from 'express'`

```json
"skipLibCheck": true
```
- Пропускает проверку типов в node_modules
- Ускоряет компиляцию

```json
"resolveJsonModule": true
```
- Позволяет импортировать .json файлы
- `import config from './config.json'`

```json
"declaration": true
```
- Генерирует .d.ts файлы с типами
- Нужно если хотите использовать как библиотеку

```json
"sourceMap": true
```
- Создает .map файлы для отладки
- Позволяет видеть исходный TypeScript код в отладчике

### Шаг 2.2: Создание .gitignore

Создайте `.gitignore`:

```gitignore
# Зависимости
node_modules/

# Скомпилированный код
dist/

# Переменные окружения
.env
.env.local

# Секретные ключи Google (КРИТИЧЕСКИ ВАЖНО!)
credentials/
*.json
!package.json
!package-lock.json
!tsconfig.json

# IDE
.vscode/
.idea/

# Логи
*.log
npm-debug.log*

# OS
.DS_Store
Thumbs.db
```

**ВАЖНО:** Никогда не коммитьте `credentials/service-account.json` - это секретный ключ!

---

## Этап 3: Переменные окружения

### Шаг 3.1: Создание .env файла

Создайте файл `.env` в корне `mcp-google-drive-sheets/`:

```env
# ============================================
# Google Apps Script API (существующий бэкенд)
# ============================================

# URL вашего GAS Web App (скопируйте из Google Apps Script → Deploy → Web app)
GAS_EQUIPMENT_API_URL=https://script.google.com/macros/s/AKfycbz5WO3FMXR9e2LLxJxntN-i_unSgZ3DaYyIGyIAEah5UgPYgV1DLU53j1UugPlU_19Yeg/exec

# Таймаут запросов в миллисекундах (60 секунд)
API_TIMEOUT=60000

# Количество повторных попыток при ошибке
API_MAX_RETRIES=3

# Задержка между попытками в миллисекундах
API_RETRY_DELAY=2000

# ============================================
# Google Service Account (для загрузки файлов)
# ============================================

# Путь к файлу с ключами сервисного аккаунта
GOOGLE_SERVICE_ACCOUNT_PATH=./credentials/service-account.json

# ID родительской папки в Google Drive (куда создаются папки оборудования)
# Откройте папку в браузере: https://drive.google.com/drive/folders/XXXXX
# XXXXX - это ID папки
GOOGLE_DRIVE_PARENT_FOLDER_ID=

# ============================================
# Режим отладки
# ============================================

# Включить подробное логирование (true/false)
DEBUG=true
```

### Шаг 3.2: Создание конфигурационного модуля

Создайте файл `src/config/env.ts`:

```typescript
/**
 * env.ts
 *
 * Модуль конфигурации - загружает и валидирует переменные окружения.
 * Централизованное место для всех настроек приложения.
 */

// Импортируем dotenv для загрузки .env файла
import dotenv from 'dotenv';

// Импортируем path для работы с путями файлов
import path from 'path';

// Импортируем fileURLToPath для преобразования import.meta.url в путь
import { fileURLToPath } from 'url';

// ============================================
// Определяем __dirname для ES модулей
// ============================================

// В ES модулях нет встроенного __dirname, нужно создать вручную
// import.meta.url - URL текущего файла (file:///path/to/env.ts)
const __filename = fileURLToPath(import.meta.url);

// path.dirname() извлекает директорию из полного пути
const __dirname = path.dirname(__filename);

// ============================================
// Загружаем переменные окружения
// ============================================

// path.resolve() создает абсолютный путь
// __dirname - текущая директория (src/config/)
// '../..' - поднимаемся на 2 уровня вверх (mcp-google-drive-sheets/)
// '.env' - имя файла
const envPath = path.resolve(__dirname, '../..', '.env');

// dotenv.config() читает .env файл и добавляет переменные в process.env
const result = dotenv.config({ path: envPath });

// Проверяем, успешно ли загружен файл
if (result.error) {
  console.warn('⚠️ Файл .env не найден, используются значения по умолчанию');
}

// ============================================
// Экспортируем конфигурацию
// ============================================

/**
 * Объект конфигурации приложения.
 * Все значения берутся из process.env с fallback на значения по умолчанию.
 */
export const config = {
  // ----------------------------------------
  // Google Apps Script API
  // ----------------------------------------

  /**
   * URL Google Apps Script Web App.
   * Используется для CRUD операций с оборудованием.
   * process.env.XXX возвращает string | undefined
   * || '' - если undefined, используем пустую строку
   */
  gasApiUrl: process.env.GAS_EQUIPMENT_API_URL || '',

  /**
   * Таймаут API запросов в миллисекундах.
   * parseInt() преобразует строку в число
   * 10 - десятичная система счисления
   */
  apiTimeout: parseInt(process.env.API_TIMEOUT || '60000', 10),

  /**
   * Максимальное количество повторных попыток.
   */
  apiMaxRetries: parseInt(process.env.API_MAX_RETRIES || '3', 10),

  /**
   * Задержка между повторными попытками.
   */
  apiRetryDelay: parseInt(process.env.API_RETRY_DELAY || '2000', 10),

  // ----------------------------------------
  // Google Service Account
  // ----------------------------------------

  /**
   * Путь к файлу ключей сервисного аккаунта.
   * Относительный путь от корня проекта.
   */
  googleServiceAccountPath: process.env.GOOGLE_SERVICE_ACCOUNT_PATH || './credentials/service-account.json',

  /**
   * ID родительской папки Google Drive.
   * Все папки оборудования создаются внутри этой папки.
   */
  googleDriveParentFolderId: process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID || '',

  // ----------------------------------------
  // Отладка
  // ----------------------------------------

  /**
   * Режим отладки.
   * Преобразуем строку 'true' в boolean true
   */
  debug: process.env.DEBUG === 'true',
} as const;
// as const - делает объект неизменяемым (readonly)

// ============================================
// Валидация обязательных настроек
// ============================================

/**
 * Проверяет наличие обязательных переменных окружения.
 * Вызывается при запуске сервера.
 * Throws Error если отсутствуют критические настройки.
 */
export function validateConfig(): void {
  const errors: string[] = [];

  // Проверяем GAS API URL
  if (!config.gasApiUrl) {
    errors.push('GAS_EQUIPMENT_API_URL не установлен');
  }

  // Если есть ошибки, выбрасываем исключение
  if (errors.length > 0) {
    throw new Error(
      `Ошибки конфигурации:\n${errors.map(e => `  - ${e}`).join('\n')}`
    );
  }

  // Если всё ок, выводим информацию
  if (config.debug) {
    console.log('✅ Конфигурация загружена:');
    console.log(`   GAS API: ${config.gasApiUrl.substring(0, 50)}...`);
    console.log(`   Таймаут: ${config.apiTimeout}ms`);
    console.log(`   Попытки: ${config.apiMaxRetries}`);
  }
}

// ============================================
// Экспорт по умолчанию
// ============================================

// Экспортируем config как default для удобства импорта
// import config from './config/env.js'
export default config;
```

---

## Этап 4: Типы данных

### Шаг 4.1: Типы для оборудования

Создайте файл `src/types/equipment.ts`:

```typescript
/**
 * equipment.ts
 *
 * TypeScript типы для оборудования.
 * Копируем структуру из основного проекта для совместимости.
 */

// ============================================
// Интерфейс характеристик оборудования
// ============================================

/**
 * Технические характеристики оборудования.
 * Все поля опциональные (?) так как зависят от типа оборудования.
 */
export interface EquipmentSpecs {
  /** Производитель */
  manufacturer?: string;

  /** Модель */
  model?: string;

  /** Серийный номер */
  serialNumber?: string;

  /** Регистрационный номер */
  registrationNumber?: string;

  /** Тип энергоисточника */
  energySourceType?: string;

  /** Мощность в кВт */
  powerKw?: string;

  /** Рабочее давление */
  workingPressure?: string;

  /** Дата следующего испытания */
  nextTestDate?: string;

  /** Произвольные дополнительные поля */
  [key: string]: string | undefined;
}

// ============================================
// Основной интерфейс оборудования
// ============================================

/**
 * Полная информация об оборудовании.
 * Соответствует структуре в Google Sheets.
 */
export interface Equipment {
  /** Уникальный идентификатор (UUID) */
  id: string;

  /** Название оборудования */
  name: string;

  /** Тип оборудования (filter, pump, tank, boiler и т.д.) */
  type: string;

  /** Технические характеристики */
  specs: EquipmentSpecs;

  /** URL папки в Google Drive */
  googleDriveUrl?: string;

  /** URL QR-кода */
  qrCodeUrl?: string;

  /** Дата ввода в эксплуатацию (ISO 8601: YYYY-MM-DD) */
  commissioningDate?: string;

  /** Дата последнего обслуживания */
  lastMaintenanceDate?: string;

  /** Статус оборудования */
  status: 'active' | 'inactive' | 'archived';

  /** Дата создания записи */
  createdAt?: string;

  /** Дата последнего обновления */
  updatedAt?: string;

  /** ID листа журнала обслуживания */
  maintenanceSheetId?: string;

  /** URL листа журнала обслуживания */
  maintenanceSheetUrl?: string;
}

// ============================================
// Типы для CRUD операций
// ============================================

/**
 * Данные для создания нового оборудования.
 * Omit<T, K> - создает тип T без полей K
 * Partial<T> - делает все поля T опциональными
 */
export type CreateEquipmentInput = Omit<Equipment, 'id' | 'createdAt' | 'updatedAt'> & {
  /** ID родительской папки для Google Drive (опционально) */
  parentFolderId?: string;
};

/**
 * Данные для обновления оборудования.
 * Partial<T> - все поля становятся опциональными
 */
export type UpdateEquipmentInput = Partial<Omit<Equipment, 'id' | 'createdAt'>>;

// ============================================
// Типы для фильтрации
// ============================================

/**
 * Параметры фильтрации списка оборудования.
 */
export interface EquipmentFilter {
  /** Фильтр по типу */
  type?: string;

  /** Фильтр по статусу */
  status?: Equipment['status'];

  /** Поиск по названию (частичное совпадение) */
  search?: string;
}
```

### Шаг 4.2: Типы для журнала обслуживания

Создайте файл `src/types/maintenance.ts`:

```typescript
/**
 * maintenance.ts
 *
 * TypeScript типы для журнала обслуживания оборудования.
 */

// ============================================
// Статусы записей
// ============================================

/**
 * Возможные статусы записи обслуживания.
 * type alias с union типом - ограниченный набор строк
 */
export type MaintenanceStatus = 'completed' | 'planned' | 'in_progress' | 'cancelled';

// ============================================
// Основной интерфейс записи
// ============================================

/**
 * Запись в журнале обслуживания.
 */
export interface MaintenanceEntry {
  /** ID оборудования (связь с Equipment) */
  equipmentId: string;

  /** Уникальный ID записи */
  entryId: string;

  /** Дата обслуживания (YYYY-MM-DD) */
  date: string;

  /** Тип работы (например: "Техническое освидетельствование") */
  type: string;

  /** Подробное описание выполненных работ */
  description: string;

  /** Кто выполнил работу (ФИО) */
  performedBy: string;

  /** Статус работы */
  status: MaintenanceStatus;

  /** Дата создания записи */
  createdAt?: string;
}

// ============================================
// Типы для CRUD операций
// ============================================

/**
 * Данные для создания новой записи.
 */
export interface CreateMaintenanceInput {
  /** ID оборудования */
  equipmentId: string;

  /** Дата обслуживания */
  date: string;

  /** Тип работы */
  type: string;

  /** Описание */
  description: string;

  /** Исполнитель */
  performedBy: string;

  /** Статус (по умолчанию 'completed') */
  status?: MaintenanceStatus;
}

/**
 * Данные для обновления записи.
 */
export interface UpdateMaintenanceInput {
  /** ID записи для обновления */
  entryId: string;

  /** Новая дата (опционально) */
  date?: string;

  /** Новый тип (опционально) */
  type?: string;

  /** Новое описание (опционально) */
  description?: string;

  /** Новый исполнитель (опционально) */
  performedBy?: string;

  /** Новый статус (опционально) */
  status?: MaintenanceStatus;
}
```

### Шаг 4.3: Типы для Google Drive

Создайте файл `src/types/drive.ts`:

```typescript
/**
 * drive.ts
 *
 * TypeScript типы для операций с Google Drive.
 */

// ============================================
// Файлы и папки
// ============================================

/**
 * Информация о файле в Google Drive.
 */
export interface DriveFile {
  /** Уникальный ID файла в Google Drive */
  id: string;

  /** Имя файла */
  name: string;

  /** Прямая ссылка на файл */
  url: string;

  /** Размер в байтах */
  size: number;

  /** MIME тип (например: 'application/pdf', 'image/jpeg') */
  mimeType: string;

  /** Дата последнего изменения (ISO 8601) */
  modifiedTime: string;

  /** URL миниатюры (для изображений) */
  thumbnailUrl?: string;
}

/**
 * Информация о папке в Google Drive.
 */
export interface DriveFolder {
  /** ID папки */
  id: string;

  /** Название папки */
  name: string;

  /** URL папки */
  url: string;

  /** ID родительской папки */
  parentId?: string;

  /** Дата создания */
  createdTime?: string;
}

// ============================================
// Результаты операций
// ============================================

/**
 * Результат создания папки.
 */
export interface CreateFolderResult {
  /** Успешность операции */
  success: boolean;

  /** ID созданной папки */
  folderId?: string;

  /** URL созданной папки */
  folderUrl?: string;

  /** Название папки */
  folderName?: string;

  /** Сообщение об ошибке */
  error?: string;
}

/**
 * Результат загрузки файла.
 */
export interface UploadFileResult {
  /** Успешность операции */
  success: boolean;

  /** ID загруженного файла */
  fileId?: string;

  /** URL файла */
  fileUrl?: string;

  /** Имя файла */
  fileName?: string;

  /** Размер файла */
  fileSize?: number;

  /** Сообщение об ошибке */
  error?: string;
}

/**
 * Результат поиска файлов.
 */
export interface SearchFilesResult {
  /** Успешность операции */
  success: boolean;

  /** Список найденных файлов */
  files?: DriveFile[];

  /** Общее количество файлов */
  totalCount?: number;

  /** Сообщение об ошибке */
  error?: string;
}

// ============================================
// Параметры запросов
// ============================================

/**
 * Параметры для загрузки файла.
 */
export interface UploadFileParams {
  /** Имя файла */
  fileName: string;

  /** Содержимое файла (Base64 или Buffer) */
  fileContent: string | Buffer;

  /** MIME тип файла */
  mimeType: string;

  /** ID папки назначения */
  folderId: string;

  /** Описание файла (опционально) */
  description?: string;
}

/**
 * Параметры для поиска файлов.
 */
export interface SearchFilesParams {
  /** ID или URL папки для поиска */
  folderUrl: string;

  /** Поисковый запрос (опционально) */
  query?: string;

  /** Фильтр по MIME типу (опционально) */
  mimeType?: string;

  /** Максимальное количество результатов */
  maxResults?: number;
}
```

---

## Этап 5: GAS Client

### Шаг 5.1: Вспомогательные функции для URL

Создайте файл `src/utils/urlParser.ts`:

```typescript
/**
 * urlParser.ts
 *
 * Утилиты для работы с URL Google Drive.
 * Извлекает ID папок и файлов из различных форматов ссылок.
 */

// ============================================
// Регулярные выражения для парсинга URL
// ============================================

/**
 * Паттерны для извлечения ID из URL Google Drive.
 *
 * Примеры URL:
 * - https://drive.google.com/drive/folders/1ABC123xyz
 * - https://drive.google.com/open?id=1ABC123xyz
 * - https://drive.google.com/file/d/1ABC123xyz/view
 * - 1ABC123xyz (просто ID)
 */
const DRIVE_URL_PATTERNS = [
  // /folders/ID
  /\/folders\/([a-zA-Z0-9_-]+)/,

  // /file/d/ID
  /\/file\/d\/([a-zA-Z0-9_-]+)/,

  // ?id=ID или &id=ID
  /[?&]id=([a-zA-Z0-9_-]+)/,

  // open?id=ID
  /open\?id=([a-zA-Z0-9_-]+)/,
];

/**
 * Паттерн для проверки, является ли строка валидным ID.
 * ID Google Drive состоит из букв, цифр, дефисов и подчеркиваний.
 */
const ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

// ============================================
// Основные функции
// ============================================

/**
 * Извлекает ID из URL Google Drive.
 *
 * @param urlOrId - URL Google Drive или сам ID
 * @returns ID папки/файла или null если не удалось извлечь
 *
 * @example
 * extractDriveId('https://drive.google.com/drive/folders/1ABC123')
 * // Возвращает: '1ABC123'
 *
 * extractDriveId('1ABC123')
 * // Возвращает: '1ABC123'
 *
 * extractDriveId('invalid-url')
 * // Возвращает: null
 */
export function extractDriveId(urlOrId: string): string | null {
  // Убираем пробелы по краям
  const trimmed = urlOrId.trim();

  // Если пустая строка
  if (!trimmed) {
    return null;
  }

  // Проверяем, не является ли строка уже ID
  // ID обычно не содержит точек и слешей (в отличие от URL)
  if (ID_PATTERN.test(trimmed) && !trimmed.includes('.') && !trimmed.includes('/')) {
    return trimmed;
  }

  // Пробуем каждый паттерн
  for (const pattern of DRIVE_URL_PATTERNS) {
    // .exec() возвращает массив совпадений или null
    const match = pattern.exec(trimmed);

    if (match && match[1]) {
      // match[0] - полное совпадение
      // match[1] - первая группа захвата (ID)
      return match[1];
    }
  }

  // Ничего не нашли
  return null;
}

/**
 * Проверяет, является ли строка валидным URL Google Drive.
 *
 * @param url - Строка для проверки
 * @returns true если это URL Google Drive
 */
export function isDriveUrl(url: string): boolean {
  return url.includes('drive.google.com') || url.includes('docs.google.com');
}

/**
 * Создает URL папки по ID.
 *
 * @param folderId - ID папки
 * @returns URL папки
 */
export function buildFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}

/**
 * Создает URL файла по ID.
 *
 * @param fileId - ID файла
 * @returns URL файла
 */
export function buildFileUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}
```

### Шаг 5.2: Обработка ошибок

Создайте файл `src/utils/errorHandler.ts`:

```typescript
/**
 * errorHandler.ts
 *
 * Централизованная обработка ошибок.
 * Преобразует различные типы ошибок в понятные сообщения.
 */

// ============================================
// Типы ошибок
// ============================================

/**
 * Кастомный класс ошибки с дополнительной информацией.
 * extends Error - наследуем от встроенного класса ошибок
 */
export class ApiError extends Error {
  /** HTTP статус код (если есть) */
  statusCode?: number;

  /** Код ошибки (для программной обработки) */
  code?: string;

  /** Исходная ошибка */
  cause?: unknown;

  constructor(message: string, options?: {
    statusCode?: number;
    code?: string;
    cause?: unknown;
  }) {
    // Вызываем конструктор родительского класса
    super(message);

    // Устанавливаем имя класса ошибки
    this.name = 'ApiError';

    // Присваиваем дополнительные свойства
    this.statusCode = options?.statusCode;
    this.code = options?.code;
    this.cause = options?.cause;
  }
}

// ============================================
// Функции обработки ошибок
// ============================================

/**
 * Преобразует любую ошибку в понятное сообщение.
 *
 * @param error - Любой тип ошибки
 * @returns Человекочитаемое сообщение
 */
export function getErrorMessage(error: unknown): string {
  // Если это уже строка
  if (typeof error === 'string') {
    return error;
  }

  // Если это объект Error
  if (error instanceof Error) {
    return error.message;
  }

  // Если это объект с полем message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }

  // Для всего остального
  return 'Неизвестная ошибка';
}

/**
 * Определяет, является ли ошибка сетевой.
 *
 * @param error - Ошибка для проверки
 * @returns true если это сетевая ошибка
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    return (
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('timeout') ||
      message.includes('econnrefused') ||
      message.includes('enotfound')
    );
  }

  return false;
}

/**
 * Определяет, можно ли повторить запрос после этой ошибки.
 *
 * @param error - Ошибка для проверки
 * @returns true если стоит попробовать ещё раз
 */
export function isRetryableError(error: unknown): boolean {
  // Сетевые ошибки обычно временные
  if (isNetworkError(error)) {
    return true;
  }

  // Проверяем HTTP статус код
  if (error instanceof ApiError && error.statusCode) {
    // 5xx - серверные ошибки (можно повторить)
    // 429 - слишком много запросов (можно повторить после паузы)
    return error.statusCode >= 500 || error.statusCode === 429;
  }

  return false;
}

/**
 * Создает задержку (для повторных попыток).
 *
 * @param ms - Время в миллисекундах
 * @returns Promise который резолвится через указанное время
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

### Шаг 5.3: GAS API Client

Создайте файл `src/clients/gasClient.ts`:

```typescript
/**
 * gasClient.ts
 *
 * HTTP клиент для работы с Google Apps Script API.
 * Обертка над существующим бэкендом с поддержкой retry и таймаутов.
 */

import { config } from '../config/env.js';
import { ApiError, getErrorMessage, isRetryableError, delay } from '../utils/errorHandler.js';

// ============================================
// Типы
// ============================================

/**
 * Стандартный ответ от GAS API.
 * Generics <T> позволяет указать тип данных.
 */
interface GasResponse<T> {
  /** Успешность операции */
  success: boolean;

  /** Данные (при успехе) */
  data?: T;

  /** Сообщение об ошибке (при неудаче) */
  error?: string;

  /** Дополнительная информация */
  message?: string;
}

/**
 * Опции для запроса.
 */
interface RequestOptions {
  /** Таймаут в миллисекундах */
  timeout?: number;

  /** Количество повторных попыток */
  retries?: number;
}

// ============================================
// Класс клиента
// ============================================

/**
 * Клиент для работы с Google Apps Script API.
 *
 * Паттерн Singleton - один экземпляр на всё приложение.
 * Это нужно чтобы не создавать множество подключений.
 */
export class GasClient {
  /** Базовый URL API */
  private baseUrl: string;

  /** Таймаут по умолчанию */
  private defaultTimeout: number;

  /** Количество попыток по умолчанию */
  private defaultRetries: number;

  /** Задержка между попытками */
  private retryDelay: number;

  /**
   * Создает экземпляр клиента.
   *
   * @param options - Опции конфигурации (опционально)
   */
  constructor(options?: {
    baseUrl?: string;
    timeout?: number;
    retries?: number;
    retryDelay?: number;
  }) {
    // Используем переданные значения или значения из конфига
    this.baseUrl = options?.baseUrl || config.gasApiUrl;
    this.defaultTimeout = options?.timeout || config.apiTimeout;
    this.defaultRetries = options?.retries || config.apiMaxRetries;
    this.retryDelay = options?.retryDelay || config.apiRetryDelay;

    // Проверяем, что URL задан
    if (!this.baseUrl) {
      throw new Error('GAS API URL не настроен. Проверьте .env файл.');
    }
  }

  // ============================================
  // Публичные методы
  // ============================================

  /**
   * GET запрос к API.
   *
   * @param action - Название действия (action=xxx в URL)
   * @param params - Дополнительные параметры запроса
   * @param options - Опции запроса
   * @returns Данные ответа
   *
   * @example
   * const equipment = await client.get<Equipment[]>('getAll');
   * const item = await client.get<Equipment>('getById', { id: '123' });
   */
  async get<T>(
    action: string,
    params?: Record<string, string>,
    options?: RequestOptions
  ): Promise<T> {
    // Собираем URL с параметрами
    const url = this.buildUrl(action, params);

    // Выполняем запрос
    const response = await this.request<T>(url, 'GET', undefined, options);

    return response;
  }

  /**
   * POST запрос к API.
   *
   * @param action - Название действия
   * @param body - Тело запроса
   * @param options - Опции запроса
   * @returns Данные ответа
   *
   * @example
   * const newItem = await client.post<Equipment>('add', { name: 'Фильтр', type: 'filter' });
   */
  async post<T>(
    action: string,
    body: Record<string, unknown>,
    options?: RequestOptions
  ): Promise<T> {
    // Добавляем action в тело запроса (так работает наш GAS бэкенд)
    const payload = { action, ...body };

    // Выполняем запрос
    const response = await this.request<T>(this.baseUrl, 'POST', payload, options);

    return response;
  }

  // ============================================
  // Приватные методы
  // ============================================

  /**
   * Собирает URL с query параметрами.
   *
   * @param action - Действие
   * @param params - Параметры
   * @returns Полный URL
   */
  private buildUrl(action: string, params?: Record<string, string>): string {
    // Создаем объект URL для удобной работы с параметрами
    const url = new URL(this.baseUrl);

    // Добавляем action
    url.searchParams.append('action', action);

    // Добавляем остальные параметры
    if (params) {
      // Object.entries() возвращает массив [ключ, значение]
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, value);
        }
      });
    }

    // .toString() возвращает полный URL со всеми параметрами
    return url.toString();
  }

  /**
   * Выполняет HTTP запрос с поддержкой retry.
   *
   * @param url - URL запроса
   * @param method - HTTP метод
   * @param body - Тело запроса (для POST)
   * @param options - Опции
   * @param attempt - Номер текущей попытки
   * @returns Данные ответа
   */
  private async request<T>(
    url: string,
    method: 'GET' | 'POST',
    body?: Record<string, unknown>,
    options?: RequestOptions,
    attempt: number = 1
  ): Promise<T> {
    // Определяем таймаут и количество попыток
    const timeout = options?.timeout || this.defaultTimeout;
    const maxRetries = options?.retries || this.defaultRetries;

    // AbortController позволяет отменить fetch запрос
    const controller = new AbortController();

    // Устанавливаем таймаут на отмену
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // Логируем запрос в debug режиме
      if (config.debug) {
        console.log(`[GAS] ${method} ${url.substring(0, 80)}... (попытка ${attempt})`);
      }

      // Формируем опции fetch
      const fetchOptions: RequestInit = {
        method,
        // signal связывает fetch с AbortController
        signal: controller.signal,
        // Headers для POST запроса
        headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
        // Тело запроса (только для POST)
        body: body ? JSON.stringify(body) : undefined,
      };

      // Выполняем запрос
      const response = await fetch(url, fetchOptions);

      // Очищаем таймаут (запрос завершился вовремя)
      clearTimeout(timeoutId);

      // Проверяем HTTP статус
      if (!response.ok) {
        throw new ApiError(`HTTP ${response.status}: ${response.statusText}`, {
          statusCode: response.status,
        });
      }

      // Парсим JSON ответ
      const json = await response.json() as GasResponse<T>;

      // Проверяем успешность операции
      if (!json.success) {
        throw new ApiError(json.error || json.message || 'Неизвестная ошибка API', {
          code: 'API_ERROR',
        });
      }

      // Возвращаем данные
      // json.data! - "!" говорит TypeScript, что data точно не undefined
      return json.data as T;

    } catch (error: unknown) {
      // Очищаем таймаут в случае ошибки
      clearTimeout(timeoutId);

      // Проверяем, был ли запрос отменен по таймауту
      if (error instanceof Error && error.name === 'AbortError') {
        const timeoutError = new ApiError(`Таймаут запроса (${timeout}ms)`, {
          code: 'TIMEOUT',
        });

        // Если можно повторить и есть ещё попытки
        if (attempt < maxRetries) {
          if (config.debug) {
            console.log(`[GAS] Таймаут, повторяем через ${this.retryDelay}ms...`);
          }
          await delay(this.retryDelay);
          return this.request<T>(url, method, body, options, attempt + 1);
        }

        throw timeoutError;
      }

      // Для других ошибок - проверяем возможность retry
      if (isRetryableError(error) && attempt < maxRetries) {
        if (config.debug) {
          console.log(`[GAS] Ошибка: ${getErrorMessage(error)}, повторяем...`);
        }
        await delay(this.retryDelay);
        return this.request<T>(url, method, body, options, attempt + 1);
      }

      // Пробрасываем ошибку дальше
      throw error;
    }
  }
}

// ============================================
// Экземпляр по умолчанию
// ============================================

/**
 * Готовый экземпляр клиента.
 * Используйте его везде в приложении.
 *
 * @example
 * import { gasClient } from './clients/gasClient.js';
 * const data = await gasClient.get('getAll');
 */
export const gasClient = new GasClient();
```

---

## Этап 6: Google Drive Client (только для загрузки файлов)

### Зачем нужен отдельный Google Drive Client?

**GAS бэкенд уже умеет:**
- ✅ Создавать папки (`createDriveFolder`)
- ✅ Удалять папки (`deleteDriveFolder`)
- ✅ Получать список файлов (`getFolderFiles`)

**GAS бэкенд НЕ умеет:**
- ❌ Загружать файлы в папку
- ❌ Удалять отдельные файлы

**Поэтому googleapis нужен ТОЛЬКО для загрузки/удаления файлов!**

### Шаг 6.1: Настройка Google Service Account

**⚠️ ВАЖНО: Этот шаг нужен ТОЛЬКО если вы хотите загружать файлы через MCP.**
**Если загрузка файлов не нужна — пропустите Этап 6.**

1. Перейти в [Google Cloud Console](https://console.cloud.google.com/)
2. Создать новый проект или выбрать существующий
3. Включить Google Drive API:
   - Меню → APIs & Services → Enable APIs and Services
   - Найти "Google Drive API" → Enable
4. Создать Service Account:
   - Меню → IAM & Admin → Service Accounts
   - Create Service Account
   - Дать имя, например: "mcp-drive-access"
   - Роль: не обязательно
   - Done
5. Создать ключ:
   - Кликнуть на созданный аккаунт
   - Keys → Add Key → Create new key
   - Выбрать JSON
   - Сохранить файл как `credentials/service-account.json`
6. Расшарить папку Google Drive:
   - Открыть папку в браузере
   - Правый клик → Share
   - Добавить email сервисного аккаунта (из JSON файла, поле `client_email`)
   - Дать права "Editor"

### Шаг 6.2: Google Drive Client

Создайте файл `src/clients/googleDriveClient.ts`:

```typescript
/**
 * googleDriveClient.ts
 *
 * Клиент для работы с Google Drive API через googleapis.
 * Используется для загрузки и удаления файлов.
 */

import { google } from 'googleapis';
import { config } from '../config/env.js';
import { ApiError } from '../utils/errorHandler.js';
import { extractDriveId, buildFileUrl } from '../utils/urlParser.js';
import type { UploadFileParams, UploadFileResult, DriveFile } from '../types/drive.js';

// Для работы с файловой системой
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ============================================
// Определяем __dirname для ES модулей
// ============================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================
// Типы Google API
// ============================================

// Тип для Google Drive API
type DriveAPI = ReturnType<typeof google.drive>;

// ============================================
// Класс клиента
// ============================================

/**
 * Клиент для работы с Google Drive API.
 * Использует Service Account для аутентификации.
 */
export class GoogleDriveClient {
  /** Экземпляр Drive API */
  private drive: DriveAPI | null = null;

  /** Путь к файлу с ключами */
  private keyFilePath: string;

  /**
   * Создает экземпляр клиента.
   *
   * @param keyFilePath - Путь к файлу service-account.json
   */
  constructor(keyFilePath?: string) {
    // Определяем путь к файлу ключей
    // Если не передан, используем из конфига
    this.keyFilePath = keyFilePath || config.googleServiceAccountPath;

    // Преобразуем относительный путь в абсолютный
    if (!path.isAbsolute(this.keyFilePath)) {
      // Относительно корня mcp-google-drive-sheets/
      this.keyFilePath = path.resolve(__dirname, '../..', this.keyFilePath);
    }
  }

  // ============================================
  // Инициализация
  // ============================================

  /**
   * Инициализирует подключение к Google Drive API.
   * Вызывается автоматически при первом использовании.
   */
  private async initialize(): Promise<void> {
    // Если уже инициализирован - выходим
    if (this.drive) {
      return;
    }

    // Проверяем существование файла ключей
    if (!fs.existsSync(this.keyFilePath)) {
      throw new ApiError(
        `Файл Service Account не найден: ${this.keyFilePath}\n` +
        'Создайте Service Account в Google Cloud Console и сохраните ключ.',
        { code: 'SERVICE_ACCOUNT_NOT_FOUND' }
      );
    }

    try {
      // Создаем аутентификацию через Service Account
      // google.auth.GoogleAuth - встроенный класс для аутентификации
      const auth = new google.auth.GoogleAuth({
        // Путь к JSON файлу с ключами
        keyFile: this.keyFilePath,

        // Области доступа (scopes) - какие разрешения нужны
        // https://www.googleapis.com/auth/drive - полный доступ к Drive
        scopes: ['https://www.googleapis.com/auth/drive'],
      });

      // Создаем экземпляр Drive API
      this.drive = google.drive({
        version: 'v3',  // Используем версию API v3
        auth,           // Передаем аутентификацию
      });

      if (config.debug) {
        console.log('✅ Google Drive API инициализирован');
      }
    } catch (error) {
      throw new ApiError('Ошибка инициализации Google Drive API', {
        cause: error,
        code: 'INIT_ERROR',
      });
    }
  }

  // ============================================
  // Публичные методы
  // ============================================

  /**
   * Загружает файл в Google Drive.
   *
   * @param params - Параметры загрузки
   * @returns Результат загрузки
   *
   * @example
   * const result = await client.uploadFile({
   *   fileName: 'report.pdf',
   *   fileContent: Buffer.from(...),
   *   mimeType: 'application/pdf',
   *   folderId: '1ABC123xyz'
   * });
   */
  async uploadFile(params: UploadFileParams): Promise<UploadFileResult> {
    // Инициализируем если еще не сделали
    await this.initialize();

    const { fileName, fileContent, mimeType, folderId, description } = params;

    // Извлекаем ID папки из URL если передан URL
    const parentId = extractDriveId(folderId);

    if (!parentId) {
      return {
        success: false,
        error: 'Некорректный ID папки',
      };
    }

    try {
      // Преобразуем содержимое в Buffer если это Base64 строка
      let contentBuffer: Buffer;

      if (typeof fileContent === 'string') {
        // Убираем Data URL префикс если есть (data:application/pdf;base64,...)
        const base64Data = fileContent.replace(/^data:[^;]+;base64,/, '');
        contentBuffer = Buffer.from(base64Data, 'base64');
      } else {
        contentBuffer = fileContent;
      }

      // Создаем readable stream из Buffer
      // Google API требует stream для загрузки
      const { Readable } = await import('stream');
      const stream = Readable.from(contentBuffer);

      // Загружаем файл
      const response = await this.drive!.files.create({
        // Метаданные файла
        requestBody: {
          name: fileName,
          description: description,
          parents: [parentId],  // Папка назначения
        },
        // Содержимое файла
        media: {
          mimeType: mimeType,
          body: stream,
        },
        // Какие поля вернуть в ответе
        fields: 'id, name, size, webViewLink',
      });

      const file = response.data;

      return {
        success: true,
        fileId: file.id || undefined,
        fileName: file.name || undefined,
        fileSize: file.size ? parseInt(file.size, 10) : undefined,
        fileUrl: file.webViewLink || (file.id ? buildFileUrl(file.id) : undefined),
      };

    } catch (error: unknown) {
      if (config.debug) {
        console.error('Ошибка загрузки файла:', error);
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Ошибка загрузки файла',
      };
    }
  }

  /**
   * Удаляет файл из Google Drive.
   *
   * @param fileIdOrUrl - ID или URL файла
   * @returns Успешность операции
   *
   * @example
   * await client.deleteFile('1ABC123xyz');
   * await client.deleteFile('https://drive.google.com/file/d/1ABC123xyz/view');
   */
  async deleteFile(fileIdOrUrl: string): Promise<{ success: boolean; error?: string }> {
    await this.initialize();

    const fileId = extractDriveId(fileIdOrUrl);

    if (!fileId) {
      return {
        success: false,
        error: 'Некорректный ID файла',
      };
    }

    try {
      // Удаляем файл
      await this.drive!.files.delete({
        fileId: fileId,
      });

      return { success: true };

    } catch (error: unknown) {
      // Проверяем, может файл уже удален
      if (error instanceof Error && error.message.includes('404')) {
        return { success: true };  // Файл не найден = уже удален
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Ошибка удаления файла',
      };
    }
  }

  /**
   * Получает информацию о файле.
   *
   * @param fileIdOrUrl - ID или URL файла
   * @returns Информация о файле или null
   */
  async getFileInfo(fileIdOrUrl: string): Promise<DriveFile | null> {
    await this.initialize();

    const fileId = extractDriveId(fileIdOrUrl);

    if (!fileId) {
      return null;
    }

    try {
      const response = await this.drive!.files.get({
        fileId: fileId,
        fields: 'id, name, size, mimeType, modifiedTime, webViewLink, thumbnailLink',
      });

      const file = response.data;

      return {
        id: file.id || '',
        name: file.name || '',
        size: file.size ? parseInt(file.size, 10) : 0,
        mimeType: file.mimeType || '',
        modifiedTime: file.modifiedTime || '',
        url: file.webViewLink || buildFileUrl(file.id || ''),
        thumbnailUrl: file.thumbnailLink || undefined,
      };

    } catch (error) {
      if (config.debug) {
        console.error('Ошибка получения информации о файле:', error);
      }
      return null;
    }
  }

  /**
   * Проверяет подключение к Google Drive.
   * Полезно для тестирования конфигурации.
   *
   * @returns true если подключение работает
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.initialize();

      // Пробуем получить информацию о хранилище
      await this.drive!.about.get({
        fields: 'user',
      });

      return true;
    } catch (error) {
      if (config.debug) {
        console.error('Ошибка подключения к Google Drive:', error);
      }
      return false;
    }
  }
}

// ============================================
// Экземпляр по умолчанию
// ============================================

/**
 * Готовый экземпляр клиента.
 */
export const googleDriveClient = new GoogleDriveClient();
```

---

## Следующие этапы

**Этапы 7-9** будут в следующем файле из-за объема.

Для продолжения:
1. Выполните все шаги этапов 1-6
2. Проверьте что всё компилируется: `npm run build`
3. Сообщите мне, и я создам следующую часть руководства

## Проверка на данном этапе

```bash
# Перейти в директорию
cd mcp-google-drive-sheets

# Установить зависимости (если не установлены)
npm install

# Скомпилировать TypeScript
npm run build

# Проверить что в dist/ появились .js файлы
ls dist/
```

Если компиляция прошла успешно, вы увидите файлы:
- `dist/config/env.js`
- `dist/types/equipment.js`
- `dist/types/maintenance.js`
- `dist/types/drive.js`
- `dist/utils/urlParser.js`
- `dist/utils/errorHandler.js`
- `dist/clients/gasClient.js`
- `dist/clients/googleDriveClient.js`
