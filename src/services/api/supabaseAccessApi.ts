/**
 * supabaseAccessApi.ts
 * 
 * API функции для управления доступом пользователей к приложениям через Supabase
 * Заменяет старый accessApi.ts (Google Sheets)
 */

import { supabase } from '../../config/supabase';
import type { UserAppAccess, UpdateUserAccessData } from '../../types/access';

/**
 * Получить список всех пользователей с их настройками доступа
 * 
 * @returns Promise с массивом настроек доступа пользователей
 */
export async function getAllUserAccess(): Promise<UserAppAccess[]> {
  try {
    // Получаем все записи доступа
    const { data: accessData, error: accessError } = await supabase
      .from('user_app_access')
      .select('user_id, equipment, water, updated_at, updated_by')
      .order('updated_at', { ascending: false });

    if (accessError) {
      console.error('[supabaseAccessApi] Ошибка getAllUserAccess:', accessError);
      throw new Error(accessError.message || 'Ошибка при получении настроек доступа');
    }

    if (!accessData || accessData.length === 0) {
      return [];
    }

    // Получаем все профили пользователей одним запросом
    const userIds = accessData.map(item => item.user_id);
    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('id, email, name')
      .in('id', userIds);

    if (profilesError) {
      console.error('[supabaseAccessApi] Ошибка получения профилей:', profilesError);
      // Продолжаем работу, даже если не удалось получить профили
    }

    // Создаем Map для быстрого поиска профилей по user_id
    const profilesMap = new Map<string, { email: string; name?: string }>();
    if (profilesData) {
      profilesData.forEach(profile => {
        profilesMap.set(profile.id, { email: profile.email, name: profile.name || undefined });
      });
    }

    // Преобразуем данные из Supabase в формат UserAppAccess
    const accessList: UserAppAccess[] = accessData.map((item) => {
      const profile = profilesMap.get(item.user_id);
      return {
        email: profile?.email || '',
        userId: item.user_id,
        name: profile?.name,
        equipment: item.equipment || false,
        water: item.water || false,
        updatedAt: item.updated_at || new Date().toISOString(),
        updatedBy: item.updated_by || undefined,
      };
    });

    return accessList;
  } catch (error: any) {
    console.error('[supabaseAccessApi] Ошибка getAllUserAccess:', error);
    throw error;
  }
}

/**
 * Получить настройки доступа для конкретного пользователя
 * 
 * @param email - Email пользователя
 * @returns Promise с настройками доступа пользователя
 */
export async function getUserAccess(email: string): Promise<UserAppAccess | null> {
  try {
    // Сначала находим пользователя по email в profiles
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, name')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (profileError || !profile) {
      console.log('[supabaseAccessApi] Пользователь не найден:', email);
      return null;
    }

    // Получаем настройки доступа для найденного пользователя
    const { data: access, error: accessError } = await supabase
      .from('user_app_access')
      .select('user_id, equipment, water, updated_at, updated_by')
      .eq('user_id', profile.id)
      .single();

    if (accessError) {
      // Если записи нет, создаем запись по умолчанию
      if (accessError.code === 'PGRST116') {
        console.log('[supabaseAccessApi] Запись доступа не найдена, создаем по умолчанию для:', email);
        const defaultAccess: UserAppAccess = {
          email: profile.email,
          userId: profile.id,
          name: profile.name || undefined,
          equipment: false,
          water: false,
          updatedAt: new Date().toISOString(),
        };
        return defaultAccess;
      }
      console.error('[supabaseAccessApi] Ошибка getUserAccess:', accessError);
      throw new Error(accessError.message || 'Ошибка при получении настроек доступа');
    }

    return {
      email: profile.email,
      userId: profile.id,
      name: profile.name || undefined,
      equipment: access.equipment || false,
      water: access.water || false,
      updatedAt: access.updated_at || new Date().toISOString(),
      updatedBy: access.updated_by || undefined,
    };
  } catch (error: any) {
    console.error('[supabaseAccessApi] Ошибка getUserAccess:', error);
    throw error;
  }
}

/**
 * Обновить настройки доступа для пользователя
 * 
 * @param data - Данные для обновления доступа
 * @returns Promise с обновленными настройками доступа
 */
export async function updateUserAccess(data: UpdateUserAccessData): Promise<UserAppAccess> {
  try {
    // Получаем текущего пользователя для updated_by
    const { data: { user } } = await supabase.auth.getUser();
    const updatedBy = user?.email || undefined;

    // Сначала находим пользователя по email в profiles
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, name')
      .eq('email', data.email.toLowerCase().trim())
      .single();

    if (profileError || !profile) {
      throw new Error('Пользователь не найден');
    }

    // Подготавливаем данные для обновления
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (data.access.equipment !== undefined) {
      updateData.equipment = data.access.equipment;
    }
    if (data.access.water !== undefined) {
      updateData.water = data.access.water;
    }
    if (updatedBy) {
      updateData.updated_by = updatedBy;
    }

    // Обновляем или создаем запись доступа
    const { data: access, error: accessError } = await supabase
      .from('user_app_access')
      .upsert({
        user_id: profile.id,
        ...updateData,
      }, {
        onConflict: 'user_id',
      })
      .select('user_id, equipment, water, updated_at, updated_by')
      .single();

    if (accessError) {
      console.error('[supabaseAccessApi] Ошибка updateUserAccess:', accessError);
      throw new Error(accessError.message || 'Ошибка при обновлении настроек доступа');
    }

    return {
      email: profile.email,
      userId: profile.id,
      name: profile.name || undefined,
      equipment: access.equipment || false,
      water: access.water || false,
      updatedAt: access.updated_at || new Date().toISOString(),
      updatedBy: access.updated_by || undefined,
    };
  } catch (error: any) {
    console.error('[supabaseAccessApi] Ошибка updateUserAccess:', error);
    throw error;
  }
}

/**
 * Проверить, есть ли у пользователя доступ к приложению
 * 
 * ВАЖНО: Администраторы всегда имеют доступ ко всем приложениям,
 * независимо от настроек в таблице user_app_access.
 * 
 * @param email - Email пользователя
 * @param appId - ID приложения
 * @returns Promise с результатом проверки доступа
 */
export async function checkUserAccess(email: string, appId: 'equipment' | 'water'): Promise<boolean> {
  try {
    // Сначала проверяем, является ли пользователь администратором
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (!profileError && profile && profile.role === 'admin') {
      // Администраторы всегда имеют доступ ко всем приложениям
      return true;
    }

    // Для обычных пользователей проверяем настройки доступа
    const access = await getUserAccess(email);
    if (!access) {
      // Если настроек нет, по умолчанию доступ запрещен
      return false;
    }
    
    return access[appId] === true;
  } catch (error: any) {
    console.error('[supabaseAccessApi] Ошибка checkUserAccess:', error);
    // В случае ошибки, по умолчанию доступ запрещен
    return false;
  }
}

