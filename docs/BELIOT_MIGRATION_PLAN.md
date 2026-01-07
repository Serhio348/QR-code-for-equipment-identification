# План миграции счетчиков Beliot на Supabase и настройка автоматического сбора

**Дата создания:** 2026-01-07  
**Статус:** В разработке  
**Приоритет:** Критический

---

## 🎯 Цели

1. **Мигрировать показания счетчиков Beliot на Supabase** (вместо Google Sheets)
2. **Настроить автоматический сбор показаний** через Railway cron job
3. **Улучшить производительность** работы с показаниями счетчиков

---

## 📊 Текущее состояние

### Что уже есть:
- ✅ Интеграция с Beliot API (`src/services/api/beliotDeviceApi.ts`)
- ✅ Пользовательские изменения счетчиков в Supabase (`beliot_device_overrides`)
- ✅ Компонент отображения счетчиков (`BeliotDevicesTest.tsx`)

### Что нужно сделать:
- 🔄 Создать таблицу `beliot_device_readings` в Supabase
- 🔄 Мигрировать данные из Google Sheets (если есть)
- 🔄 Создать API для работы с показаниями через Supabase
- 🔄 Настроить автоматический сбор через Railway

---

## 🗄️ Этап 1: Создание схемы базы данных

### 1.1. Таблица `beliot_device_readings`

**Файл:** `docs/supabase-schema.sql`

```sql
-- Таблица для хранения показаний счетчиков Beliot
CREATE TABLE IF NOT EXISTS public.beliot_device_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  reading_date TIMESTAMPTZ NOT NULL,
  reading_value NUMERIC(12, 2) NOT NULL,
  unit TEXT DEFAULT 'м³',
  reading_type TEXT DEFAULT 'hourly' CHECK (reading_type IN ('hourly', 'daily')),
  source TEXT DEFAULT 'api',
  period TEXT DEFAULT 'current' CHECK (period IN ('current', 'previous')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Уникальность: одно показание за период для устройства
  CONSTRAINT unique_device_reading UNIQUE (device_id, reading_date, reading_type)
);

-- Индексы для производительности
CREATE INDEX IF NOT EXISTS idx_beliot_readings_device_date 
  ON public.beliot_device_readings(device_id, reading_date DESC);

CREATE INDEX IF NOT EXISTS idx_beliot_readings_date 
  ON public.beliot_device_readings(reading_date DESC);

CREATE INDEX IF NOT EXISTS idx_beliot_readings_device_type 
  ON public.beliot_device_readings(device_id, reading_type);

-- Комментарии
COMMENT ON TABLE public.beliot_device_readings IS 'Показания счетчиков Beliot. Автоматически собираются через Railway cron job.';
COMMENT ON COLUMN public.beliot_device_readings.device_id IS 'ID устройства из Beliot API';
COMMENT ON COLUMN public.beliot_device_readings.reading_date IS 'Дата и время снятия показания';
COMMENT ON COLUMN public.beliot_device_readings.reading_value IS 'Значение показания';
COMMENT ON COLUMN public.beliot_device_readings.reading_type IS 'Тип показания: hourly (почасовой) или daily (ежедневный)';
COMMENT ON COLUMN public.beliot_device_readings.source IS 'Источник данных: всегда "api" (из Beliot API)';
COMMENT ON COLUMN public.beliot_device_readings.period IS 'Период: current (текущее) или previous (предыдущее)';
```

### 1.2. RLS политики

```sql
-- Включить RLS
ALTER TABLE public.beliot_device_readings ENABLE ROW LEVEL SECURITY;

-- Все авторизованные пользователи могут читать показания
CREATE POLICY "Users can read readings"
  ON public.beliot_device_readings FOR SELECT
  USING (auth.role() = 'authenticated');

-- Только система (через Service Role) может вставлять показания
-- Пользователи не могут вставлять показания напрямую
CREATE POLICY "Only system can insert readings"
  ON public.beliot_device_readings FOR INSERT
  WITH CHECK (false); -- Блокируем прямые вставки, только через функцию

-- Пользователи не могут обновлять или удалять показания
CREATE POLICY "Users cannot modify readings"
  ON public.beliot_device_readings FOR ALL
  USING (false)
  WITH CHECK (false);
```

