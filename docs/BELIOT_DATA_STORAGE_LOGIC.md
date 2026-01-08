# Логика сохранения данных Beliot в Supabase

## Как работает сохранение данных

### 1. Автоматический сбор данных (Cron Job)

Скрипт `scripts/collect-beliot-readings.ts` запускается **каждый час** через Railway cron job.

**Логика сохранения:**
- Скрипт получает текущее время (например, `08.01.2026 14:30`)
- Округляет его до **начала часа** (например, `08.01.2026 14:00`)
- Сохраняет показание в Supabase с `reading_date = 14:00`

**Пример:**
```
Время запуска скрипта: 08.01.2026 14:30
Округление: 08.01.2026 14:00
reading_date в БД: 2026-01-08 14:00:00+00
```

### 2. Структура таблицы `beliot_device_readings`

```sql
CREATE TABLE beliot_device_readings (
  id UUID PRIMARY KEY,
  device_id TEXT NOT NULL,           -- ID устройства из Beliot API
  reading_date TIMESTAMPTZ NOT NULL,  -- Дата показания (округлено до начала часа)
  reading_value NUMERIC(12, 2),      -- Значение показания
  unit TEXT DEFAULT 'м³',             -- Единица измерения
  reading_type TEXT DEFAULT 'hourly', -- Тип: 'hourly' или 'daily'
  source TEXT DEFAULT 'api',          -- Источник: 'api'
  period TEXT DEFAULT 'current',      -- Период: 'current' или 'previous'
  created_at TIMESTAMPTZ,             -- Когда создана запись
  updated_at TIMESTAMPTZ               -- Когда обновлена запись
);
```

### 3. Уникальность записей

Таблица имеет ограничение уникальности:
```sql
UNIQUE (device_id, reading_date, reading_type)
```

Это означает:
- **Если показание для этого часа уже существует** → оно **обновляется** (через `ON CONFLICT DO UPDATE`)
- **Если показания нет** → создается новая запись

**Важно:** При обновлении меняется только `reading_value` и `updated_at`, но `reading_date` остается прежним.

## Как посмотреть данные за прошлый час в Supabase

### Вариант 1: Через Supabase Dashboard (Table Editor)

1. Откройте Supabase Dashboard → ваш проект
2. Перейдите в **Table Editor** → `beliot_device_readings`
3. Используйте фильтр:
   - **Column:** `reading_date`
   - **Operator:** `gte` (greater than or equal)
   - **Value:** `2026-01-08 13:00:00` (прошлый час)
   - Добавьте второй фильтр:
   - **Column:** `reading_date`
   - **Operator:** `lt` (less than)
   - **Value:** `2026-01-08 14:00:00` (текущий час)

### Вариант 2: Через SQL Editor

#### Посмотреть данные за прошлый час (динамически):

```sql
-- Данные за прошлый час (относительно текущего времени)
SELECT 
  device_id,
  reading_date,
  reading_value,
  unit,
  updated_at
FROM beliot_device_readings
WHERE reading_date >= date_trunc('hour', NOW() - INTERVAL '1 hour')
  AND reading_date < date_trunc('hour', NOW())
ORDER BY reading_date DESC, device_id;
```

#### Посмотреть данные за конкретный час:

```sql
-- Данные за 08.01.2026 13:00 (прошлый час, если сейчас 14:00)
SELECT 
  device_id,
  reading_date,
  reading_value,
  unit,
  updated_at
FROM beliot_device_readings
WHERE reading_date >= '2026-01-08 13:00:00+00'
  AND reading_date < '2026-01-08 14:00:00+00'
ORDER BY reading_date DESC, device_id;
```

#### Посмотреть последние N часов:

```sql
-- Последние 24 часа
SELECT 
  device_id,
  reading_date,
  reading_value,
  unit,
  updated_at
FROM beliot_device_readings
WHERE reading_date >= date_trunc('hour', NOW() - INTERVAL '24 hours')
ORDER BY reading_date DESC, device_id;
```

#### Посмотреть все данные для конкретного устройства:

```sql
-- Все данные для устройства с device_id = '12345'
SELECT 
  reading_date,
  reading_value,
  unit,
  updated_at
FROM beliot_device_readings
WHERE device_id = '12345'
ORDER BY reading_date DESC;
```

### Вариант 3: Посмотреть через клиентское приложение

В клиентском приложении:
1. Откройте таблицу со счетчиками
2. Нажмите кнопку **"Архив"** у нужного счетчика
3. Выберите группировку **"По часам"**
4. Выберите диапазон дат (например, вчера или сегодня)
5. Нажмите **"Загрузить данные"**

## Примеры временных меток

Если сейчас **08.01.2026 14:30**:

| Время запуска скрипта | reading_date в БД | Описание |
|----------------------|-------------------|----------|
| 14:30 | `2026-01-08 14:00:00` | Текущий час |
| 13:30 | `2026-01-08 13:00:00` | Прошлый час |
| 12:30 | `2026-01-08 12:00:00` | 2 часа назад |
| 00:30 | `2026-01-08 00:00:00` | Начало суток |

## Важные моменты

1. **Данные обновляются каждый час** - скрипт запускается автоматически через Railway cron
2. **Округление до начала часа** - все показания привязаны к началу часа (минуты = 00)
3. **Обновление существующих записей** - если показание для часа уже есть, оно обновляется, а не создается дубликат
4. **Текущие показания** - в таблице со счетчиками отображаются данные с `reading_date = текущий час (округлено)`

## Проверка работы cron job

Чтобы убедиться, что cron job работает:

1. **Railway Dashboard:**
   - Откройте ваш проект на Railway
   - Перейдите в **Deployments** → выберите последний деплой
   - Проверьте логи cron job

2. **Supabase Dashboard:**
   - Проверьте таблицу `beliot_device_readings`
   - Посмотрите на `updated_at` - должно обновляться каждый час
   - Проверьте, что есть записи с `reading_date` за последние часы

3. **SQL запрос для проверки последних обновлений:**
```sql
SELECT 
  device_id,
  reading_date,
  reading_value,
  updated_at,
  NOW() - updated_at AS time_since_update
FROM beliot_device_readings
WHERE reading_date >= date_trunc('hour', NOW() - INTERVAL '24 hours')
ORDER BY updated_at DESC
LIMIT 20;
```

