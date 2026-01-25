/**
 * Конфигурация Supabase клиента
 * 
 * Подключение к Supabase для авторизации и учета воды
 * 
 * Переменные окружения:
 * - VITE_SUPABASE_URL - URL проекта Supabase
 * - VITE_SUPABASE_ANON_KEY - Anon public key из Supabase Dashboard
 * - VITE_SUPABASE_SERVICE_ROLE_KEY - Service Role key (опционально, только для админских операций)
 * 
 * Получить в Supabase Dashboard: Settings → API
 * 
 * ВАЖНО: Service Role key имеет полный доступ к базе данных и обходит RLS политики.
 * Используйте только для админских операций на сервере или в защищенных функциях.
 * НИКОГДА не используйте в клиентском коде, доступном пользователям!
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
// ВАЖНО: Service Role key НЕ должен быть в клиентском коде!
// Он используется только на сервере (GitHub Actions, Railway cron jobs)
// const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY; // УДАЛЕНО из клиентского кода

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
      storageKey: 'sb-auth-token', // Единый ключ для хранения токенов (предотвращает множественные экземпляры)
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      // Настройки для более длительных сессий
      // ВАЖНО: Также нужно настроить в Supabase Dashboard:
      // Authentication → Settings → JWT expiry: увеличить до нужного значения (например, 28800 секунд = 8 часов)
      // Authentication → Settings → Session timeout: установить в 0 (без ограничения) или большое значение
      // Обработка ошибок refresh token
      flowType: 'pkce', // Используем PKCE flow для лучшей безопасности
    },
    global: {
      // Обработка ошибок на глобальном уровне
      headers: {
        'X-Client-Info': 'equipment-management-web',
      },
    },
  }
);

// Очистка невалидных токенов при инициализации (если есть старые токены)
// Выполняется после создания клиента
if (typeof window !== 'undefined') {
  // Проверяем наличие старых токенов и очищаем их при старте
  const checkAndCleanTokens = async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      // Очищаем старые токены от других проектов Supabase
      // Ищем все ключи, начинающиеся с 'sb-' и заканчивающиеся на '-auth-token'
      // кроме текущего проекта (sb-auth-token)
      const allKeys = Object.keys(localStorage);
      const oldSupabaseKeys = allKeys.filter(key => 
        key.startsWith('sb-') && 
        key.endsWith('-auth-token') && 
        key !== 'sb-auth-token'
      );
      
      if (oldSupabaseKeys.length > 0) {
        console.debug('🧹 Очищаем старые токены от других проектов Supabase:', oldSupabaseKeys);
        oldSupabaseKeys.forEach(key => localStorage.removeItem(key));
      }
      
      // Если есть ошибка или сессии нет, но токены есть в localStorage - очищаем их
      if (error || !session) {
        const hasTokens = localStorage.getItem('sb-auth-token') || 
                         localStorage.getItem('sb-auth-token.0') || 
                         localStorage.getItem('sb-auth-token.1');
        if (hasTokens) {
          console.debug('🔐 Обнаружены невалидные токены, очищаем...');
          localStorage.removeItem('sb-auth-token');
          localStorage.removeItem('sb-auth-token.0');
          localStorage.removeItem('sb-auth-token.1');
          localStorage.removeItem('user_session');
        }
      }
    } catch (error) {
      // Игнорируем ошибки при проверке
      console.debug('⚠️ Ошибка проверки токенов (не критично):', error);
    }
  };
  
  // Запускаем проверку после небольшой задержки, чтобы supabase успел инициализироваться
  setTimeout(checkAndCleanTokens, 500);
}

// Логируем успешную инициализацию, если переменные настроены
if (supabaseUrl && supabaseAnonKey) {
  console.log('✅ Supabase клиент инициализирован');
}

/**
 * Service Role клиент для админских операций
 * 
 * ВАЖНО: Этот клиент УДАЛЕН из клиентского кода по соображениям безопасности!
 * 
 * Service Role key НЕ должен быть в клиентском коде, так как:
 * - Он обходит все RLS политики
 * - Имеет полный доступ к базе данных
 * - Может быть раскрыт в браузерном коде
 * 
 * Если нужны админские операции:
 * 1. Используйте Supabase Edge Functions (рекомендуется)
 * 2. Или создайте собственный backend API с проверкой прав
 * 3. Или используйте RLS политики с проверкой роли через is_admin()
 * 
 * Service Role key должен использоваться ТОЛЬКО:
 * - На сервере (GitHub Actions, Railway cron jobs)
 * - В Supabase Edge Functions
 * - В защищенном backend API
 */
