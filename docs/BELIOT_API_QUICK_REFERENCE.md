# Beliot API - Быстрая справка

## 🔑 Аутентификация

```typescript
import { getBeliotToken } from './services/api/beliotAuthApi';

// Получить токен (автоматически кэшируется)
const token = await getBeliotToken();
```

## 📡 Базовый запрос

```typescript
import { beliotApiRequest } from './services/api/beliotApi';
import { getBeliotToken } from './services/api/beliotAuthApi';

const token = await getBeliotToken();

const response = await beliotApiRequest(
  'endpoint/path',        // Без /api в начале!
  'POST',                  // GET, POST, PUT, DELETE
  { /* тело запроса */ },  // Для POST/PUT
  undefined,               // Query параметры (опционально)
  {
    'Authorization': `Bearer ${token}`
  }
);
```

## 📋 Часто используемые endpoints

### Устройства

```typescript
// Список устройств
POST /api/device/metering_devices
Body: { device_group_id?: number[], ids?: number[] }

// Информация об устройстве
POST /api/device/metering_device/{id}
Body: { hide_appends?: string[], only?: string[] }

// Сообщения от устройства
POST /api/device/messages
Body: {
  device_id: number,
  msgType: number,        // 1=тариф, 5=профиль, 6=текущее
  msgGroup: number,       // 0=все
  startDate: number,      // unix timestamp
  stopDate: number        // unix timestamp
}
```

### Точки учета

```typescript
// Список точек учета объекта
POST /api/objects/accounting_point/list
Body: { object_id: string, with_childs?: boolean }

// Сообщения точки учета
POST /api/objects/accounting_point/messages
Body: {
  accounting_point_id: string,
  msgType: number,
  msgGroup: number,
  startDate: number,
  stopDate: number
}
```

### Абоненты

```typescript
// Основные данные абонента
POST /api/abonent/main/data
Body: {}  // Пустой объект

// Сообщения по точкам учета
POST /api/abonent/point/messages
Body: {
  accounting_point_id: number,
  msgType: number[],
  startDate: number,
  stopDate: number
}
```

## 🔢 Типы сообщений (msgType)

- `1` - Тариф (tariff)
- `5` - Профиль мощности (power_profile)
- `6` - Текущее значение (now value)

## 🔢 Группы сообщений (msgGroup)

- `0` - Все группы

## 📅 Работа с датами

```typescript
// Конвертация в unix timestamp (секунды)
const date = new Date('2024-01-01');
const timestamp = Math.floor(date.getTime() / 1000);

// Текущее время
const now = Math.floor(Date.now() / 1000);

// Вчера
const yesterday = Math.floor((Date.now() - 24*60*60*1000) / 1000);
```

## ⚡ Примеры

### Получить устройства группы "Счетчики воды"

```typescript
import { beliotApiRequest } from './services/api/beliotApi';
import { getBeliotToken } from './services/api/beliotAuthApi';

const token = await getBeliotToken();
const response = await beliotApiRequest(
  'device/metering_devices',
  'POST',
  { device_group_id: [1] }, // ID группы счетчиков воды
  undefined,
  { 'Authorization': `Bearer ${token}` }
);

const devices = response.data.metering_devices;
```

### Получить тарифы за месяц

```typescript
const startDate = Math.floor(new Date('2024-01-01').getTime() / 1000);
const stopDate = Math.floor(new Date('2024-01-31').getTime() / 1000);

const response = await beliotApiRequest(
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
  { 'Authorization': `Bearer ${token}` }
);

const messages = response.data.messages;
```

## 🛠️ Где искать endpoints

1. **Онлайн**: https://beliot.by:4443/api/documentation
2. **Файл**: `docs/beliot-api-openapi.json`
3. **Руководство**: `docs/HOW_TO_USE_BELIOT_API_SPEC.md`

## 📊 Статистика показаний приборов

### ✅ Специальные endpoints для статистики

В API есть специальные endpoints для получения статистики (не требуют вычислений на клиенте):

#### Статистика биллинга
```typescript
// Статистика биллинга компании
POST /api/statistics/company/current/billing
Body: { /* параметры */ }

// Статистика биллинга подкомпании
POST /api/statistics/subcompany/billing
Body: { /* параметры */ }
```

#### Статистика устройств
```typescript
// Статистика устройств компании
POST /api/statistics/company/current/devices
Body: { /* параметры */ }

// Статистика устройств подкомпании
POST /api/statistics/subcompany/devices
Body: { /* параметры */ }
```

