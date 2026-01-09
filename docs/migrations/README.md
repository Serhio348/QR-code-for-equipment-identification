# Миграции базы данных

Эта папка содержит SQL миграции для базы данных Supabase.

## Основной файл схемы

**ВАЖНО:** Полная схема базы данных находится в `../supabase-schema.sql`

Этот файл включает:
- ✅ Все таблицы (profiles, user_app_access, login_history, beliot_device_overrides, beliot_device_readings)
- ✅ Все функции (включая `insert_beliot_reading` с точностью до 0.001 м³)
- ✅ Все RLS политики, триггеры, индексы
- ✅ Полная документация

**Используйте `supabase-schema.sql` для создания всей базы данных.**

## Отдельная миграция

**create-beliot-readings-table.sql** - Создание только таблицы показаний Beliot:
- ✅ Создание таблицы `beliot_device_readings`
- ✅ Точность `reading_value`: `NUMERIC(12, 3)` (до 0.001 м³)
- ✅ Улучшенная функция `insert_beliot_reading` (всегда обновляет `updated_at`)
- ✅ Все индексы, RLS политики, триггеры
- ✅ Проверки создания и точности данных

**Используйте этот файл только если нужно создать только таблицу показаний без остальной схемы.**

## Проверка после применения

```sql
-- Проверка типа данных
SELECT 
  column_name,
  data_type,
  numeric_precision,
  numeric_scale
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'beliot_device_readings'
  AND column_name = 'reading_value';
-- Должно быть: NUMERIC(12, 3)

-- Проверка функции
SELECT 
  proname,
  prosrc
FROM pg_proc
WHERE proname = 'insert_beliot_reading';
```
