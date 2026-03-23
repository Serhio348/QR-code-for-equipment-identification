/**
 * supabaseAuthApi.ts
 * 
 * API функции для аутентификации через Supabase Auth
 * Заменяет старый authApi.ts (Google Sheets)
 */

import { supabase, getCurrentProfile, type Profile } from '@/shared/config/supabase';
import type { RegisterData, LoginData, AuthResponse, User } from '../types/user';
import type { LoginHistoryEntry, SessionCheckResponse } from '../types/auth';
import { logUserActivity } from '@/features/user-activity/services/activityLogsApi';

/**
 * Кэш для проверки прав администратора
 * 
 * Структура: Map<userId, { data: результат проверки, timestamp: время создания }>
 */
const adminCache = new Map<string, { 
  data: { isAdmin: boolean; role: 'admin' | 'user'; email: string }; 
  timestamp: number;
}>();

/**
 * Время жизни кэша в миллисекундах (30 секунд)
 */
const CACHE_TTL = 30000;

/**
 * Кэш для проверки сессии
 * 
 * Структура: { result: результат проверки, timestamp: время создания }
 */
let lastSessionCheck: { 
  result: SessionCheckResponse; 
  timestamp: number;
} | null = null;

/**
 * Время жизни кэша проверки сессии в миллисекундах (10 секунд)
 */
const SESSION_CHECK_CACHE_TTL = 10000;

/**
 * Получить refresh token из localStorage (если есть).
 * Нужен для безопасного вызова refreshSession().
 */