### 1.3. Функция для вставки показаний (SECURITY DEFINER)

```sql
-- Функция для безопасной вставки показаний (используется Railway скриптом)
CREATE OR REPLACE FUNCTION public.insert_beliot_reading(
  p_device_id TEXT,
  p_reading_date TIMESTAMPTZ,
  p_reading_value NUMERIC,
  p_unit TEXT DEFAULT 'м³',
  p_reading_type TEXT DEFAULT 'hourly',
  p_source TEXT DEFAULT 'api',
  p_period TEXT DEFAULT 'current'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id UUID;
BEGIN
  -- Проверяем на дубликаты (по device_id + reading_date + reading_type)
  -- Используем ON CONFLICT для upsert
  INSERT INTO public.beliot_device_readings (
    device_id,
    reading_date,
    reading_value,
    unit,
    reading_type,
    source,
    period
  )
  VALUES (
    p_device_id,
    p_reading_date,
    p_reading_value,
    p_unit,
    p_reading_type,
    p_source,
    p_period
  )
  ON CONFLICT (device_id, reading_date, reading_type) 
  DO UPDATE SET
    reading_value = EXCLUDED.reading_value,
    updated_at = NOW()
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;

-- Комментарий к функции
COMMENT ON FUNCTION public.insert_beliot_reading IS 'Безопасная вставка показания счетчика. Используется Railway cron job. Предотвращает дубликаты.';
```

### 1.4. Функция для получения последнего показания

```sql
-- Функция для получения последнего показания устройства
CREATE OR REPLACE FUNCTION public.get_last_beliot_reading(
  p_device_id TEXT,
  p_reading_type TEXT DEFAULT 'hourly'
)
RETURNS TABLE (
  id UUID,
  device_id TEXT,
  reading_date TIMESTAMPTZ,
  reading_value NUMERIC,
  unit TEXT,
  reading_type TEXT,
  source TEXT,
  period TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id,
    r.device_id,
    r.reading_date,
    r.reading_value,
    r.unit,
    r.reading_type,
    r.source,
    r.period,
    r.created_at
  FROM public.beliot_device_readings r
  WHERE r.device_id = p_device_id
    AND r.reading_type = p_reading_type
  ORDER BY r.reading_date DESC
  LIMIT 1;
END;
$$;
```

---

## 🔧 Этап 2: Создание API для работы с показаниями

### 2.1. API клиент для Supabase

**Файл:** `src/services/api/supabaseBeliotReadingsApi.ts`

```typescript
import { supabase } from '../../config/supabase';

export interface BeliotDeviceReading {
  id: string;
  device_id: string;
  reading_date: string;
  reading_value: number;
  unit: string;
  reading_type: 'hourly' | 'daily';
  source: string;
  period: 'current' | 'previous';
  created_at: string;
  updated_at: string;
}

export interface GetReadingsOptions {
  device_id?: string;
  start_date?: string;
  end_date?: string;
  reading_type?: 'hourly' | 'daily' | 'all';
  limit?: number;
  offset?: number;
}

export interface GetReadingsResponse {
  data: BeliotDeviceReading[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

/**
 * Получить показания счетчиков с пагинацией
 */
export async function getBeliotReadings(
  options: GetReadingsOptions = {}
): Promise<GetReadingsResponse> {
  const {
    device_id,
    start_date,
    end_date,
    reading_type = 'all',
    limit = 100,
    offset = 0,
  } = options;

  let query = supabase
    .from('beliot_device_readings')
    .select('*', { count: 'exact' })
    .order('reading_date', { ascending: false })
    .range(offset, offset + limit - 1);

  if (device_id) {
    query = query.eq('device_id', device_id);
  }

  if (start_date) {
    query = query.gte('reading_date', start_date);
  }

  if (end_date) {
    query = query.lte('reading_date', end_date);
  }

  if (reading_type !== 'all') {
    query = query.eq('reading_type', reading_type);
  }

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Ошибка получения показаний: ${error.message}`);
  }

  return {
    data: data || [],
    total: count || 0,
    limit,
    offset,
    has_more: (count || 0) > offset + limit,
  };
}

