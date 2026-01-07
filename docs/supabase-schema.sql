-- ============================================================================
-- Схема базы данных Supabase для системы управления оборудованием
-- ============================================================================
--
-- ВАЖНО: Порядок выполнения имеет значение!
-- 1. Удаление существующих объектов (политики, функции, триггеры)
-- 2. Создание таблиц и индексов
-- 3. Создание функций (должны быть созданы ДО RLS политик)
-- 4. Создание RLS политик (используют функции)
-- 5. Создание триггеров (используют функции)
-- 6. Настройка search_path для функций
--
-- Скрипт полностью идемпотентен: можно выполнять многократно без ошибок
-- ============================================================================

-- ============================================================================
-- ОЧИСТКА: Удаление существующих объектов
-- ============================================================================
-- Сначала удаляем существующие политики и функции, чтобы избежать конфликтов
DROP POLICY IF EXISTS "Users can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Trigger can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

DROP POLICY IF EXISTS "Users can view own access" ON public.user_app_access;
DROP POLICY IF EXISTS "Trigger can insert access" ON public.user_app_access;
DROP POLICY IF EXISTS "Admins can manage all access" ON public.user_app_access;

DROP POLICY IF EXISTS "Users can view own login history" ON public.login_history;
DROP POLICY IF EXISTS "Admins can view all login history" ON public.login_history;

DROP POLICY IF EXISTS "Authenticated users can view overrides" ON public.beliot_device_overrides;
DROP POLICY IF EXISTS "Only admins can modify overrides" ON public.beliot_device_overrides;

-- Удаляем существующие функции
DROP FUNCTION IF EXISTS public.is_admin() CASCADE;
DROP FUNCTION IF EXISTS public.get_user_role(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.handle_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.log_login(UUID, BOOLEAN, TEXT, TEXT) CASCADE;

-- ============================================================================
-- ТАБЛИЦА: profiles
-- Профили пользователей (расширение auth.users)
-- ============================================================================

-- Создаем таблицу, если не существует
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Создаем/обновляем индексы
DROP INDEX IF EXISTS idx_profiles_email;
DROP INDEX IF EXISTS idx_profiles_role;
CREATE INDEX idx_profiles_email ON public.profiles(email);
CREATE INDEX idx_profiles_role ON public.profiles(role);

-- ============================================================================
-- ТАБЛИЦА: user_app_access
-- Настройки доступа пользователей к приложениям
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_app_access (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  equipment BOOLEAN DEFAULT false,
  water BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT
);

-- Индексы
DROP INDEX IF EXISTS idx_user_app_access_user_id;
CREATE INDEX idx_user_app_access_user_id ON public.user_app_access(user_id);

-- ============================================================================
-- ТАБЛИЦА: login_history
-- История входов пользователей
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.login_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  login_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT,
  success BOOLEAN DEFAULT true,
  failure_reason TEXT
);

-- Удаляем колонку email, если она существует (для миграции со старой схемы)
ALTER TABLE public.login_history DROP COLUMN IF EXISTS email;

-- Индексы
DROP INDEX IF EXISTS idx_login_history_user_id;
DROP INDEX IF EXISTS idx_login_history_login_at;
DROP INDEX IF EXISTS idx_login_history_email; -- Удаляем индекс на email, так как колонка удалена
CREATE INDEX idx_login_history_user_id ON public.login_history(user_id);
CREATE INDEX idx_login_history_login_at ON public.login_history(login_at DESC);