function getStoredRefreshToken(): string | null {
  try {
    const raw = localStorage.getItem('sb-auth-token');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const token = parsed?.refresh_token;
    return typeof token === 'string' && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

/**
 * Инвалидация кэша проверки сессии
 * 
 * Используется при выходе пользователя или изменении сессии.
 */
export function invalidateSessionCache(): void {
  lastSessionCheck = null;
}

/**
 * Инвалидация кэша для конкретного пользователя
 * 
 * Используется при изменении роли пользователя для немедленного обновления кэша.
 * 
 * @param userId - UUID пользователя (опционально, если не указан - очищает весь кэш)
 */
export function invalidateAdminCache(userId?: string): void {
  if (userId) {
    adminCache.delete(userId);
  } else {
    adminCache.clear();
  }
}

/**
 * Ожидание создания профиля пользователя с экспоненциальной backoff стратегией
 * 
 * Используется после регистрации, когда профиль создается через триггер.
 * Экспоненциальная backoff уменьшает нагрузку на базу данных и улучшает производительность.
 * 
 * @param userId - UUID пользователя
 * @param maxRetries - Максимальное количество попыток (по умолчанию 3)
 * @param initialDelay - Начальная задержка в миллисекундах (по умолчанию 500ms)
 * @returns Профиль пользователя или null, если не найден после всех попыток
 */
async function waitForProfile(
  userId: string,
  maxRetries: number = 3,
  initialDelay: number = 500
): Promise<Profile | null> {
  for (let i = 0; i < maxRetries; i++) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (!error && data) {
      return data;
    }
    
    // Экспоненциальная backoff: 500ms, 1000ms, 2000ms
    // Не ждем после последней попытки
    if (i < maxRetries - 1) {
      const delay = initialDelay * Math.pow(2, i);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return null;
}

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
    // ВАЖНО: Порядок параметров должен соответствовать определению функции в SQL
    // Функция: log_login(p_success BOOLEAN, p_user_id UUID DEFAULT NULL, p_failure_reason TEXT DEFAULT NULL, p_ip_address TEXT DEFAULT NULL)
    // Первый параметр обязательный, остальные с DEFAULT
    // Передаем ВСЕ параметры явно (даже NULL), чтобы PostgreSQL мог однозначно определить функцию
    const { error } = await supabase.rpc('log_login', {
      p_success: success, // Обязательный параметр (первый)
      p_user_id: userId || null, // Второй параметр
      p_failure_reason: failureReason || null, // Третий параметр
      p_ip_address: null, // Четвертый параметр (IP не получаем на клиенте)
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
/**
 * Очистить старую сессию из localStorage, если она есть
 * Используется для очистки старых сессий с коротким expiresAt
 */
function clearOldSessionIfNeeded(): void {
  try {
    const sessionData = localStorage.getItem('user_session');
    if (sessionData) {
      const session = JSON.parse(sessionData);
      if (session.expiresAt) {
        const expiresAt = new Date(session.expiresAt);
        const now = new Date();
        // Если expiresAt истек более чем на 1 час, очищаем сессию
        // Это помогает избавиться от старых сессий с коротким expiresAt
        if (now.getTime() - expiresAt.getTime() > 3600000) {
          console.debug('🧹 Очищаем старую сессию с истекшим expiresAt');
          localStorage.removeItem('user_session');
        }
      }
    }
  } catch (error) {
    // Игнорируем ошибки при очистке
    console.debug('⚠️ Ошибка при очистке старой сессии (не критично):', error);
  }
}

export async function register(data: RegisterData): Promise<AuthResponse> {
  try {
    // Очищаем старую сессию перед регистрацией
    clearOldSessionIfNeeded();
    
    const normalizedEmail = data.email.trim().toLowerCase();
    console.debug('📤 Регистрация пользователя:', { email: normalizedEmail });

    // 1. Создаем пользователя в Supabase Auth (обязательная операция, должна быть первой)
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password: data.password,
      options: {
        data: {
          name: data.name || '',
        },
      },
    });

    if (authError) {
      console.error('❌ Ошибка регистрации:', authError.message);
      // Логируем неуспешную регистрацию (неблокирующая операция)
      logLogin(null, false, authError.message).catch(() => {});
      throw new Error(authError.message || 'Ошибка при регистрации');
    }

    if (!authData.user) {
      console.error('❌ Пользователь не создан');
      logLogin(null, false, 'Не удалось создать пользователя').catch(() => {});
      throw new Error('Не удалось создать пользователя');
    }

    // 2. Параллельно выполняем операции, которые не зависят друг от друга:
    //    - Ожидание профиля (создается через триггер)
    //    - Логирование успешной регистрации (неблокирующая)
    //    - Получение сессии
    const [profile, , sessionResult] = await Promise.allSettled([
      // Ожидание профиля с экспоненциальной backoff стратегией
      waitForProfile(authData.user.id),
      // Логирование успешной регистрации (неблокирующая операция)
      logLogin(authData.user.id, true),
      // Получение сессии
      supabase.auth.getSession(),
    ]);

    // Обрабатываем результат ожидания профиля
    const profileData = profile.status === 'fulfilled' ? profile.value : null;
    if (!profileData) {
      console.warn('⚠️ Профиль не найден после регистрации, используем данные из auth');
    }

    // Обрабатываем результат получения сессии
    const sessionData = sessionResult.status === 'fulfilled' 
      ? sessionResult.value.data 
      : null;

    // 3. Формируем объект User
    const user: User = {
      id: authData.user.id,
      email: authData.user.email!,
      name: profileData?.name || data.name || undefined,
      role: (profileData?.role as 'admin' | 'user') || 'user',
      createdAt: profileData?.created_at || authData.user.created_at || new Date().toISOString(),
    };

    console.debug('✅ Регистрация успешна:', user.email);

    // Логируем успешную регистрацию
    logUserActivity('user_register', 'Регистрация нового пользователя', {
      entityType: 'user',
      metadata: {
        userEmail: user.email,
        userName: user.name,
      },
    }).catch(() => {});

    return {
      user,
      sessionToken: sessionData?.session?.access_token || '',
      expiresAt: sessionData?.session?.expires_at
        ? new Date(sessionData.session.expires_at * 1000).toISOString()
        : new Date(Date.now() + (8 * 60 * 60 * 1000)).toISOString(), // 8 часов вместо 1 часа
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
    // Очищаем старую сессию перед входом
    clearOldSessionIfNeeded();
    
    const normalizedEmail = data.email.trim().toLowerCase();
    console.debug('📤 Вход пользователя:', { email: normalizedEmail });

    // 1. Входим через Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
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
        errorMessage = 'Email не подтверждён. Проверьте почту и подтвердите регистрацию.';
      } else if (authError.message.includes('Too many requests')) {
        errorMessage = 'Слишком много попыток входа. Попробуйте позже.';
      } else if (authError.message.includes('User not found')) {
        errorMessage = 'Пользователь не найден';
      } else {
        errorMessage = authError.message || 'Ошибка при входе';
      }
      
      throw new Error(errorMessage);
    }

    if (!authData.user) {
      console.error('❌ Пользователь не найден');
      logLogin(null, false, 'Пользователь не найден').catch(() => {});
      throw new Error('Не удалось войти');
    }

    // 2. Параллельно выполняем операции, которые не зависят друг от друга:
    //    - Логирование успешного входа (неблокирующая)
    //    - Обновление last_login_at в профиле (неблокирующая)
    //    - Получение профиля пользователя
    //    - Получение сессии
    const [logResult, updateResult, profileResult, sessionResult] = await Promise.allSettled([
      // Логирование успешного входа (неблокирующая операция)
      logLogin(authData.user.id, true),
      // Обновление last_login_at в профиле (неблокирующая операция)
      supabase
        .from('profiles')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', authData.user.id),
      // Получение профиля пользователя
      supabase
        .from('profiles')
        .select('*')
        .eq('id', authData.user.id)
        .single(),
      // Получение сессии
      supabase.auth.getSession(),
    ]);

    // Обрабатываем ошибки логирования и обновления (не критичные)
    if (logResult.status === 'rejected') {
      console.debug('⚠️ Ошибка логирования входа (не критично):', logResult.reason);
    }
    if (updateResult.status === 'rejected' || 
        (updateResult.status === 'fulfilled' && updateResult.value.error)) {
      console.debug('⚠️ Ошибка обновления last_login_at (не критично):', 
        updateResult.status === 'fulfilled' 
          ? updateResult.value.error 
          : updateResult.reason
      );
    }

    // Обрабатываем результат получения профиля
    const profile = profileResult.status === 'fulfilled' && !profileResult.value.error
      ? profileResult.value.data
      : null;

    if (profileResult.status === 'rejected' || (profileResult.status === 'fulfilled' && profileResult.value.error)) {
      console.error('⚠️ Ошибка получения профиля:', 
        profileResult.status === 'fulfilled' 
          ? profileResult.value.error 
          : profileResult.reason
      );
      // Продолжаем работу, используя данные из auth
    }

    // Обрабатываем результат получения сессии
    const sessionData = sessionResult.status === 'fulfilled'
      ? sessionResult.value.data
      : null;

    // 3. Формируем объект User
    const user: User = {
      id: authData.user.id,
      email: authData.user.email!,
      name: profile?.name || undefined,
      role: (profile?.role as 'admin' | 'user') || 'user',
      createdAt: profile?.created_at || authData.user.created_at || new Date().toISOString(),
      lastLoginAt: profile?.last_login_at || undefined,
    };

    console.debug('✅ Вход выполнен успешно:', user.email);

    // Логируем успешный вход
    logUserActivity('login', `Вход в систему`, {
      entityType: 'user',
      metadata: {
        userEmail: user.email,
      },
    }).catch(() => {});

    return {
      user,
      sessionToken: sessionData?.session?.access_token || '',
      expiresAt: sessionData?.session?.expires_at
        ? new Date(sessionData.session.expires_at * 1000).toISOString()
        : new Date(Date.now() + (8 * 60 * 60 * 1000)).toISOString(), // 8 часов вместо 1 часа
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
    console.debug('📤 Выход пользователя');

    // Логируем выход ДО выхода из системы (пока есть пользователь)
    logUserActivity('logout', 'Выход из системы', {
      entityType: 'user',
    }).catch(() => {});

    // Инвалидируем кэш сессии перед выходом
    invalidateSessionCache();

    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('❌ Ошибка выхода:', error);
      throw error;
    }
    console.debug('✅ Выход выполнен успешно');
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
 * Использует кэширование для уменьшения количества запросов к Supabase.
 * Кэш автоматически инвалидируется через 10 секунд.
 * 
 * @returns Promise с информацией о сессии
 */
export async function checkSession(): Promise<SessionCheckResponse> {
  try {
    // Проверяем кэш перед выполнением проверки
    const now = Date.now();
    if (lastSessionCheck && now - lastSessionCheck.timestamp < SESSION_CHECK_CACHE_TTL) {
      return lastSessionCheck.result;
    }

    // Выполняем проверку сессии
    const result = await performSessionCheck();
    
    // Сохраняем результат в кэш
    lastSessionCheck = { result, timestamp: now };
    
    return result;
  } catch (error: any) {
    console.error('Ошибка проверки сессии:', error);
    return {
      active: false,
      message: 'Ошибка при проверке сессии',
    };
  }
}

/**
 * Внутренняя функция для выполнения проверки сессии
 * 
 * Вынесена в отдельную функцию для удобства тестирования и переиспользования.
 * 
 * @returns Promise с информацией о сессии
 */
async function performSessionCheck(): Promise<SessionCheckResponse> {
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
        // Если refresh token отсутствует в storage — это нормальное состояние
        // для неавторизованного пользователя. Не вызываем refreshSession().
        if (!getStoredRefreshToken()) {
          return {
            active: false,
            message: 'Сессия не найдена',
          };
        }

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
          const expiresAt = refreshedSession.expires_at ? refreshedSession.expires_at * 1000 : Date.now() + (8 * 60 * 60 * 1000); // 8 часов вместо 1 часа
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
      const expiresAt = session.expires_at ? session.expires_at * 1000 : Date.now() + (8 * 60 * 60 * 1000); // 8 часов вместо 1 часа
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
          const newExpiresAt = refreshedSession.expires_at ? refreshedSession.expires_at * 1000 : Date.now() + (8 * 60 * 60 * 1000); // 8 часов вместо 1 часа
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
 * Проверка прав администратора с кэшированием
 * 
 * Использует кэш для уменьшения количества запросов к базе данных.
 * Кэш автоматически инвалидируется через 30 секунд.
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

    // Проверяем кэш
    const cacheKey = user.id;
    const cached = adminCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }

    // Если кэш устарел или отсутствует, получаем данные
    const result = {
      isAdmin: user.role === 'admin',
      role: user.role,
      email: user.email,
    };

    // Сохраняем в кэш
    adminCache.set(cacheKey, { 
      data: result, 
      timestamp: Date.now() 
    });

    return result;
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

/**
 * Отправка ссылки для восстановления пароля
 * 
 * @param email - Email пользователя
 * @returns Promise<void>
 */
export async function resetPassword(email: string): Promise<void> {
  try {
    const normalizedEmail = email.trim().toLowerCase();
    console.debug('📤 Отправка ссылки для восстановления пароля:', { email: normalizedEmail });
    
    // Валидация email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      throw new Error('Неверный формат email');
    }

    // Отправляем ссылку для восстановления пароля через Supabase
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      console.error('❌ Ошибка отправки ссылки для восстановления пароля:', error);
      throw new Error(error.message || 'Ошибка при отправке ссылки для восстановления пароля');
    }

    console.debug('✅ Ссылка для восстановления пароля отправлена на:', email);
  } catch (error: any) {
    console.error('❌ Ошибка восстановления пароля:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(error?.message || 'Ошибка при отправке ссылки для восстановления пароля');
  }
}

/**
 * Обновление пароля по токену из ссылки
 * 
 * @param newPassword - Новый пароль
 * @returns Promise<void>
 */
export async function updatePassword(newPassword: string): Promise<void> {
  try {
    console.debug('📤 Обновление пароля');
    
    // Валидация пароля
    if (!newPassword || newPassword.length < 6) {
      throw new Error('Пароль должен содержать минимум 6 символов');
    }

    // Обновляем пароль через Supabase
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      console.error('❌ Ошибка обновления пароля:', error);
      throw new Error(error.message || 'Ошибка при обновлении пароля');
    }

    console.debug('✅ Пароль успешно обновлен');
  } catch (error: any) {
    console.error('❌ Ошибка обновления пароля:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(error?.message || 'Ошибка при обновлении пароля');
  }
}
