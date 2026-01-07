/**
 * supabaseAuthApi.ts
 * 
 * API функции для аутентификации через Supabase Auth
 * Заменяет старый authApi.ts (Google Sheets)
 */

import { supabase, getCurrentProfile } from '../../config/supabase';
import type { RegisterData, LoginData, AuthResponse, User } from '../../types/user';
import type { LoginHistoryEntry, SessionCheckResponse } from '../../types/auth';

/**
 * Логирование входа через RPC функцию log_login
 * 
 * ВАЖНО: IP адрес не получается на клиенте из-за проблем с CORS и зависимостями от внешних сервисов.
 * Если нужен IP для безопасности, используйте Supabase Edge Functions или получайте на бэкенде.
 * 
 * @param userId - UUID пользователя (null для неуспешного входа)
 * @param success - Успешный вход (true) или неуспешный (false)
 * @param failureReason - Причина неуспешного входа (если success = false)
 */
async function logLogin(
  userId: string | null,
  success: boolean,
  failureReason?: string
): Promise<void> {
  try {
    // IP адрес не получаем на клиенте - передаем null
    // Для получения IP используйте Supabase Edge Functions или бэкенд
    const { error } = await supabase.rpc('log_login', {
      p_user_id: userId || null,
      p_success: success,
      p_failure_reason: failureReason || null,
      p_ip_address: null, // IP не получаем на клиенте
    });

    if (error) {
      console.error('Ошибка логирования входа:', error);
      // Не пробрасываем ошибку, чтобы не блокировать основной процесс
    }
  } catch (error) {
    console.error('Ошибка при логировании входа:', error);
    // Не пробрасываем ошибку, чтобы не блокировать основной процесс
  }
}

/**
 * Регистрация нового пользователя
 * 
 * @param data - Данные для регистрации (email, password, name)
 * @returns Promise с ответом сервера
 */
export async function register(data: RegisterData): Promise<AuthResponse> {
  try {
    console.log('📤 Регистрация пользователя:', { email: data.email });

    // 1. Создаем пользователя в Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          name: data.name || '',
        },
      },
    });

    if (authError) {
      console.error('❌ Ошибка регистрации:', authError.message);
      // Логируем неуспешную регистрацию
      await logLogin(null, false, authError.message);
      throw new Error(authError.message || 'Ошибка при регистрации');
    }

    if (!authData.user) {
      console.error('❌ Пользователь не создан');
      await logLogin(null, false, 'Не удалось создать пользователя');
      throw new Error('Не удалось создать пользователя');
    }

    // 2. Профиль создается автоматически через триггер handle_new_user
    // Ждем немного, чтобы триггер успел выполниться
    await new Promise(resolve => setTimeout(resolve, 500));

    // 3. Получаем профиль пользователя
    let profile;
    let retries = 3;
    while (retries > 0) {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authData.user.id)
        .single();

      if (!profileError && profileData) {
        profile = profileData;
        break;
      }

      retries--;
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        console.warn('⚠️ Профиль не найден после регистрации, используем данные из auth');
      }
    }

    // 4. Логируем успешную регистрацию
    await logLogin(authData.user.id, true);

    // 5. Формируем объект User
    const user: User = {
      id: authData.user.id,
      email: authData.user.email!,
      name: profile?.name || data.name || undefined,
      role: (profile?.role as 'admin' | 'user') || 'user',
      createdAt: profile?.created_at || authData.user.created_at || new Date().toISOString(),
    };

    // 6. Получаем сессию (если email подтвержден автоматически)
    const { data: sessionData } = await supabase.auth.getSession();

    console.log('✅ Регистрация успешна:', user.email);

    return {
      user,
      sessionToken: sessionData?.session?.access_token || '',
      expiresAt: sessionData?.session?.expires_at
        ? new Date(sessionData.session.expires_at * 1000).toISOString()
        : new Date(Date.now() + 3600000).toISOString(),
      message: 'Регистрация успешна',
    };
  } catch (error: any) {
    console.error('❌ Ошибка регистрации:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(error?.message || 'Ошибка при регистрации');
  }
}

/**
 * Вход пользователя
 * 
 * @param data - Данные для входа (email, password)
 * @returns Promise с ответом сервера
 */