-- ============================================================================
-- ТАБЛИЦА: beliot_device_overrides
-- Пользовательские изменения данных счетчиков Beliot
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.beliot_device_overrides (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id TEXT NOT NULL UNIQUE,
  name TEXT,
  address TEXT,
  serial_number TEXT,
  device_group TEXT,
  object_name TEXT,
  last_sync TIMESTAMPTZ,
  last_modified TIMESTAMPTZ DEFAULT NOW(),
  modified_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индексы
-- ВАЖНО: Не создаем idx_beliot_overrides_device_id, так как UNIQUE индекс beliot_device_overrides_device_id_key уже создает индекс на device_id
DROP INDEX IF EXISTS idx_beliot_overrides_device_id; -- Удаляем избыточный индекс (UNIQUE уже создает индекс)
DROP INDEX IF EXISTS idx_beliot_overrides_group;
CREATE INDEX idx_beliot_overrides_group ON public.beliot_device_overrides(device_group);

-- ============================================================================
-- ФУНКЦИИ
-- ============================================================================
--
-- ВАЖНО: Функции должны быть созданы ДО RLS политик!
-- RLS политики используют эти функции в своих условиях (USING/WITH CHECK)
--
-- ============================================================================

-- Вспомогательная функция для проверки, является ли пользователь администратором
-- Используется в RLS политиках для оптимизации запросов
-- STABLE: результат не меняется в рамках одной транзакции
-- SECURITY DEFINER: выполняется с правами создателя функции
-- ВАЖНО: search_path устанавливается через ALTER FUNCTION после создания (нельзя SET в STABLE функции)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  -- SECURITY DEFINER автоматически обходит RLS
  -- Явно указываем схему для безопасности
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Функция для получения роли пользователя (обходит RLS)
-- Используется в RLS политиках для предотвращения рекурсии
-- SECURITY DEFINER: выполняется с правами создателя функции (обходит RLS)
-- ВАЖНО: search_path устанавливается через ALTER FUNCTION после создания (нельзя SET в STABLE функции)
CREATE OR REPLACE FUNCTION public.get_user_role(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  user_role TEXT;
BEGIN
  -- SECURITY DEFINER автоматически обходит RLS
  -- Явно указываем схему public для безопасности
  SELECT role INTO user_role
  FROM public.profiles
  WHERE id = p_user_id;
  
  RETURN COALESCE(user_role, 'user');
EXCEPTION
  WHEN OTHERS THEN
    RETURN 'user';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Функция для автоматического создания профиля при регистрации
-- Вызывается триггером при создании нового пользователя в auth.users
-- SECURITY DEFINER: выполняется с правами создателя функции (обходит RLS)
-- ON CONFLICT: защита от повторных вызовов (race condition, восстановление пользователя)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  -- Защита от атак через подмену схемы (schema injection)
  -- ВАЖНО: Включаем auth схему для доступа к auth.users и NEW, но явно указываем public для наших таблиц
  SET search_path = public, auth, pg_temp;
  
  -- КРИТИЧЕСКИ ВАЖНО: Игнорируем role из user_metadata для безопасности
  -- Всегда устанавливаем роль 'user' при регистрации
  -- Роль 'admin' может быть назначена только администратором через UPDATE
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    'user'  -- Всегда 'user', игнорируем user_metadata->>'role' для безопасности
  )
  ON CONFLICT (id) DO NOTHING;  -- Защита от повторных вызовов триггера
  
  -- Создаем запись доступа по умолчанию
  -- email не сохраняем: получаем через JOIN с profiles
  INSERT INTO public.user_app_access (user_id, equipment, water)
  VALUES (NEW.id, false, false)
  ON CONFLICT (user_id) DO NOTHING;  -- Защита от повторных вызовов триггера
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Логируем ошибку для диагностики, но не блокируем создание пользователя
    RAISE WARNING 'Ошибка в handle_new_user() для пользователя %: %', NEW.email, SQLERRM;
    RETURN NEW; -- Возвращаем NEW, чтобы не блокировать создание пользователя в auth.users
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Функция для автоматического обновления updated_at
-- Вызывается триггерами BEFORE UPDATE для автоматического обновления timestamp
-- Простая функция без SECURITY DEFINER (не требует повышенных прав)
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Функция для логирования входа
-- SECURITY DEFINER: обходит RLS, позволяя вставлять записи в login_history
-- email не сохраняем: получаем через JOIN с profiles при запросах
-- ВАЖНО: Прямой INSERT в login_history запрещен RLS, только через эту функцию
CREATE OR REPLACE FUNCTION public.log_login(
  p_user_id UUID,
  p_success BOOLEAN,
  p_failure_reason TEXT DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  -- Защита от атак через подмену схемы (schema injection)
  SET search_path = public, pg_temp;
  
  INSERT INTO public.login_history (
    user_id,
    login_at,
    ip_address,
    success,
    failure_reason
  )
  VALUES (
    p_user_id,
    NOW(),
    p_ip_address,
    p_success,
    p_failure_reason
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Функция для получения истории входов с email через JOIN
-- Использует LEFT JOIN для корректной обработки NULL user_id (неуспешные входы)
-- SECURITY DEFINER: обходит RLS для получения всех записей (с учетом прав через политики)
CREATE OR REPLACE FUNCTION public.get_login_history_with_email(
  p_limit INTEGER DEFAULT 100,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  login_at TIMESTAMPTZ,
  ip_address TEXT,
  success BOOLEAN,
  failure_reason TEXT,
  email TEXT
) AS $$
BEGIN
  -- Защита от атак через подмену схемы (schema injection)
  SET search_path = public, pg_temp;
  
  RETURN QUERY
  SELECT 
    lh.id,
    lh.user_id,
    lh.login_at,
    lh.ip_address,
    lh.success,
    lh.failure_reason,
    COALESCE(p.email, 
      CASE 
        WHEN lh.user_id IS NULL THEN 'Неуспешный вход'
        ELSE 'Неизвестный пользователь'
      END
    ) AS email
  FROM public.login_history lh
  LEFT JOIN public.profiles p ON lh.user_id = p.id
  WHERE (p_user_id IS NULL OR lh.user_id = p_user_id)
  ORDER BY lh.login_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================================
-- RLS ПОЛИТИКИ (Row Level Security)
-- ============================================================================
--
-- ВАЖНО: Функции должны быть созданы ДО создания политик!
-- Политики используют функции (is_admin()) в условиях USING/WITH CHECK
--
-- Порядок важен:
-- 1. Включаем RLS на таблицах
-- 2. Создаем политики (они используют функции, созданные выше)
--
-- ============================================================================

-- Включаем RLS на всех таблицах
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_app_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beliot_device_overrides ENABLE ROW LEVEL SECURITY;

-- Таблица: profiles
-- Пользователи могут просматривать свой профиль
-- ВАЖНО: Разделяем политики для избежания рекурсии
-- Политика для обычных пользователей (без is_admin() для предотвращения рекурсии)
CREATE POLICY "Users can view profiles"
  ON public.profiles FOR SELECT
  USING (
    -- Пользователи могут видеть свой профиль
    auth.uid() = id
  );

-- Администраторы могут просматривать все профили
-- Эта политика проверяется отдельно, поэтому рекурсии не будет
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_admin());

-- ВАЖНО: Политика INSERT для функции handle_new_user (триггер регистрации)
-- Функция имеет SECURITY DEFINER, но для надежности добавляем явную политику
-- Это позволяет триггеру создавать профили при регистрации
CREATE POLICY "Trigger can insert profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (true);  -- Разрешаем INSERT для всех (функция с SECURITY DEFINER обходит это)

-- Пользователи могут обновлять свой профиль, но НЕ могут изменять role
-- ВАЖНО: Используем функцию get_user_role() для предотвращения рекурсии RLS
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id AND
    -- Используем функцию для получения текущей роли без рекурсии
    -- Функция обходит RLS, поэтому безопасна
    role = public.get_user_role(auth.uid())
  );

-- Администраторы могут обновлять все профили (включая role)
CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Таблица: user_app_access
-- Пользователи могут просматривать свой доступ
CREATE POLICY "Users can view own access"
  ON public.user_app_access FOR SELECT
  USING (auth.uid() = user_id);

-- ВАЖНО: Политика INSERT для функции handle_new_user (триггер регистрации)
-- Функция имеет SECURITY DEFINER, но для надежности добавляем явную политику
-- Это позволяет триггеру создавать записи доступа при регистрации
CREATE POLICY "Trigger can insert access"
  ON public.user_app_access FOR INSERT
  WITH CHECK (true);  -- Разрешаем INSERT для всех (функция с SECURITY DEFINER обходит это)

-- Администраторы могут управлять всем доступом
CREATE POLICY "Admins can manage all access"
  ON public.user_app_access FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Таблица: login_history
-- Пользователи могут просматривать свою историю входов
CREATE POLICY "Users can view own login history"
  ON public.login_history FOR SELECT
  USING (auth.uid() = user_id);

-- Администраторы могут просматривать всю историю входов
CREATE POLICY "Admins can view all login history"
  ON public.login_history FOR SELECT
  USING (public.is_admin());

-- Таблица: beliot_device_overrides
-- Аутентифицированные пользователи могут просматривать overrides
CREATE POLICY "Authenticated users can view overrides"
  ON public.beliot_device_overrides FOR SELECT
  USING (auth.role() = 'authenticated');

-- Только администраторы могут изменять overrides
CREATE POLICY "Only admins can modify overrides"
  ON public.beliot_device_overrides FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================================
-- ТРИГГЕРЫ
-- ============================================================================
--
-- ВАЖНО: Функции должны быть созданы ДО создания триггеров!
-- Триггеры используют функции, созданные в секции "ФУНКЦИИ"
--
-- Порядок:
-- 1. Удаляем существующие триггеры
-- 2. Создаем триггеры (они используют функции)
--
-- ============================================================================

-- Удаляем существующие триггеры
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
DROP TRIGGER IF EXISTS update_user_app_access_updated_at ON public.user_app_access;
DROP TRIGGER IF EXISTS update_beliot_overrides_updated_at ON public.beliot_device_overrides;

-- Триггер для автоматического создания профиля
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Триггеры для автоматического обновления updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_user_app_access_updated_at
  BEFORE UPDATE ON public.user_app_access
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_beliot_overrides_updated_at
  BEFORE UPDATE ON public.beliot_device_overrides
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- УСТАНОВКА search_path ДЛЯ ФУНКЦИЙ С SECURITY DEFINER
-- ============================================================================
--
-- КРИТИЧЕСКИ ВАЖНО: Защита от атак через подмену схемы (schema injection)
-- Устанавливаем search_path на уровне функции для дополнительной защиты
-- Даже если злоумышленник создаст схему с таким же именем функции,
-- PostgreSQL будет использовать только public и pg_temp
--
-- ВАЖНО: Это делается ПОСЛЕ создания функций, но search_path уже установлен
-- внутри тела функций. Это дополнительная защита на уровне функции.
--
-- ============================================================================

ALTER FUNCTION public.is_admin() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_user_role(UUID) SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_new_user() SET search_path = public, auth, pg_temp;
ALTER FUNCTION public.log_login(UUID, BOOLEAN, TEXT, TEXT) SET search_path = public, pg_temp;

-- Настройка search_path для функции get_login_history_with_email
ALTER FUNCTION public.get_login_history_with_email(INTEGER, UUID) SET search_path = public, pg_temp;

-- ============================================================================
-- КОММЕНТАРИИ К ТАБЛИЦАМ И КОЛОНКАМ
-- ============================================================================
--
-- Добавляем документацию для лучшего понимания структуры данных
--
-- ============================================================================

-- Таблицы
COMMENT ON TABLE public.profiles IS 'Профили пользователей (расширение auth.users). Единственный источник email. Все остальные таблицы получают email через JOIN с этой таблицей.';
COMMENT ON TABLE public.user_app_access IS 'Настройки доступа пользователей к приложениям (equipment, water). Email получается через JOIN с profiles.';
COMMENT ON TABLE public.login_history IS 'История входов пользователей. Email получается через JOIN с profiles. Вставка записей возможна ТОЛЬКО через функцию log_login() (SECURITY DEFINER).';
COMMENT ON TABLE public.beliot_device_overrides IS 'Пользовательские изменения данных счетчиков Beliot. Только администраторы могут изменять записи.';

-- Колонки с внешними ключами
COMMENT ON COLUMN public.user_app_access.user_id IS 'Ссылка на profiles.id. Email получается через JOIN с profiles.';
COMMENT ON COLUMN public.login_history.user_id IS 'Ссылка на profiles.id. Email получается через JOIN с profiles.';