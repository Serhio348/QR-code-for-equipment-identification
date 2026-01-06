# Инструкция по настройке Supabase

## Шаг 1: Создание проекта Supabase

1. Перейдите на [supabase.com](https://supabase.com)
2. Войдите или зарегистрируйтесь
3. Нажмите "New Project"
4. Заполните данные:
   - **Name**: `equipment-management` (или другое название)
   - **Database Password**: Создайте надежный пароль (сохраните его!)
   - **Region**: Выберите ближайший регион
5. Нажмите "Create new project"
6. Дождитесь создания проекта (2-3 минуты)

## Шаг 2: Получение ключей доступа

1. В проекте перейдите в **Settings** → **API**
2. Скопируйте:
   - **Project URL** (например: `https://xxxxx.supabase.co`)
   - **anon public** key (длинная строка)

3. Сохраните их в `.env.local`:
```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

## Шаг 3: Создание таблиц через SQL Editor

1. Перейдите в **SQL Editor** в левом меню
2. Создайте новый запрос
3. Скопируйте и выполните SQL из `docs/supabase-schema.sql` (будет создан отдельно)

Или создайте таблицы вручную через Table Editor:

### Таблица `profiles`

1. **Table Editor** → **New Table**
2. Название: `profiles`
3. Колонки:
   - `id` (uuid, Primary Key, References: auth.users(id))
   - `email` (text, Unique, Not Null)
   - `name` (text, Nullable)
   - `role` (text, Default: 'user', Check: role IN ('admin', 'user'))
   - `created_at` (timestamptz, Default: now())
   - `last_login_at` (timestamptz, Nullable)
   - `last_activity_at` (timestamptz, Nullable)
   - `updated_at` (timestamptz, Default: now())

### Таблица `user_app_access`

1. **Table Editor** → **New Table**
2. Название: `user_app_access`
3. Колонки:
   - `id` (uuid, Primary Key, Default: gen_random_uuid())
   - `user_id` (uuid, References: auth.users(id), On Delete: Cascade)
   - `email` (text, Not Null)
   - `equipment` (boolean, Default: false)
   - `water` (boolean, Default: false)
   - `updated_at` (timestamptz, Default: now())
   - `updated_by` (text, Nullable)
   - Unique constraint: (user_id, email)

### Таблица `login_history`

1. **Table Editor** → **New Table**
2. Название: `login_history`
3. Колонки:
   - `id` (uuid, Primary Key, Default: gen_random_uuid())
   - `user_id` (uuid, References: auth.users(id), On Delete: Cascade)
   - `email` (text, Not Null)
   - `login_at` (timestamptz, Default: now())
   - `ip_address` (text, Nullable)
   - `success` (boolean, Default: true)
   - `failure_reason` (text, Nullable)

### Таблица `beliot_device_overrides`

1. **Table Editor** → **New Table**
2. Название: `beliot_device_overrides`
3. Колонки:
   - `id` (uuid, Primary Key, Default: gen_random_uuid())
   - `device_id` (text, Unique, Not Null)
   - `name` (text, Nullable)
   - `address` (text, Nullable)
   - `serial_number` (text, Nullable)
   - `device_group` (text, Nullable)
   - `object_name` (text, Nullable)
   - `last_sync` (timestamptz, Nullable)
   - `last_modified` (timestamptz, Default: now())
   - `modified_by` (text, Nullable)
   - `created_at` (timestamptz, Default: now())
   - `updated_at` (timestamptz, Default: now())

## Шаг 4: Настройка Row Level Security (RLS)

### Для таблицы `profiles`

1. Включите RLS: **Authentication** → **Policies** → **Enable RLS**
2. Создайте политики:

**Политика 1: Users can view own profile**
```sql
CREATE POLICY "Users can view own profile"
ON profiles FOR SELECT
USING (auth.uid() = id);
```

**Политика 2: Users can update own profile**
```sql
CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE
USING (auth.uid() = id);
```

**Политика 3: Admins can view all profiles**
```sql
CREATE POLICY "Admins can view all profiles"
ON profiles FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);
```

### Для таблицы `user_app_access`

1. Включите RLS
2. Создайте политики:

**Политика 1: Users can view own access**
```sql
CREATE POLICY "Users can view own access"
ON user_app_access FOR SELECT
USING (auth.uid() = user_id);
```

**Политика 2: Admins can manage all access**
```sql
CREATE POLICY "Admins can manage all access"
ON user_app_access FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);
```

### Для таблицы `login_history`

1. Включите RLS
2. Создайте политики:

**Политика 1: Users can view own login history**
```sql
CREATE POLICY "Users can view own login history"
ON login_history FOR SELECT
USING (auth.uid() = user_id);
```

**Политика 2: Admins can view all login history**
```sql
CREATE POLICY "Admins can view all login history"
ON login_history FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);
```

### Для таблицы `beliot_device_overrides`

1. Включите RLS
2. Создайте политики:

**Политика 1: Authenticated users can view overrides**
```sql
CREATE POLICY "Authenticated users can view overrides"
ON beliot_device_overrides FOR SELECT
USING (auth.role() = 'authenticated');
```

**Политика 2: Authenticated users can manage overrides**
```sql
CREATE POLICY "Authenticated users can manage overrides"
ON beliot_device_overrides FOR ALL
USING (auth.role() = 'authenticated');
```

## Шаг 5: Создание индексов

Выполните в SQL Editor:

```sql
-- Индекс для быстрого поиска по email в profiles
CREATE INDEX idx_profiles_email ON profiles(email);