// export const supabaseAdmin - УДАЛЕНО из клиентского кода

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
 * Кеш профиля пользователя
 * Инвалидируется при изменении пользователя или через TTL
 */
let profileCache: {
  profile: Profile | null;
  userId: string | null;
  timestamp: number;
} | null = null;

const PROFILE_CACHE_TTL = 60000; // 1 минута

/**
 * Инвалидировать кеш профиля
 * Вызывается при выходе пользователя или изменении сессии
 */
export function invalidateProfileCache(): void {
  profileCache = null;
}

/**
 * Получить профиль текущего пользователя
 * 
 * Оптимизированная версия с кешированием:
 * - Использует getSession() вместо getUser() для быстрой проверки сессии
 * - Кеширует результат на время сессии (TTL: 1 минута)
 * - Убраны лишние таймауты, которые срабатывали даже при успешных запросах
 * 
 * @returns Профиль пользователя или null если не авторизован
 */
export async function getCurrentProfile(): Promise<Profile | null> {
  try {
    // Используем getSession() вместо getUser() - быстрее, не делает запрос к серверу
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session?.user) {
      // Если сессии нет, очищаем кеш
      profileCache = null;
      return null;
    }

    const userId = session.user.id;

    // Проверяем кеш перед запросом
    if (profileCache) {
      // Если кеш для того же пользователя и не истек
      if (profileCache.userId === userId && 
          Date.now() - profileCache.timestamp < PROFILE_CACHE_TTL) {
        return profileCache.profile;
      }
      // Если пользователь изменился, очищаем кеш
      if (profileCache.userId !== userId) {
        profileCache = null;
      }
    }

    // Получаем профиль из базы данных с таймаутом, чтобы не зависнуть
    const profilePromise = supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) => {
      setTimeout(() => {
        resolve({ data: null, error: { message: 'Таймаут запроса профиля (3 секунды)' } });
      }, 3000);
    });

    const { data: profile, error: profileError } = await Promise.race([
      profilePromise,
      timeoutPromise
    ]);

    if (profileError) {
      console.error('Ошибка получения профиля:', profileError);
      // НЕ кешируем null при ошибке, чтобы можно было повторить попытку
      // Особенно важно при SIGNED_IN, когда профиль может создаваться с задержкой
      return null;
    }

    if (!profile) {
      // НЕ кешируем null, чтобы можно было повторить попытку
      // Особенно важно при SIGNED_IN, когда профиль может создаваться с задержкой
      return null;
    }

    // Сохраняем в кеш
    profileCache = {
      profile: profile as Profile,
      userId,
      timestamp: Date.now(),
    };

    return profile as Profile;
  } catch (error: any) {
    console.error('Ошибка при получении профиля:', error.message);
    return null;
  }
}

/**
 * Проверить, является ли текущий пользователь администратором
 * 
 * Оптимизированная версия: использует SQL функцию is_admin() через RPC
 * для быстрой проверки без получения всего профиля.
 * 
 * @returns true если пользователь администратор, false в противном случае
 */
