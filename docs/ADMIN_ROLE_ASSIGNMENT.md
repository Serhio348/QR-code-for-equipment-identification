# Назначение роли администратора в Supabase

## 📋 Обзор

В системе используется таблица `profiles` для хранения ролей пользователей. Роль может быть `'admin'` или `'user'`. По умолчанию при регистрации все пользователи получают роль `'user'`.

## 🔐 Безопасность

### RLS Политики

Согласно схеме в `supabase-schema.sql`:

1. **Обычные пользователи НЕ могут изменять свою роль:**
```sql
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id AND
    role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
  );
```
- Пользователь может обновлять свой профиль, но `role` должен оставаться прежним
- Попытка изменить `role` будет отклонена

2. **Только администраторы могут изменять роли:**
```sql
CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
```
- Администраторы могут обновлять любые профили, включая `role`

## 🚀 Способы назначения роли админа

### 1. Первый админ (через SQL в Supabase Dashboard)

**ВАЖНО:** Это нужно сделать один раз для создания первого администратора.

1. Откройте **Supabase Dashboard** → **SQL Editor**
2. Выполните SQL запрос:

```sql
-- Замените 'your-email@example.com' на email первого администратора
UPDATE public.profiles 
SET role = 'admin' 
WHERE email = 'your-email@example.com';
```

3. Проверьте результат:
```sql
SELECT id, email, role 
FROM public.profiles 
WHERE email = 'your-email@example.com';
```

### 2. Через код (требует прав администратора)

#### Создание API функции

Создайте файл `src/services/api/adminApi.ts`:

```typescript
import { supabase } from '../../config/supabase';

/**
 * Обновить роль пользователя
 * 
 * Требует прав администратора
 * 
 * @param userId - UUID пользователя
 * @param role - Новая роль ('admin' | 'user')
 * @returns Обновленный профиль
 */
export async function updateUserRole(
  userId: string,
  role: 'admin' | 'user'
): Promise<{ id: string; email: string; role: string }> {
  try {
    // Проверяем, что текущий пользователь - администратор
    const { data: currentUser } = await supabase.auth.getUser();
    
    if (!currentUser.user) {
      throw new Error('Пользователь не авторизован');
    }

    // Проверяем роль текущего пользователя
    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', currentUser.user.id)
      .single();

    if (currentProfile?.role !== 'admin') {
      throw new Error('Недостаточно прав. Требуется роль администратора.');
    }

    // Обновляем роль пользователя
    const { data, error } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', userId)
      .select('id, email, role')
      .single();

    if (error) {
      throw error;
    }

    return data;
  } catch (error: any) {
    console.error('Ошибка обновления роли:', error);
    throw new Error(error.message || 'Ошибка при обновлении роли');
  }
}

/**
 * Обновить роль пользователя по email
 * 
 * @param email - Email пользователя
 * @param role - Новая роль ('admin' | 'user')
 * @returns Обновленный профиль
 */
export async function updateUserRoleByEmail(
  email: string,
  role: 'admin' | 'user'
): Promise<{ id: string; email: string; role: string }> {
  try {
    // Получаем ID пользователя по email
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single();

    if (!profile) {
      throw new Error('Пользователь не найден');
    }

    return await updateUserRole(profile.id, role);
  } catch (error: any) {
    console.error('Ошибка обновления роли по email:', error);
    throw new Error(error.message || 'Ошибка при обновлении роли');
  }
}

/**
 * Получить список всех пользователей с их ролями
 * 
 * Требует прав администратора
 * 
 * @returns Список пользователей с ролями
 */
export async function getAllUsers(): Promise<Array<{
  id: string;
  email: string;
  name: string | null;
  role: 'admin' | 'user';
  created_at: string;
}>> {
  try {
    // Проверяем, что текущий пользователь - администратор
    const { data: currentUser } = await supabase.auth.getUser();
    
    if (!currentUser.user) {
      throw new Error('Пользователь не авторизован');
    }

    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', currentUser.user.id)
      .single();

    if (currentProfile?.role !== 'admin') {
      throw new Error('Недостаточно прав. Требуется роль администратора.');
    }

    // Получаем всех пользователей
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, name, role, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return data || [];
  } catch (error: any) {
    console.error('Ошибка получения списка пользователей:', error);
    throw new Error(error.message || 'Ошибка при получении списка пользователей');
  }
}
```

#### Использование в компоненте

```typescript
import { updateUserRoleByEmail, getAllUsers } from '../../services/api/adminApi';

// Назначить роль админа
async function makeUserAdmin(email: string) {
  try {
    await updateUserRoleByEmail(email, 'admin');
    console.log('✅ Пользователь назначен администратором');
  } catch (error) {
    console.error('❌ Ошибка:', error);
  }
}

// Убрать роль админа
async function removeAdminRole(email: string) {
  try {
    await updateUserRoleByEmail(email, 'user');
    console.log('✅ Роль администратора удалена');
  } catch (error) {
    console.error('❌ Ошибка:', error);
  }
}

// Получить список всех пользователей
async function loadUsers() {
  try {
    const users = await getAllUsers();
    console.log('Пользователи:', users);
  } catch (error) {
    console.error('❌ Ошибка:', error);
  }
}
```

### 3. Через Supabase Dashboard (Table Editor)

1. Откройте **Supabase Dashboard** → **Table Editor** → **profiles**
2. Найдите пользователя по email
3. Измените значение в колонке `role` на `admin`
4. Сохраните изменения

**⚠️ Внимание:** Этот способ работает только если у вас уже есть хотя бы один администратор или если вы временно отключили RLS.

## 🔍 Проверка роли

### В коде

```typescript
import { supabase } from '../config/supabase';

// Проверить, является ли текущий пользователь администратором
async function checkIfAdmin(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return false;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  return profile?.role === 'admin';
}
```

### В SQL

```sql
-- Проверить роль текущего пользователя
SELECT role 
FROM public.profiles 
WHERE id = auth.uid();

-- Проверить роль по email
SELECT email, role 
FROM public.profiles 
WHERE email = 'user@example.com';

-- Получить всех администраторов
SELECT id, email, name, created_at 
FROM public.profiles 
WHERE role = 'admin';
```

## 📝 Важные замечания

1. **Первый администратор:** Должен быть создан через SQL запрос в Supabase Dashboard
2. **Безопасность:** RLS политики предотвращают изменение роли обычными пользователями
3. **Идемпотентность:** Можно безопасно выполнять обновление роли несколько раз
4. **Аудит:** Рекомендуется добавить логирование изменений ролей в будущем

## 🛠️ Расширение функциональности

В будущем можно добавить:

1. **История изменений ролей:**
```sql
CREATE TABLE role_change_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  old_role TEXT,
  new_role TEXT,
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMPTZ DEFAULT NOW()
);
```

2. **Уведомления:** Отправка email при изменении роли
3. **Временные роли:** Роли с ограниченным сроком действия
4. **Группы ролей:** Более сложная система прав доступа

