# Как работать с OpenAPI спецификацией Beliot API

## 📚 Что такое OpenAPI спецификация?

OpenAPI (ранее Swagger) — это стандарт описания REST API. Спецификация содержит:
- Все доступные endpoints (URL пути)
- HTTP методы (GET, POST, PUT, DELETE)
- Параметры запросов
- Формат ответов
- Схемы данных
- Требования к аутентификации

## 🔍 Где найти спецификацию?

1. **Онлайн документация**: https://beliot.by:4443/api/documentation
   - Интерактивный Swagger UI
   - Можно тестировать endpoints прямо в браузере

2. **Сохраненная спецификация**: `docs/beliot-api-openapi.json`
   - Полная OpenAPI 3.0 спецификация
   - Можно открыть в любом JSON редакторе
   - Можно использовать в инструментах генерации кода

## 📖 Как читать OpenAPI спецификацию

### Структура спецификации

```json
{
  "openapi": "3.0.0",           // Версия OpenAPI
  "info": {                     // Информация об API
    "title": "NEKTA CORE API",
    "version": "2.0.8 Alpha"
  },
  "paths": {                    // Все доступные endpoints
    "/api/auth/login": { ... },
    "/api/device/metering_devices": { ... }
  },
  "components": {                // Переиспользуемые компоненты
    "schemas": { ... },          // Модели данных
    "securitySchemes": { ... }  // Схемы аутентификации
  }
}
```

### Пример чтения endpoint

```json
"/api/device/metering_devices": {
  "post": {                              // HTTP метод
    "tags": ["device"],                  // Группа endpoints
    "summary": "Get a list of metering devices",
    "requestBody": {                     // Тело запроса
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "properties": {
              "device_group_id": {       // Параметр запроса
                "type": "array",
                "items": { "type": "integer" }
              }
            }
          }
        }
      }
    },
    "responses": {                        // Возможные ответы
      "200": {
        "description": "OK",
        "content": {
          "application/json": {
            "schema": {
              "properties": {
                "data": {
                  "properties": {
                    "metering_devices": {
                      "type": "array",
                      "items": {
                        "$ref": "#/components/schemas/device"
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "security": [{                       // Требуемая аутентификация
      "bearerAuth": []
    }]
  }
}
```

## 🛠️ Практическое использование

### 1. Поиск нужного endpoint

**Задача**: Получить список счетчиков

**Шаги**:
1. Откройте `docs/beliot-api-openapi.json`
2. Найдите в `paths` ключ, содержащий "device" и "metering"
3. Найдете: `/api/device/metering_devices`
4. Проверьте метод: `POST`
5. Посмотрите `requestBody` - какие параметры нужны
6. Посмотрите `responses` - какой формат ответа

### 2. Использование в коде

#### Пример 1: Получение списка устройств

**Из спецификации**:
- Endpoint: `POST /api/device/metering_devices`
- Параметры: `device_group_id` (массив чисел, опционально)
- Ответ: `{ data: { metering_devices: [...] } }`

**В коде**:
```typescript
import { beliotApiRequest } from './beliotApi';
import { getBeliotToken } from './beliotAuthApi';

async function getDevices(deviceGroupId?: number[]) {
  const token = await getBeliotToken();
  
  const response = await beliotApiRequest(
    'device/metering_devices',  // endpoint без /api
    'POST',
    {
      device_group_id: deviceGroupId,  // параметры из спецификации
    },
    undefined,
    {
      'Authorization': `Bearer ${token}`
    }
  );
  
  return response.data.metering_devices;
}
```

#### Пример 2: Получение сообщений от устройства

**Из спецификации**:
- Endpoint: `POST /api/device/messages`
- Обязательные параметры:
  - `device_id` (integer)
  - `msgType` (integer)
  - `msgGroup` (integer)
  - `startDate` (integer, unix timestamp)
  - `stopDate` (integer, unix timestamp)

**В коде**:
```typescript
async function getDeviceMessages(
  deviceId: number,
  msgType: number,
  msgGroup: number,
  startDate: number,
  stopDate: number
) {
  const token = await getBeliotToken();
  
  const response = await beliotApiRequest(
    'device/messages',
    'POST',
    {
      device_id: deviceId,
      msgType: msgType,
      msgGroup: msgGroup,
      startDate: startDate,
      stopDate: stopDate,
    },
    undefined,
    {
      'Authorization': `Bearer ${token}`
    }
  );
  
  return response.data.messages;
}
```

### 3. Работа с аутентификацией

**Из спецификации**:
- Endpoint: `POST /api/auth/login`
- Параметры:
  - `email` (string, обязательный)
  - `password` (string, обязательный)
- Ответ: `{ data: { access_token: "...", token_type: "Bearer", expires_at: 1234567890 } }`

**В коде** (уже реализовано в `beliotAuthApi.ts`):
```typescript
const response = await beliotApiRequest(
  'auth/login',
  'POST',
  {
    email: 'user@example.com',
    password: 'password123'
  }
);

const token = response.data.access_token;
```

## 🔧 Инструменты для работы со спецификацией

### 1. Swagger UI (онлайн)
- URL: https://beliot.by:4443/api/documentation
- Позволяет:
  - Просматривать все endpoints
  - Тестировать API прямо в браузере
  - Видеть примеры запросов и ответов

### 2. VS Code расширения
- **OpenAPI (Swagger) Editor** - подсветка синтаксиса
- **REST Client** - тестирование API из редактора

### 3. Postman
1. Импортируйте `beliot-api-openapi.json` в Postman
2. Все endpoints будут автоматически добавлены
3. Можно тестировать и создавать коллекции