export async function login(data: LoginData): Promise<AuthResponse> {
  try {
    console.log('📤 Вход пользователя:', { email: data.email });

    // 1. Входим через Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (authError) {
      console.error('❌ Ошибка входа:', authError.message);
      // Логируем неуспешный вход
      await logLogin(null, false, authError.message);
      
      // Преобразуем ошибки Supabase в более понятные сообщения
      let errorMessage = 'Неверный email или пароль';
      if (authError.message.includes('Invalid login credentials')) {
        errorMessage = 'Неверный email или пароль';
      } else if (authError.message.includes('Email not confirmed')) {
        errorMessage = 'Email не подтвержден. Проверьте почту и подтвердите регистрацию.';
      } else if (authError.message.includes('User not found')) {
        errorMessage = 'Пользователь не найден';
      } else {
        errorMessage = authError.message || 'Ошибка при входе';
      }
      
      throw new Error(errorMessage);
    }

    if (!authData.user) {
      console.error('❌ Пользователь не найден');
      await logLogin(null, false, 'Пользователь не найден');
      throw new Error('Не удалось войти');
    }

    // 2. Логируем успешный вход
    await logLogin(authData.user.id, true);

    // 3. Обновляем last_login_at в профиле
    await supabase
      .from('profiles')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', authData.user.id);

    // 4. Получаем профиль пользователя
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (profileError) {
      console.error('⚠️ Ошибка получения профиля:', profileError);
      // Продолжаем работу, используя данные из auth
    }

    // 5. Формируем объект User
    const user: User = {
      id: authData.user.id,
      email: authData.user.email!,
      name: profile?.name || undefined,
      role: (profile?.role as 'admin' | 'user') || 'user',
      createdAt: profile?.created_at || authData.user.created_at || new Date().toISOString(),
      lastLoginAt: profile?.last_login_at || undefined,
    };

    // 6. Получаем сессию
    const { data: sessionData } = await supabase.auth.getSession();

    console.log('✅ Вход выполнен успешно:', user.email);

    return {
      user,
      sessionToken: sessionData?.session?.access_token || '',
      expiresAt: sessionData?.session?.expires_at
        ? new Date(sessionData.session.expires_at * 1000).toISOString()
        : new Date(Date.now() + 3600000).toISOString(),
      message: 'Вход выполнен успешно',
    };
  } catch (error: any) {
    console.error('❌ Ошибка входа:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(error?.message || 'Ошибка при входе');
  }
}

/**
 * Выход пользователя
 * 
 * @returns Promise<void>
 */
export async function logout(): Promise<void> {
  try {
    console.log('📤 Выход пользователя');
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('❌ Ошибка выхода:', error);
      throw error;
    }
    console.log('✅ Выход выполнен успешно');
  } catch (error) {
    console.error('❌ Ошибка выхода:', error);
    // Пробрасываем ошибку, но не блокируем выход
    throw error;
  }
}

/**
 * Проверка активности сессии с попыткой восстановления через refresh token
 * 
 * Если сессия истекла, но refresh token еще действителен, пытается восстановить сессию.
 * Это улучшает UX - пользователь не будет разлогинен, если refresh token еще валиден.
 * 
 * @returns Promise с информацией о сессии
 */
