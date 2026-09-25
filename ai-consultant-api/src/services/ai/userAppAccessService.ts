/**
 * userAppAccessService.ts
 *
 * Загрузка прав доступа пользователя к разделам (equipment / water).
 *
 * Структура / что умеет:
 * 1. loadUserAppAccess — читает profiles.role + user_app_access
 * 2. Admin всегда получает оба раздела
 */

import { createClient } from '@supabase/supabase-js';
import { config } from '../../config/env.js';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

/** Доступ к приложениям портала. */
export interface UserAppAccess {
  equipment: boolean;
  water: boolean;
  isAdmin: boolean;
}

const DENY_ALL: UserAppAccess = {
  equipment: false,
  water: false,
  isAdmin: false,
};

/**
 * Загрузить доступы пользователя по UUID.
 * При ошибке или отсутствии профиля — оба раздела false.
 */
export async function loadUserAppAccess(userId: string): Promise<UserAppAccess> {
  if (!userId) {
    return { ...DENY_ALL };
  }

  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      console.error('[userAppAccessService] profile error:', profileError.message);
      return { ...DENY_ALL };
    }

    if (profile?.role === 'admin') {
      return { equipment: true, water: true, isAdmin: true };
    }

    const { data: access, error: accessError } = await supabase
      .from('user_app_access')
      .select('equipment, water')
      .eq('user_id', userId)
      .maybeSingle();

    if (accessError) {
      console.error('[userAppAccessService] access error:', accessError.message);
      return { ...DENY_ALL };
    }

    return {
      equipment: access?.equipment === true,
      water: access?.water === true,
      isAdmin: false,
    };
  } catch (error) {
    console.error('[userAppAccessService] unexpected error:', error);
    return { ...DENY_ALL };
  }
}