### 4. Генерация TypeScript типов
Можно использовать инструменты типа `openapi-typescript`:
```bash
npx openapi-typescript docs/beliot-api-openapi.json -o src/types/beliot-api.ts
```

## 📝 Пошаговый процесс добавления нового endpoint

### Шаг 1: Найдите endpoint в спецификации

Например, нужно получить информацию об устройстве:
- Ищем: `/api/device/metering_device/{id}`
- Метод: `POST`
- Параметр пути: `id` (integer)

### Шаг 2: Изучите параметры

```json
"requestBody": {
  "content": {
    "application/json": {
      "schema": {
        "properties": {
          "hide_appends": { "type": "array" },
          "only": { "type": "array" }
        }
      }
    }
  }
}
```

### Шаг 3: Изучите ответ

```json
"responses": {
  "200": {
    "content": {
      "application/json": {
        "schema": {
          "required": ["metering_device"],
          "properties": {
            "data": {
              "properties": {
                "metering_device": {
                  "$ref": "#/components/schemas/device"
                }
              }
            }
          }
        }
      }
    }
  }
}
```

### Шаг 4: Создайте функцию в коде

```typescript
// src/services/api/beliotDeviceApi.ts

/**
 * Получить информацию об устройстве по ID
 * 
 * Endpoint: POST /api/device/metering_device/{id}
 * 
 * @param deviceId - ID устройства
 * @param options - Опциональные параметры (hide_appends, only)
 */
export async function getDeviceById(
  deviceId: number,
  options?: {
    hide_appends?: string[];
    only?: string[];
  }
): Promise<any> {
  const token = await getBeliotToken();
  
  const response = await beliotApiRequest(
    `device/metering_device/${deviceId}`,  // путь с параметром
    'POST',
    options || {},  // тело запроса
    undefined,
    {
      'Authorization': `Bearer ${token}`
    }
  );
  
  return response.data.metering_device;
}
```

### Шаг 5: Используйте функцию

```typescript
// В компоненте или другом сервисе
import { getDeviceById } from './services/api/beliotDeviceApi';

const device = await getDeviceById(12345, {
  only: ['id', 'name', 'status']
});
```

## 🎯 Типичные задачи и решения

### Задача 1: Получить сообщения за период

**Endpoint**: `POST /api/device/messages`

**Параметры из спецификации**:
- `device_id` (integer) - ID устройства
- `msgType` (integer) - Тип сообщения (1 = тариф, 5 = профиль мощности, 6 = текущее значение)
- `msgGroup` (integer) - Группа сообщений (0 = все)
- `startDate` (integer) - Начало периода (unix timestamp)
- `stopDate` (integer) - Конец периода (unix timestamp)

**Код**:
```typescript
const startDate = Math.floor(new Date('2024-01-01').getTime() / 1000);
const stopDate = Math.floor(new Date('2024-01-31').getTime() / 1000);

const messages = await beliotApiRequest(
  'device/messages',
  'POST',
  {
    device_id: 12345,
    msgType: 1,        // тариф
    msgGroup: 0,       // все группы
    startDate: startDate,
    stopDate: stopDate,
  },
  undefined,
  {
    'Authorization': `Bearer ${token}`
  }
);
```

### Задача 2: Получить точки учета объекта

**Endpoint**: `POST /api/objects/accounting_point/list`

**Параметры**:
- `object_id` (string, обязательный) - ID объекта
- `with_childs` (boolean, опционально) - Включая дочерние объекты

**Код**:
```typescript
const points = await beliotApiRequest(
  'objects/accounting_point/list',
  'POST',
  {
    object_id: 'abc123',
    with_childs: true
  },
  undefined,
  {
    'Authorization': `Bearer ${token}`
  }
);
```

## ⚠️ Важные моменты

### 1. Аутентификация

Большинство endpoints требуют Bearer token:
```typescript
headers: {
  'Authorization': `Bearer ${token}`
}
```

Некоторые endpoints абонентов используют другой тип токена (`token` вместо `bearerAuth`).

### 2. Формат дат

Все даты в API передаются как **unix timestamp** (секунды):
```typescript
const timestamp = Math.floor(new Date().getTime() / 1000);
```

### 3. Базовый URL

Все endpoints начинаются с `/api`, но в функции `beliotApiRequest` не нужно добавлять `/api`, так как `baseUrl` уже содержит его:
```typescript
// ✅ Правильно
beliotApiRequest('device/metering_devices', 'POST', ...)

// ❌ Неправильно
beliotApiRequest('/api/device/metering_devices', 'POST', ...)
```

### 4. Параметры пути

Если endpoint содержит параметр пути (например, `{id}`), передавайте его в endpoint:
```typescript
// Endpoint: /api/device/metering_device/{id}
beliotApiRequest(`device/metering_device/${deviceId}`, 'POST', ...)
```

### 5. Обязательные vs опциональные параметры

В спецификации:
- `required: ["field"]` - поле обязательное
- Без `required` - поле опциональное

## 🔗 Полезные ссылки

- [OpenAPI Specification](https://swagger.io/specification/)
- [Swagger UI Documentation](https://swagger.io/tools/swagger-ui/)
- Онлайн документация: https://beliot.by:4443/api/documentation

## 📋 Чеклист при добавлении нового endpoint

- [ ] Найти endpoint в спецификации
- [ ] Проверить HTTP метод (GET/POST/PUT/DELETE)
- [ ] Изучить обязательные параметры
- [ ] Изучить формат ответа
- [ ] Проверить требования к аутентификации
- [ ] Создать TypeScript интерфейс для параметров
- [ ] Создать TypeScript интерфейс для ответа
- [ ] Реализовать функцию в соответствующем API файле
- [ ] Добавить обработку ошибок
- [ ] Добавить логирование
- [ ] Протестировать функцию