export async function checkSession(): Promise<SessionCheckResponse> {
  try {
    // Добавляем таймаут для предотвращения зависания
    const timeoutPromise = new Promise<SessionCheckResponse>((resolve) => {
      setTimeout(() => {
        // Используем debug вместо warn, чтобы не засорять консоль
        console.debug('⚠️ Таймаут проверки сессии (3 секунды)');
        resolve({
          active: false,
          message: 'Таймаут проверки сессии',
        });
      }, 3000);
    });

    const sessionPromise = (async () => {
      // Шаг 1: Получаем текущую сессию
      const { data: { session }, error } = await supabase.auth.getSession();

      // Шаг 2: Если сессии нет или ошибка, пытаемся восстановить через refresh token
      if (error || !session) {
        console.debug('🔐 Сессия не найдена, пытаемся восстановить через refresh token...');
        
        try {
          // Пытаемся обновить сессию через refresh token
          const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
          
          if (refreshError || !refreshData.session) {
            return {
              active: false,
              message: 'Сессия не найдена и не может быть восстановлена',
            };
          }

          // Сессия успешно восстановлена
          const refreshedSession = refreshData.session;
          const expiresAt = refreshedSession.expires_at ? refreshedSession.expires_at * 1000 : Date.now() + 3600000;
          const now = Date.now();
          const remainingTime = expiresAt - now;

          console.debug('✅ Сессия успешно восстановлена через refresh token');
          
          return {
            active: true,
            remainingTime,
            message: 'Сессия восстановлена',
          };
        } catch (refreshError) {
          console.debug('⚠️ Не удалось восстановить сессию:', refreshError);
          return {
            active: false,
            message: 'Сессия не найдена',
          };
        }
      }

      // Шаг 3: Проверяем, не истекла ли текущая сессия
      const expiresAt = session.expires_at ? session.expires_at * 1000 : Date.now() + 3600000;
      const now = Date.now();
      const remainingTime = expiresAt - now;

      // Шаг 4: Если сессия истекла, но еще не слишком давно, пытаемся обновить
      if (remainingTime <= 0) {
        console.debug('🔐 Сессия истекла, пытаемся обновить через refresh token...');
        
        try {
          const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
          
          if (refreshError || !refreshData.session) {
            return {
              active: false,
              message: 'Сессия истекла и не может быть восстановлена',
            };
          }

          // Сессия успешно обновлена
          const refreshedSession = refreshData.session;
          const newExpiresAt = refreshedSession.expires_at ? refreshedSession.expires_at * 1000 : Date.now() + 3600000;
          const newRemainingTime = newExpiresAt - now;

          console.debug('✅ Сессия успешно обновлена через refresh token');
          
          return {
            active: true,
            remainingTime: newRemainingTime,
            message: 'Сессия обновлена',
          };
        } catch (refreshError) {
          console.debug('⚠️ Не удалось обновить сессию:', refreshError);
          return {
            active: false,
            message: 'Сессия истекла',
          };
        }
      }

      // Шаг 5: Сессия активна и не истекла
      return {
        active: true,
        remainingTime,
        message: 'Сессия активна',
      };
    })();

    return await Promise.race([sessionPromise, timeoutPromise]);
  } catch (error: any) {
    console.error('Ошибка проверки сессии:', error);
    return {
      active: false,
      message: 'Ошибка при проверке сессии',
    };
  }
}

/**
 * Получение текущего пользователя
 * 
 * ВАЖНО: Использует getCurrentProfile() как единственный источник истины для получения профиля.
 * Это устраняет дублирование логики и обеспечивает единообразную обработку таймаутов и ошибок.
 * 
 * @returns Promise с данными пользователя или null
 */
export async function getCurrentUser(): Promise<User | null> {
  try {
    // Используем getCurrentProfile() как единственный источник истины
    // Это устраняет дублирование логики получения профиля
    const profile = await getCurrentProfile();

    if (!profile) {
      return null;
    }

    // Преобразуем Profile в User формат
    return {
      id: profile.id,
      email: profile.email,
      name: profile.name || undefined,
      role: profile.role,
      createdAt: profile.created_at,
      lastLoginAt: profile.last_login_at || undefined,
      lastActivityAt: profile.last_activity_at || undefined,
    };
  } catch (error: any) {
    console.error('Ошибка получения текущего пользователя:', error);
    return null;
  }
}

/**
 * Проверка прав администратора
 * 
 * @returns Promise с информацией о правах
 */
export async function verifyAdmin(): Promise<{
  isAdmin: boolean;
  role: 'admin' | 'user';
  email: string;
}> {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return {
        isAdmin: false,
        role: 'user',
        email: '',
      };
    }

    return {
      isAdmin: user.role === 'admin',
      role: user.role,
      email: user.email,
    };
  } catch (error: any) {
    console.error('Ошибка проверки прав администратора:', error);
    return {
      isAdmin: false,
      role: 'user',
      email: '',
    };
  }
}

/**
 * Получение истории входов
 * 
 * ВАЖНО: Использует RPC функцию get_login_history_with_email для получения истории с email.
 * RPC функция выполняет LEFT JOIN на стороне сервера, что более эффективно и надежно.
 * 
 * @param limit - Максимальное количество записей (по умолчанию 100)
 * @returns Promise с историей входов
 */
export async function getLoginHistory(limit: number = 100): Promise<LoginHistoryEntry[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return [];
    }

    // Используем RPC функцию для получения истории с email через JOIN на сервере
    const { data, error } = await supabase.rpc('get_login_history_with_email', {
      p_limit: limit,
      p_user_id: null, // null = все записи (админы видят все, обычные пользователи - только свои через RLS)
    });

    if (error) {
      console.error('Ошибка получения истории входов:', error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Преобразуем данные из RPC функции в формат LoginHistoryEntry
    return data.map((entry: any) => ({
      id: entry.id,
      email: entry.email || 'Неизвестный пользователь',
      loginAt: entry.login_at,
      ipAddress: entry.ip_address || undefined,
      success: entry.success,
      failureReason: entry.failure_reason || undefined,
    }));
  } catch (error: any) {
    console.error('Ошибка получения истории входов:', error);
    return [];
  }
}

