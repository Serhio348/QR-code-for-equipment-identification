# Как назначить администратора в Supabase

## Способ 1: Через SQL запрос (рекомендуется)

1. Откройте **Supabase Dashboard** → **SQL Editor**
2. Выполните следующий SQL запрос, заменив `user@example.com` на email пользователя:

```sql
-- Назначить администратора по email
UPDATE public.profiles
SET role = 'admin'
WHERE email = 'user@example.com';
```

3. Проверьте, что роль обновлена:

```sql
-- Проверить роль пользователя
SELECT id, email, name, role, created_at
FROM public.profiles
WHERE email = 'user@example.com';
```

## Способ 2: Назначить администратора по ID пользователя

Если вы знаете UUID пользователя из `auth.users`:

```sql
-- Назначить администратора по ID
UPDATE public.profiles
SET role = 'admin'
WHERE id = 'uuid-пользователя-здесь';
```

## Способ 3: Назначить первого администратора

Если у вас еще нет администраторов, можно назначить первого пользователя:

```sql
-- Назначить первого пользователя администратором
UPDATE public.profiles
SET role = 'admin'
WHERE id = (
  SELECT id FROM public.profiles
  ORDER BY created_at ASC
  LIMIT 1
);
```

## Способ 4: Назначить несколько администраторов

```sql
-- Назначить администраторами несколько пользователей по email
UPDATE public.profiles
SET role = 'admin'
WHERE email IN ('admin1@example.com', 'admin2@example.com');
```

## Проверка списка всех администраторов

```sql
-- Показать всех администраторов
SELECT 
  id,
  email,
  name,
  role,
  created_at,
  last_login_at
FROM public.profiles
WHERE role = 'admin'
ORDER BY created_at ASC;
```

## Важно:

- Роль `admin` дает полный доступ ко всем функциям системы
- Только администраторы могут управлять доступом других пользователей
- Роль можно изменить обратно на `user`:

```sql
-- Убрать права администратора
UPDATE public.profiles
SET role = 'user'
WHERE email = 'user@example.com';
```