#### Создание отчетов
```typescript
// Создать одиночный отчет
POST /api/report/create/single
Body: { /* параметры отчета */ }

// Создать групповой отчет
POST /api/report/create/group
Body: { /* параметры отчета */ }

// Получить данные отчета
POST /api/report/data
Body: { report_id: number }

// Список отчетов
POST /api/report/list
Body: { /* фильтры */ }
```

**Полный список endpoints**: см. `BELIOT_API_SPEC.md` → раздел "Статистика показаний"

### Получение показаний для статистики (базовый способ)

Основной endpoint для получения показаний: **`POST /api/device/messages`**

Этот endpoint возвращает все показания устройства за указанный период, из которых можно вычислить статистику:

```typescript
// Получить показания за период
const startDate = Math.floor(new Date('2024-01-01').getTime() / 1000);
const stopDate = Math.floor(new Date('2024-01-31').getTime() / 1000);

const response = await beliotApiRequest(
  'device/messages',
  'POST',
  {
    device_id: 12345,
    msgType: 1,        // 1=тариф, 5=профиль мощности, 6=текущее значение
    msgGroup: 0,       // 0=все группы
    startDate: startDate,
    stopDate: stopDate,
  },
  undefined,
  { 'Authorization': `Bearer ${token}` }
);

// response.data.messages содержит массив показаний
const messages = response.data.messages;

// Вычисляем статистику
const values = messages.map(msg => Number(msg.value || msg.reading_value || 0));
const stats = {
  count: values.length,
  min: Math.min(...values),
  max: Math.max(...values),
  avg: values.reduce((a, b) => a + b, 0) / values.length,
  total_consumption: values.length > 1 ? values[values.length - 1] - values[0] : 0
};
```

### Типы показаний (msgType)

- `1` - **Тариф** (tariff) - основные показания счетчика
- `5` - **Профиль мощности** (power_profile) - профиль потребления
- `6` - **Текущее значение** (now value) - актуальное показание

### Пример: Полная статистика за месяц

```typescript
import { beliotApiRequest } from './services/api/beliotApi';
import { getBeliotToken } from './services/api/beliotAuthApi';

async function getDeviceStatistics(deviceId: number, year: number, month: number) {
  const token = await getBeliotToken();
  
  // Вычисляем период (весь месяц)
  const startDate = Math.floor(new Date(year, month - 1, 1).getTime() / 1000);
  const stopDate = Math.floor(new Date(year, month, 0, 23, 59, 59).getTime() / 1000);
  
  // Получаем тарифы (основные показания)
  const tariffResponse = await beliotApiRequest(
    'device/messages',
    'POST',
    {
      device_id: deviceId,
      msgType: 1,        // тариф
      msgGroup: 0,
      startDate: startDate,
      stopDate: stopDate,
    },
    undefined,
    { 'Authorization': `Bearer ${token}` }
  );
  
  const tariffMessages = tariffResponse.data.messages || [];
  const tariffValues = tariffMessages
    .map(msg => Number(msg.value || msg.reading_value || 0))
    .filter(v => !isNaN(v) && v > 0);
  
  // Вычисляем статистику
  if (tariffValues.length === 0) {
    return {
      count: 0,
      min: 0,
      max: 0,
      avg: 0,
      total_consumption: 0,
      first_reading: null,
      last_reading: null,
    };
  }
  
  const sorted = [...tariffValues].sort((a, b) => a - b);
  
  return {
    count: tariffValues.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: tariffValues.reduce((a, b) => a + b, 0) / tariffValues.length,
    total_consumption: sorted[sorted.length - 1] - sorted[0],
    first_reading: {
      value: sorted[0],
      date: tariffMessages[0]?.date || tariffMessages[0]?.timestamp,
    },
    last_reading: {
      value: sorted[sorted.length - 1],
      date: tariffMessages[tariffMessages.length - 1]?.date || tariffMessages[tariffMessages.length - 1]?.timestamp,
    },
  };
}

// Использование
const stats = await getDeviceStatistics(12345, 2024, 1); // Январь 2024
console.log('Статистика:', stats);
```

### Обновление спецификации

✅ **Полная спецификация сохранена**: `docs/beliot-api-openapi.json` содержит **227 endpoints**

Для обновления спецификации:
```bash
npm run save-openapi-spec
```

Для проверки endpoints статистики:
```bash
npm run check-statistics
```

## ⚠️ Важно

- Все endpoints требуют Bearer token (кроме `/api/auth/login`)
- Даты передаются как unix timestamp (секунды)
- Endpoint в `beliotApiRequest` без `/api` в начале
- Параметры пути передаются в endpoint: `device/metering_device/${id}`
- Статистика вычисляется на стороне клиента из данных `/api/device/messages`