export async function isCurrentUserAdmin(): Promise<boolean> {
  try {
    // Используем SQL функцию is_admin() через RPC - быстрее и эффективнее
    const { data, error } = await supabase.rpc('is_admin');
    
    if (error) {
      // Если RPC вызов не удался, используем fallback на getCurrentProfile
      console.debug('⚠️ RPC is_admin() не удался, используем fallback:', error.message);
      const profile = await getCurrentProfile();
      return profile?.role === 'admin';
    }
    
    // SQL функция возвращает boolean напрямую
    return data === true;
  } catch (error: any) {
    // В случае любой ошибки используем fallback
    console.debug('⚠️ Ошибка при проверке роли администратора, используем fallback:', error.message);
    try {
      const profile = await getCurrentProfile();
      return profile?.role === 'admin';
    } catch (fallbackError) {
      console.error('Ошибка при fallback проверке роли администратора:', fallbackError);
      return false;
    }
  }
}

/**
 * Получить профиль пользователя по ID
 * 
 * ВАЖНО: В настоящее время не используется в UI.
 * Предназначено для будущей админ-панели управления пользователями.
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
 * ВАЖНО: Используется внутри updateUserRoleByEmail().
 * Может быть полезно для будущей админ-панели управления пользователями.
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
 * ВАЖНО: Пользователи могут обновлять ТОЛЬКО name.
 * Роль НЕ может быть изменена через эту функцию (используйте updateUserRole для администраторов).
 * 
 * КРИТИЧНО: Явно удаляем поле role из обновлений для предотвращения попыток изменения роли.
 * 
 * @param updates - Объект с полями для обновления (только name)
 * @returns Обновленный профиль
 */
export async function updateCurrentProfile(updates: {
  name?: string;
}): Promise<Profile | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('Пользователь не авторизован');
    }

    // КРИТИЧНО: Явно удаляем role если кто-то попытался его передать
    // Используем деструктуризацию для безопасного удаления
    const { role, ...safeUpdates } = updates as any;
    
    // Если кто-то попытался передать role, логируем предупреждение
    if (role !== undefined) {
      console.warn('⚠️ Попытка изменить роль через updateCurrentProfile() заблокирована. Используйте updateUserRole() для администраторов.');
    }

    // Если нет полей для обновления, возвращаем текущий профиль
    if (Object.keys(safeUpdates).length === 0) {
      return await getCurrentProfile();
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .update(safeUpdates)
      .eq('id', user.id)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    // Инвалидируем кеш после обновления профиля
    invalidateProfileCache();

    return profile as Profile;
  } catch (error: any) {
    console.error('Ошибка обновления профиля:', error);
    throw new Error(error.message || 'Ошибка при обновлении профиля');
  }
}

/**
 * Обновить роль пользователя (только для администраторов)
 * 
 * ВАЖНО: В настоящее время не используется в UI.
 * Используется внутри updateUserRoleByEmail().
 * Предназначено для будущей админ-панели управления пользователями.
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

      // Инвалидируем кэш прав администратора для обновленного пользователя
      // Используем динамический импорт, чтобы избежать циклических зависимостей
      // (supabaseAuthApi импортирует из config/supabase, поэтому прямой импорт создаст цикл)
      try {
        const { invalidateAdminCache } = await import('../services/api/supabaseAuthApi');
        invalidateAdminCache(userId);
      } catch (cacheError) {
        // Игнорируем ошибки инвалидации кэша, чтобы не блокировать обновление роли
        console.debug('⚠️ Не удалось инвалидировать кэш прав администратора:', cacheError);
      }

      // Инвалидируем кеш профиля после обновления роли
      invalidateProfileCache();

      return profile as Profile;
  } catch (error: any) {
    console.error('Ошибка обновления роли:', error);
    throw new Error(error.message || 'Ошибка при обновлении роли');
  }
}

/**
 * Обновить роль пользователя по email (только для администраторов)
 * 
 * ВАЖНО: В настоящее время не используется в UI.
 * Предназначено для будущей админ-панели управления пользователями.
 * Используется для назначения/снятия роли администратора через SQL (см. docs/ASSIGN_ADMIN.md).
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
 * ВАЖНО: В настоящее время не используется в UI.
 * Предназначено для будущей админ-панели управления пользователями.
 * Может быть полезно для отображения списка всех пользователей с их ролями.
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

