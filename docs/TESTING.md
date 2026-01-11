# Документация по тестированию

Этот документ описывает систему тестирования приложения, как запускать тесты, как писать новые тесты и лучшие практики.

## 📋 Содержание

- [Обзор](#обзор)
- [Настройка](#настройка)
- [Запуск тестов](#запуск-тестов)
- [Структура тестов](#структура-тестов)
- [Написание тестов](#написание-тестов)
- [Моки и фикстуры](#моки-и-фикстуры)
- [Best Practices](#best-practices)
- [Примеры](#примеры)
- [Troubleshooting](#troubleshooting)

---

## Обзор

Приложение использует **Vitest** в качестве тестового фреймворка и **Testing Library** для тестирования React компонентов.

### Технологии

- **Vitest** - быстрый тестовый фреймворк, совместимый с Vite
- **@testing-library/react** - утилиты для тестирования React компонентов
- **@testing-library/jest-dom** - дополнительные матчеры для DOM
- **@testing-library/user-event** - симуляция пользовательских событий
- **jsdom** - DOM окружение для тестов в Node.js

### Типы тестов

1. **Unit тесты** - тестирование отдельных функций и модулей
2. **Integration тесты** - тестирование взаимодействия между модулями
3. **Component тесты** - тестирование React компонентов (будущее)

---

## Настройка

### Установка зависимостей

Зависимости уже установлены в проекте. Если нужно переустановить:

```bash
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event @vitest/ui jsdom @types/node
```

### Конфигурация

Конфигурация находится в `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', '.git'],
    // ...
  },
});
```

### Настройка окружения

Файл `src/test/setup.ts` настраивает тестовое окружение перед каждым тестом:

- Расширяет `expect` матчерами из `@testing-library/jest-dom`
- Настраивает моки для `window.matchMedia` и `ResizeObserver`
- Очищает DOM после каждого теста

---

## Запуск тестов

### Основные команды

```bash
# Запуск тестов в watch режиме (автоматический перезапуск при изменениях)
npm test

# Однократный запуск всех тестов
npm test -- --run

# Запуск с UI интерфейсом
npm test -- --ui

# Запуск с покрытием кода
npm test -- --coverage

# Запуск конкретного файла
npm test -- src/utils/__tests__/routes.test.ts

# Запуск тестов, соответствующих паттерну
npm test -- routes
```

### Параметры командной строки

```bash
# Запуск в verbose режиме (подробный вывод)
npm test -- --reporter=verbose

# Запуск только измененных тестов
npm test -- --changed

# Запуск с таймаутом
npm test -- --testTimeout=10000

# Запуск в параллельном режиме (по умолчанию)
npm test -- --threads

# Запуск последовательно (для отладки)
npm test -- --no-threads
```

### Скрипты в package.json

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage"
  }
}
```

---

## Структура тестов

### Организация файлов

Тесты должны находиться рядом с тестируемым кодом или в папке `__tests__`:

```
src/
├── services/
│   └── api/
│       ├── supabaseAuthApi.ts
│       └── __tests__/
│           └── supabaseAuthApi.test.ts
├── utils/
│   ├── routes.ts
│   └── __tests__/
│       └── routes.test.ts
└── test/
    ├── setup.ts          # Настройка тестового окружения
    └── mocks/
        └── supabase.ts   # Моки для Supabase
```

### Именование файлов

- Тестовые файлы должны заканчиваться на `.test.ts` или `.spec.ts`
- Примеры: `supabaseAuthApi.test.ts`, `routes.spec.ts`

### Структура тестового файла

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('ModuleName', () => {
  beforeEach(() => {
    // Настройка перед каждым тестом
  });

  afterEach(() => {
    // Очистка после каждого теста
  });

  describe('functionName', () => {
    it('should do something', () => {
      // Тест
    });
  });
});
```

---

## Написание тестов

### Базовый синтаксис

```typescript
import { describe, it, expect } from 'vitest';

describe('MyFunction', () => {
  it('should return expected value', () => {
    const result = myFunction();
    expect(result).toBe('expected');
  });
});
```

### Описание тестов

Используйте `describe` для группировки связанных тестов:

```typescript
describe('supabaseAuthApi', () => {
  describe('login', () => {
    it('should successfully login user', () => {});
    it('should throw error with invalid credentials', () => {});
  });

  describe('register', () => {
    it('should successfully register new user', () => {});
  });
});
```

### Асинхронные тесты

```typescript
it('should handle async operations', async () => {
  const result = await asyncFunction();
  expect(result).toBeDefined();
});
```

### Тестирование ошибок

```typescript
it('should throw error', async () => {
  await expect(functionThatThrows()).rejects.toThrow('Error message');
});
```

### Мокирование

```typescript
import { vi } from 'vitest';

// Мок функции
const mockFunction = vi.fn();
mockFunction.mockReturnValue('value');
mockFunction.mockResolvedValue('async value');

// Мок модуля
vi.mock('../module', () => ({
  exportedFunction: vi.fn(),
}));
```

---

## Моки и фикстуры

### Моки Supabase

Для тестирования функций, использующих Supabase, используйте моки из `src/test/mocks/supabase.ts`:

```typescript
import { createMockSupabaseClient } from '../../test/mocks/supabase';

const mockSupabase = createMockSupabaseClient();
```

### Мокирование Supabase в тестах

```typescript
import { vi } from 'vitest';
import { supabase } from '../../../config/supabase';

// Мокаем Supabase клиент
vi.mock('../../../config/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
    })),
  },
}));
```

### Пример мокирования

```typescript
describe('login', () => {
  it('should successfully login', async () => {
    // Настройка мока
    (supabase.auth.signInWithPassword as any).mockResolvedValue({
      data: {
        user: { id: '123', email: 'test@example.com' },
        session: { access_token: 'token' },
      },
      error: null,
    });

    // Вызов функции
    const result = await login({ email: 'test@example.com', password: 'pass' });

    // Проверка результата
    expect(result.user.email).toBe('test@example.com');
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'pass',
    });
  });
});
```

### Очистка моков

```typescript
beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});
```

---

## Best Practices

### 1. Структура теста (AAA Pattern)

```typescript
it('should do something', () => {
  // Arrange - подготовка данных
  const input = 'test';
  
  // Act - выполнение действия
  const result = functionToTest(input);
  
  // Assert - проверка результата
  expect(result).toBe('expected');
});
```

### 2. Один тест - одна проверка

```typescript
// ❌ Плохо
it('should validate and process data', () => {
  expect(validate(data)).toBe(true);
  expect(process(data)).toBe('processed');
});

// ✅ Хорошо
it('should validate data', () => {
  expect(validate(data)).toBe(true);
});

it('should process data', () => {
  expect(process(data)).toBe('processed');
});
```

### 3. Описательные имена тестов

```typescript
// ❌ Плохо
it('test login', () => {});

// ✅ Хорошо
it('should successfully login user with valid credentials', () => {});
it('should throw error with invalid credentials', () => {});
```

### 4. Изоляция тестов

```typescript
beforeEach(() => {
  // Каждый тест должен быть независимым
  vi.clearAllMocks();
  // Сброс состояния
});
```

### 5. Тестирование граничных случаев

```typescript
describe('function', () => {
  it('should handle normal case', () => {});
  it('should handle empty input', () => {});
  it('should handle null input', () => {});
  it('should handle invalid input', () => {});
});
```

### 6. Использование матчеров

```typescript
// Проверка равенства
expect(value).toBe(expected);
expect(value).toEqual({ key: 'value' });

// Проверка типов
expect(value).toBeDefined();
expect(value).toBeNull();
expect(value).toBeTruthy();
expect(value).toBeFalsy();

// Проверка массивов
expect(array).toHaveLength(3);
expect(array).toContain(item);

// Проверка строк
expect(string).toContain('substring');
expect(string).toMatch(/regex/);

// Проверка объектов
expect(object).toHaveProperty('key');
expect(object).toMatchObject({ key: 'value' });
```

### 7. Асинхронные тесты

```typescript
// Всегда используйте async/await
it('should handle async', async () => {
  const result = await asyncFunction();
  expect(result).toBeDefined();
});

// Для промисов используйте rejects
it('should reject on error', async () => {
  await expect(promiseThatRejects()).rejects.toThrow();
});
```

---

## Примеры

### Пример 1: Тест API функции

```typescript
// src/services/api/__tests__/supabaseAuthApi.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { login } from '../supabaseAuthApi';
import { supabase } from '../../../config/supabase';

vi.mock('../../../config/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
    },
    from: vi.fn(),
  },
}));

describe('supabaseAuthApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('login', () => {
    it('should successfully login user with valid credentials', async () => {
      // Arrange
      const loginData = {
        email: 'test@example.com',
        password: 'password123',
      };

      (supabase.auth.signInWithPassword as any).mockResolvedValue({
        data: {
          user: { id: '123', email: 'test@example.com' },
          session: { access_token: 'token' },
        },
        error: null,
      });

      // Act
      const result = await login(loginData);

      // Assert
      expect(result.user.email).toBe('test@example.com');
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith(loginData);
    });
  });
});
```

### Пример 2: Тест утилиты

```typescript
// src/utils/__tests__/routes.test.ts
import { describe, it, expect } from 'vitest';
import { getEquipmentViewUrl, extractEquipmentId } from '../routes';

describe('routes utilities', () => {
  describe('getEquipmentViewUrl', () => {
    it('should generate correct view URL', () => {
      const id = '550e8400-e29b-41d4-a716-446655440000';
      const url = getEquipmentViewUrl(id);
      expect(url).toBe(`/equipment/${id}`);
    });
  });

  describe('extractEquipmentId', () => {
    it('should extract ID from URL', () => {
      const pathname = '/equipment/550e8400-e29b-41d4-a716-446655440000';
      const id = extractEquipmentId(pathname);
      expect(id).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should return null for invalid paths', () => {
      expect(extractEquipmentId('/equipment')).toBeNull();
    });
  });
});
```

### Пример 3: Тест с моками

```typescript
import { describe, it, expect, vi } from 'vitest';

// Мокаем модуль перед импортом
vi.mock('../module', () => ({
  functionToMock: vi.fn(),
}));

describe('module with mocks', () => {
  it('should use mocked function', async () => {
    const module = await import('../module');
    (module.functionToMock as any).mockResolvedValue('mocked value');

    const result = await someFunction();
    expect(result).toBe('mocked value');
  });
});
```

---

## Troubleshooting

### Проблема: Тесты не находят модули

**Решение:** Убедитесь, что пути импорта корректны и используются алиасы из `vitest.config.ts`:

```typescript
// Используйте алиасы
import { something } from '@/utils/something';
```

### Проблема: Моки не работают

**Решение:** Убедитесь, что моки определены до импорта модуля:

```typescript
// ✅ Правильно
vi.mock('../module');
import { function } from '../module';

// ❌ Неправильно
import { function } from '../module';
vi.mock('../module');
```

### Проблема: Асинхронные тесты не завершаются

**Решение:** Убедитесь, что используете `async/await` и все промисы разрешены:

```typescript
it('should handle async', async () => {
  await expect(asyncFunction()).resolves.toBe('value');
});
```

### Проблема: Тесты падают из-за таймаута

**Решение:** Увеличьте таймаут для конкретного теста:

```typescript
it('should handle slow operation', async () => {
  // ...
}, { timeout: 10000 }); // 10 секунд
```

### Проблема: Моки не очищаются между тестами

**Решение:** Используйте `beforeEach` для очистки:

```typescript
beforeEach(() => {
  vi.clearAllMocks();
});
```

---

## Покрытие кода

### Запуск с покрытием

```bash
npm test -- --coverage
```

### Настройка покрытия

В `vitest.config.ts`:

```typescript
coverage: {
  provider: 'v8',
  reporter: ['text', 'json', 'html'],
  exclude: [
    'node_modules/',
    'src/test/',
    '**/*.d.ts',
    '**/*.config.*',
  ],
}
```

### Целевое покрытие

- **Критичные функции** (API, аутентификация): > 80%
- **Утилиты**: > 70%
- **Компоненты**: > 60%

---

## CI/CD интеграция

### GitHub Actions пример

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npm test -- --run
```

---

## Дополнительные ресурсы

- [Vitest документация](https://vitest.dev/)
- [Testing Library документация](https://testing-library.com/)
- [Jest DOM матчеры](https://github.com/testing-library/jest-dom)

---

## Чеклист для новых тестов

- [ ] Тест имеет описательное имя
- [ ] Тест изолирован (не зависит от других тестов)
- [ ] Используется AAA паттерн (Arrange, Act, Assert)
- [ ] Тестируются граничные случаи
- [ ] Моки правильно настроены и очищены
- [ ] Асинхронные операции используют async/await
- [ ] Тест проходит успешно
- [ ] Код покрыт тестами (> 70% для критичных функций)

---

**Дата создания:** 2024  
**Версия:** 1.0.0  
**Последнее обновление:** 2024