/**
 * Получить последнее показание устройства
 */
export async function getLastBeliotReading(
  device_id: string,
  reading_type: 'hourly' | 'daily' = 'hourly'
): Promise<BeliotDeviceReading | null> {
  const { data, error } = await supabase.rpc('get_last_beliot_reading', {
    p_device_id: device_id,
    p_reading_type: reading_type,
  });

  if (error) {
    throw new Error(`Ошибка получения последнего показания: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return null;
  }

  return data[0] as BeliotDeviceReading;
}

/**
 * Получить статистику по показаниям устройства
 */
export async function getBeliotReadingStats(
  device_id: string,
  start_date?: string,
  end_date?: string
): Promise<{
  count: number;
  min_value: number;
  max_value: number;
  avg_value: number;
  total_consumption: number;
}> {
  let query = supabase
    .from('beliot_device_readings')
    .select('reading_value')
    .eq('device_id', device_id)
    .order('reading_date', { ascending: true });

  if (start_date) {
    query = query.gte('reading_date', start_date);
  }

  if (end_date) {
    query = query.lte('reading_date', end_date);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Ошибка получения статистики: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return {
      count: 0,
      min_value: 0,
      max_value: 0,
      avg_value: 0,
      total_consumption: 0,
    };
  }

  const values = data.map((r) => Number(r.reading_value));
  const sorted = [...values].sort((a, b) => a - b);

  // Вычисляем потребление (разница между первым и последним)
  const total_consumption = sorted.length > 1 
    ? sorted[sorted.length - 1] - sorted[0] 
    : 0;

  return {
    count: values.length,
    min_value: sorted[0],
    max_value: sorted[sorted.length - 1],
    avg_value: values.reduce((a, b) => a + b, 0) / values.length,
    total_consumption,
  };
}
```

---

## 🤖 Этап 3: Скрипт автоматического сбора (Railway)

### 3.1. Скрипт сбора показаний

**Файл:** `scripts/collect-beliot-readings.ts`

```typescript
import { createClient } from '@supabase/supabase-js';
import { getBeliotAuthToken, getCompanyDevices, getDeviceReadings } from '../src/services/api/beliotDeviceApi';

// Загружаем переменные окружения
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const beliotLogin = process.env.BELIOT_LOGIN || 'energo@brestvodka.by';
const beliotPassword = process.env.BELIOT_PASSWORD;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Переменные окружения не настроены!');
  console.error('Нужны: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

if (!beliotPassword) {
  console.error('❌ BELIOT_PASSWORD не настроен!');
  process.exit(1);
}

// Создаем Supabase клиент с Service Role key
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Собрать показания для всех устройств
 */
async function collectReadings() {
  console.log('🔄 Начало автоматического сбора показаний...');
  console.log(`⏰ Время: ${new Date().toISOString()}`);

  try {
    // 1. Получаем токен Beliot API
    console.log('🔐 Получение токена Beliot API...');
    const token = await getBeliotAuthToken(beliotLogin, beliotPassword);
    console.log('✅ Токен получен');

    // 2. Получаем список всех устройств
    console.log('📋 Получение списка устройств...');
    const devices = await getCompanyDevices({}, token);
    console.log(`✅ Найдено устройств: ${devices.length}`);

    let successCount = 0;
    let errorCount = 0;
    let duplicateCount = 0;

    // 3. Для каждого устройства собираем показания
    for (const device of devices) {
      try {
        console.log(`\n📊 Обработка устройства: ${device.device_id} (${device.name || 'Без названия'})`);

        // Получаем текущее показание из Beliot API
        const readings = await getDeviceReadings(device.device_id, token);

        if (!readings.current) {
          console.log(`⚠️ Текущее показание не найдено для устройства ${device.device_id}`);
          continue;
        }

        const currentReading = readings.current;
        const readingDate = new Date(currentReading.date);
        const readingValue = Number(currentReading.value);
        const unit = currentReading.unit || 'м³';

        // Проверяем, есть ли уже показание за этот час
        // Для почасовых показаний округляем до начала часа
        const hourStart = new Date(readingDate);
        hourStart.setMinutes(0, 0, 0);

        // Вставляем показание через функцию (предотвращает дубликаты)
        const { data, error } = await supabase.rpc('insert_beliot_reading', {
          p_device_id: device.device_id,
          p_reading_date: hourStart.toISOString(),
          p_reading_value: readingValue,
          p_unit: unit,
          p_reading_type: 'hourly',
          p_source: 'api',
          p_period: 'current',
        });

        if (error) {
          // Проверяем, это дубликат или реальная ошибка
          if (error.message.includes('duplicate') || error.code === '23505') {
            duplicateCount++;
            console.log(`⚠️ Дубликат для устройства ${device.device_id} (показание за этот час уже есть)`);
          } else {
            errorCount++;
            console.error(`❌ Ошибка для устройства ${device.device_id}:`, error.message);
          }
        } else {
          successCount++;
          console.log(`✅ Показание сохранено: ${readingValue} ${unit} на ${hourStart.toISOString()}`);
        }
      } catch (error: any) {
        errorCount++;
        console.error(`❌ Ошибка для устройства ${device.device_id}:`, error.message);
      }
    }

    console.log('\n📊 Итоги сбора:');
    console.log(`   ✅ Успешно: ${successCount}`);
    console.log(`   ⚠️ Дубликаты: ${duplicateCount}`);
    console.log(`   ❌ Ошибок: ${errorCount}`);
    console.log(`   📋 Всего устройств: ${devices.length}`);

    // Сохраняем статистику сбора (опционально)
    await logCollectionStats({
      timestamp: new Date().toISOString(),
      total_devices: devices.length,
      success_count: successCount,
      duplicate_count: duplicateCount,
      error_count: errorCount,
    });

    console.log('\n✅ Сбор показаний завершен');
  } catch (error: any) {
    console.error('❌ Критическая ошибка при сборе показаний:', error.message);
    process.exit(1);
  }
}

/**
 * Логирование статистики сбора (опционально)
 */
async function logCollectionStats(stats: {
  timestamp: string;
  total_devices: number;
  success_count: number;
  duplicate_count: number;
  error_count: number;
}) {
  // Можно сохранить в отдельную таблицу для мониторинга
  // Пока просто логируем
  console.log('📈 Статистика сбора:', JSON.stringify(stats, null, 2));
}

// Запускаем сбор
collectReadings()
  .then(() => {
    console.log('✅ Скрипт завершен успешно');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Критическая ошибка:', error);
    process.exit(1);
  });
```

### 3.2. Конфигурация Railway

**Файл:** `railway.json` (или обновить существующий)

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "node scripts/collect-beliot-readings.js",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

**Или через `nixpacks.toml`:**

```toml
[phases.setup]
nixPkgs = ["nodejs-18_x"]

[phases.install]
cmds = ["npm install"]

[phases.build]
cmds = ["npm run build"]

[start]
cmd = "node scripts/collect-beliot-readings.js"
```

### 3.3. Переменные окружения в Railway

Необходимые переменные:
- `SUPABASE_URL` - URL проекта Supabase
- `SUPABASE_SERVICE_ROLE_KEY` - Service Role key (для вставки данных)
- `BELIOT_LOGIN` - Логин для Beliot API (по умолчанию: `energo@brestvodka.by`)
- `BELIOT_PASSWORD` - Пароль для Beliot API

### 3.4. Настройка Cron Job в Railway

1. В Railway Dashboard → ваш проект → **Cron Jobs**
2. Создать новый cron job:
   - **Schedule:** `0 * * * *` (каждый час в начале часа)
   - **Command:** `node scripts/collect-beliot-readings.js`
   - **Service:** выбрать ваш сервис

---

## 🔄 Этап 4: Миграция данных (если есть в Google Sheets)

### 4.1. Скрипт миграции

**Файл:** `scripts/migrate-beliot-readings-to-supabase.ts`

```typescript
// Скрипт для миграции показаний из Google Sheets в Supabase
// Запускается один раз для переноса существующих данных

import { createClient } from '@supabase/supabase-js';
import { getBeliotDevicesOverrides } from '../src/services/api/beliotDevicesStorageApi';

// ... (логика миграции)
```

---

## 🎨 Этап 5: Обновление UI

### 5.1. Хук для работы с показаниями

**Файл:** `src/hooks/useBeliotDeviceReadings.ts`

```typescript
import { useState, useEffect } from 'react';
import { getBeliotReadings, getLastBeliotReading } from '../services/api/supabaseBeliotReadingsApi';
import type { BeliotDeviceReading, GetReadingsOptions } from '../services/api/supabaseBeliotReadingsApi';

export function useBeliotDeviceReadings(
  device_id: string | null,
  options: GetReadingsOptions = {}
) {
  const [readings, setReadings] = useState<BeliotDeviceReading[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    if (!device_id) {
      setReadings([]);
      return;
    }

    setLoading(true);
    setError(null);

    getBeliotReadings({
      ...options,
      device_id,
    })
      .then((response) => {
        setReadings(response.data);
        setTotal(response.total);
        setHasMore(response.has_more);
      })
      .catch((err) => {
        setError(err);
        setReadings([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [device_id, JSON.stringify(options)]);

  return {
    readings,
    loading,
    error,
    total,
    hasMore,
  };
}
```

### 5.2. Обновление компонента BeliotDevicesTest

**Файл:** `src/components/BeliotDevicesTest.tsx`

- Добавить отображение исторических показаний из Supabase
- Добавить переключение между текущими (API) и историческими (Supabase) показаниями
- Добавить графики потребления

---

## ✅ Чеклист реализации

### Этап 1: База данных
- [ ] Создать таблицу `beliot_device_readings` в Supabase
- [ ] Настроить индексы
- [ ] Настроить RLS политики
- [ ] Создать функцию `insert_beliot_reading`
- [ ] Создать функцию `get_last_beliot_reading`
- [ ] Протестировать функции через SQL Editor

### Этап 2: API
- [ ] Создать `supabaseBeliotReadingsApi.ts`
- [ ] Реализовать `getBeliotReadings` с пагинацией
- [ ] Реализовать `getLastBeliotReading`
- [ ] Реализовать `getBeliotReadingStats`
- [ ] Протестировать API функции

### Этап 3: Railway
- [ ] Создать скрипт `collect-beliot-readings.ts`
- [ ] Настроить Railway проект
- [ ] Настроить переменные окружения
- [ ] Настроить cron job (каждый час)
- [ ] Протестировать автоматический сбор
- [ ] Настроить мониторинг и логирование

### Этап 4: Миграция (если нужно)
- [ ] Создать скрипт миграции из Google Sheets
- [ ] Выполнить миграцию данных
- [ ] Проверить целостность данных

### Этап 5: UI
- [ ] Создать хук `useBeliotDeviceReadings`
- [ ] Обновить `BeliotDevicesTest.tsx`
- [ ] Добавить отображение исторических данных
- [ ] Добавить графики потребления
- [ ] Протестировать UI

---

## 📊 Ожидаемые результаты

### Производительность
- ⚡ Загрузка показаний: < 1 секунды (с пагинацией)
- ⚡ Вставка показания: < 100ms
- ⚡ Запрос последнего показания: < 50ms

### Масштабируемость
- 📈 Поддержка миллионов записей
- 📈 Автоматический сбор без участия пользователя
- 📈 Надежное хранение данных

### Надежность
- 🛡️ Предотвращение дубликатов
- 🛡️ Обработка ошибок API
- 🛡️ Логирование всех операций

---

## 🔗 Связанные документы

- [DEVICE_READINGS_SAVE_PLAN.md](./DEVICE_READINGS_SAVE_PLAN.md) - Старый план (Google Sheets)
- [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) - Настройка Supabase
- [DEVELOPMENT_ROADMAP.md](./DEVELOPMENT_ROADMAP.md) - Общий план развития

---

**Последнее обновление:** 2026-01-07

