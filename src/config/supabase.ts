/**
 * Конфигурация Supabase клиента
 * 
 * Подключение к Supabase для авторизации и учета воды
 * 
 * Переменные окружения:
 * - VITE_SUPABASE_URL - URL проекта Supabase
 * - VITE_SUPABASE_ANON_KEY - Anon public key из Supabase Dashboard
 * 
 * Получить в Supabase Dashboard: Settings → API
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Проверка наличия переменных окружения
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ Supabase переменные окружения не настроены.');
  console.warn('   Установите VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env.local');
  console.warn('   Получить можно в Supabase Dashboard: Settings → API');
}

// Создаем клиент Supabase
// Если переменные не настроены, используем placeholder значения
// Это позволяет проекту компилироваться, но функции не будут работать
// до настройки переменных окружения
export const supabase: SupabaseClient = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

// Логируем успешную инициализацию, если переменные настроены
if (supabaseUrl && supabaseAnonKey) {
  console.log('✅ Supabase клиент инициализирован');
}

/**
 * Проверка подключения к Supabase
 * 
 * @returns {Promise<boolean>} true если подключение успешно
 */
export async function testSupabaseConnection(): Promise<boolean> {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn('⚠️ Supabase переменные окружения не настроены');
      return false;
    }
    
    // Пробуем выполнить простой запрос
    const { error } = await supabase.from('profiles').select('count').limit(1);
    
    if (error) {
      console.error('❌ Ошибка подключения к Supabase:', error.message);
      return false;
    }
    
    console.log('✅ Подключение к Supabase успешно!');
    return true;
  } catch (error: any) {
    console.error('❌ Ошибка при проверке подключения:', error.message);
    return false;
  }
}

/**
 * Типы для работы с профилями
 */
export interface Profile {
  id: string;
  email: string;
  name: string | null;
  role: 'admin' | 'user';
  created_at: string;
  last_login_at: string | null;
  last_activity_at: string | null;
  updated_at: string;
}

/**
 * Получить профиль текущего пользователя
 * 
 * @returns Профиль пользователя или null если не авторизован
 */
export async function getCurrentProfile(): Promise<Profile | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return null;
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('Ошибка получения профиля:', error);
      return null;
    }

    return profile as Profile;
  } catch (error: any) {
    console.error('Ошибка при получении профиля:', error.message);
    return null;
  }
}

/**
 * Проверить, является ли текущий пользователь администратором
 * 
 * @returns true если пользователь администратор, false в противном случае
 */
export async function isCurrentUserAdmin(): Promise<boolean> {
  try {
    const profile = await getCurrentProfile();
    return profile?.role === 'admin';
  } catch (error: any) {
    console.error('Ошибка при проверке роли администратора:', error.message);
    return false;
  }
}

/**
 * Получить профиль пользователя по ID
 * 
 * @param userId - UUID пользователя
 * @returns Профиль пользователя или null если не найден
 */
export async function getProfileById(userId: string): Promise<Profile | null> {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Ошибка получения профиля:', error);
      return null;
    }

    return profile as Profile;
  } catch (error: any) {
    console.error('Ошибка при получении профиля:', error.message);
    return null;
  }
}

/**
 * Получить профиль пользователя по email
 * 
 * @param email - Email пользователя
 * @returns Профиль пользователя или null если не найден
 */
export async function getProfileByEmail(email: string): Promise<Profile | null> {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', email)
      .single();

    if (error) {
      console.error('Ошибка получения профиля:', error);
      return null;
    }

    return profile as Profile;
  } catch (error: any) {
    console.error('Ошибка при получении профиля:', error.message);
    return null;
  }
}

/**
 * Обновить профиль текущего пользователя
 * 
 * Обычные пользователи могут обновлять только name, но НЕ role
 * Администраторы могут обновлять любые поля
 * 
 * @param updates - Объект с полями для обновления
 * @returns Обновленный профиль
 */
export async function updateCurrentProfile(updates: {
  name?: string;
  role?: 'admin' | 'user';
}): Promise<Profile | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('Пользователь не авторизован');
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return profile as Profile;
  } catch (error: any) {
    console.error('Ошибка обновления профиля:', error);
    throw new Error(error.message || 'Ошибка при обновлении профиля');
  }
}

/**
 * Обновить роль пользователя (только для администраторов)
 * 
 * @param userId - UUID пользователя
 * @param role - Новая роль ('admin' | 'user')
 * @returns Обновленный профиль
 * @throws Error если текущий пользователь не администратор
 */
export async function updateUserRole(
  userId: string,
  role: 'admin' | 'user'
): Promise<Profile> {
  try {
    // Проверяем, что текущий пользователь - администратор
    const isAdmin = await isCurrentUserAdmin();
    
    if (!isAdmin) {
      throw new Error('Недостаточно прав. Требуется роль администратора.');
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', userId)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return profile as Profile;
  } catch (error: any) {
    console.error('Ошибка обновления роли:', error);
    throw new Error(error.message || 'Ошибка при обновлении роли');
  }
}

/**
 * Обновить роль пользователя по email (только для администраторов)
 * 
 * @param email - Email пользователя
 * @param role - Новая роль ('admin' | 'user')
 * @returns Обновленный профиль
 * @throws Error если текущий пользователь не администратор
 */
export async function updateUserRoleByEmail(
  email: string,
  role: 'admin' | 'user'
): Promise<Profile> {
  try {
    // Получаем ID пользователя по email
    const profile = await getProfileByEmail(email);
    
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
 * Получить список всех пользователей (только для администраторов)
 * 
 * @returns Список всех профилей пользователей
 * @throws Error если текущий пользователь не администратор
 */
export async function getAllProfiles(): Promise<Profile[]> {
  try {
    // Проверяем, что текущий пользователь - администратор
    const isAdmin = await isCurrentUserAdmin();
    
    if (!isAdmin) {
      throw new Error('Недостаточно прав. Требуется роль администратора.');
    }

    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return (profiles || []) as Profile[];
  } catch (error: any) {
    console.error('Ошибка получения списка пользователей:', error);
    throw new Error(error.message || 'Ошибка при получении списка пользователей');
  }
}