-- Индекс для быстрого поиска по user_id в user_app_access
CREATE INDEX idx_user_app_access_user_id ON user_app_access(user_id);

-- Индекс для быстрого поиска по email в user_app_access
CREATE INDEX idx_user_app_access_email ON user_app_access(email);

-- Индекс для быстрого поиска по device_id в beliot_device_overrides
CREATE INDEX idx_beliot_overrides_device_id ON beliot_device_overrides(device_id);

-- Индекс для быстрого поиска по группе в beliot_device_overrides
CREATE INDEX idx_beliot_overrides_group ON beliot_device_overrides(device_group);
```

## Шаг 6: Создание функций и триггеров

### Функция для автоматического создания профиля при регистрации

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'user')
  );
  
  -- Создаем запись доступа по умолчанию
  INSERT INTO public.user_app_access (user_id, email, equipment, water)
  VALUES (NEW.id, NEW.email, false, false);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Триггер для автоматического создания профиля

```sql
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### Функция для автоматического логирования входа

```sql
CREATE OR REPLACE FUNCTION public.log_login(
  p_user_id UUID,
  p_email TEXT,
  p_success BOOLEAN,
  p_failure_reason TEXT DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  INSERT INTO public.login_history (
    user_id,
    email,
    login_at,
    ip_address,
    success,
    failure_reason
  )
  VALUES (
    p_user_id,
    p_email,
    NOW(),
    p_ip_address,
    p_success,
    p_failure_reason
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Шаг 7: Установка зависимостей в проекте

```bash
npm install @supabase/supabase-js
```

## Шаг 8: Создание конфигурационного файла

Создайте `src/config/supabase.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

## Шаг 9: Проверка подключения

Создайте тестовый файл `src/utils/testSupabase.ts`:

```typescript
import { supabase } from '../config/supabase';

export async function testSupabaseConnection() {
  try {
    const { data, error } = await supabase.from('profiles').select('count');
    
    if (error) {
      console.error('❌ Ошибка подключения к Supabase:', error);
      return false;
    }
    
    console.log('✅ Подключение к Supabase успешно!');
    return true;
  } catch (error) {
    console.error('❌ Ошибка:', error);
    return false;
  }
}
```

Вызовите в консоли браузера после загрузки приложения.

## Готово! ✅

Теперь Supabase настроен и готов к использованию. Переходите к этапу 2 плана миграции.

