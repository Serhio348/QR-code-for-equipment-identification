# Примеры кода для интеграции Supabase

## 📁 Структура файлов

```
src/
├── config/
│   └── supabase.ts                    # Конфигурация Supabase клиента
├── services/
│   └── api/
│       ├── supabaseAuthApi.ts         # API для авторизации
│       ├── supabaseAccessApi.ts       # API для управления доступом
│       └── supabaseBeliotStorageApi.ts # API для Beliot overrides
└── contexts/
    └── SupabaseAuthContext.tsx        # Контекст авторизации
```

---

## 1. Конфигурация Supabase (`src/config/supabase.ts`)

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
```

---

## 2. API для авторизации (`src/services/api/supabaseAuthApi.ts`)

```typescript
import { supabase } from '../../config/supabase';
import type { RegisterData, LoginData, AuthResponse, User } from '../../types/user';
import type { LoginHistoryEntry } from '../../types/auth';

/**
 * Регистрация нового пользователя
 */
export async function register(data: RegisterData): Promise<AuthResponse> {
  try {
    // 1. Создаем пользователя в Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          name: data.name || '',
          role: 'user',
        },
      },
    });

    if (authError) {
      throw new Error(authError.message);
    }

    if (!authData.user) {
      throw new Error('Не удалось создать пользователя');
    }

    // 2. Профиль создается автоматически через триггер
    // Но можем обновить его, если нужно
    if (data.name) {
      await supabase
        .from('profiles')
        .update({ name: data.name })
        .eq('id', authData.user.id);
    }

    // 3. Логируем успешную регистрацию
    await logLogin(authData.user.id, data.email, true);

    // 4. Получаем профиль пользователя
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    const user: User = {
      id: authData.user.id,
      email: authData.user.email!,
      name: profile?.name,
      role: (profile?.role as 'admin' | 'user') || 'user',
      createdAt: profile?.created_at || new Date().toISOString(),
    };

    // 5. Получаем сессию
    const { data: session } = await supabase.auth.getSession();

    return {
      user,
      sessionToken: session?.session?.access_token || '',
      expiresAt: session?.session?.expires_at
        ? new Date(session.session.expires_at * 1000).toISOString()
        : new Date(Date.now() + 3600000).toISOString(),
      message: 'Регистрация успешна',
    };
  } catch (error: any) {
    console.error('Ошибка регистрации:', error);
    throw new Error(error.message || 'Ошибка при регистрации');
  }
}

/**
 * Вход пользователя
 */
export async function login(data: LoginData): Promise<AuthResponse> {
  try {
    // 1. Входим через Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (authError) {
      // Логируем неуспешный вход
      await logLogin('', data.email, false, authError.message);
      throw new Error(authError.message || 'Неверный email или пароль');
    }

    if (!authData.user) {
      throw new Error('Не удалось войти');
    }

    // 2. Логируем успешный вход
    await logLogin(authData.user.id, data.email, true);

    // 3. Обновляем last_login_at в профиле
    await supabase
      .from('profiles')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', authData.user.id);

    // 4. Получаем профиль пользователя
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    const user: User = {
      id: authData.user.id,
      email: authData.user.email!,
      name: profile?.name,
      role: (profile?.role as 'admin' | 'user') || 'user',
      createdAt: profile?.created_at || new Date().toISOString(),
      lastLoginAt: profile?.last_login_at,
    };

    // 5. Получаем сессию
    const { data: session } = await supabase.auth.getSession();

    return {
      user,
      sessionToken: session?.session?.access_token || '',
      expiresAt: session?.session?.expires_at
        ? new Date(session.session.expires_at * 1000).toISOString()
        : new Date(Date.now() + 3600000).toISOString(),
      message: 'Вход выполнен успешно',
    };
  } catch (error: any) {
    console.error('Ошибка входа:', error);
    throw error;
  }
}

/**
 * Выход пользователя
 */
export async function logout(): Promise<void> {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Ошибка выхода:', error);
    }
  } catch (error) {
    console.error('Ошибка выхода:', error);
  }
}

/**
 * Получение текущего пользователя
 */
export async function getCurrentUser(): Promise<User | null> {
  try {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    
    if (!authUser) {
      return null;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .single();

    if (!profile) {
      return null;
    }

    return {
      id: authUser.id,
      email: authUser.email!,
      name: profile.name,
      role: (profile.role as 'admin' | 'user') || 'user',
      createdAt: profile.created_at,
      lastLoginAt: profile.last_login_at,
      lastActivityAt: profile.last_activity_at,
    };
  } catch (error) {
    console.error('Ошибка получения текущего пользователя:', error);
    return null;
  }
}

/**
 * Проверка активности сессии
 */
export async function checkSession(): Promise<{
  active: boolean;
  remainingTime?: number;
  message?: string;
}> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return {
        active: false,
        message: 'Сессия не найдена',
      };
    }

    const expiresAt = session.expires_at * 1000; // Конвертируем в миллисекунды
    const now = Date.now();
    const remainingTime = expiresAt - now;

    if (remainingTime <= 0) {
      return {
        active: false,
        message: 'Сессия истекла',
      };
    }

    return {
      active: true,
      remainingTime,
    };
  } catch (error) {
    console.error('Ошибка проверки сессии:', error);
    return {
      active: false,
      message: 'Ошибка при проверке сессии',
    };
  }
}

/**
 * Проверка прав администратора
 */
export async function verifyAdmin(email: string): Promise<{
  isAdmin: boolean;
  role: 'admin' | 'user';
  email: string;
}> {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('email', email)
      .single();

    const role = (profile?.role as 'admin' | 'user') || 'user';

    return {
      isAdmin: role === 'admin',
      role,
      email,
    };
  } catch (error) {
    console.error('Ошибка проверки прав администратора:', error);
    return {
      isAdmin: false,
      role: 'user',
      email,
    };
  }
}

/**
 * Получение истории входов
 */
export async function getLoginHistory(
  email?: string,
  limit: number = 100
): Promise<LoginHistoryEntry[]> {
  try {
    let query = supabase
      .from('login_history')
      .select('*')
      .order('login_at', { ascending: false })
      .limit(limit);

    if (email) {
      query = query.eq('email', email);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return (data || []).map((entry) => ({
      id: entry.id,
      email: entry.email,
      loginAt: entry.login_at,
      ipAddress: entry.ip_address,
      success: entry.success,
      failureReason: entry.failure_reason,
    }));
  } catch (error) {
    console.error('Ошибка получения истории входов:', error);
    return [];
  }
}

/**
 * Логирование входа (вспомогательная функция)
 */
async function logLogin(
  userId: string,
  email: string,
  success: boolean,
  failureReason?: string,
  ipAddress?: string
): Promise<void> {
  try {
    await supabase.rpc('log_login', {
      p_user_id: userId || null,
      p_email: email,
      p_success: success,
      p_failure_reason: failureReason || null,
      p_ip_address: ipAddress || null,
    });
  } catch (error) {
    console.error('Ошибка логирования входа:', error);
    // Не пробрасываем ошибку, так как это не критично
  }
}
```

---

## 3. API для управления доступом (`src/services/api/supabaseAccessApi.ts`)

```typescript
import { supabase } from '../../config/supabase';
import type { UserAppAccess, UpdateUserAccessData } from '../../types/access';

/**
 * Получить список всех пользователей с их настройками доступа
 */
export async function getAllUserAccess(): Promise<UserAppAccess[]> {
  try {
    const { data, error } = await supabase
      .from('user_app_access')
      .select(`
        *,
        profiles:user_id (
          name
        )
      `)
      .order('email');

    if (error) {
      throw error;
    }

    return (data || []).map((access) => ({
      email: access.email,
      userId: access.user_id,
      name: access.profiles?.name,
      equipment: access.equipment || false,
      water: access.water || false,
      updatedAt: access.updated_at,
      updatedBy: access.updated_by,
    }));
  } catch (error: any) {
    console.error('Ошибка получения настроек доступа:', error);
    throw new Error(error.message || 'Ошибка при получении настроек доступа');
  }
}

/**
 * Получить настройки доступа для конкретного пользователя
 */
export async function getUserAccess(email: string): Promise<UserAppAccess | null> {
  try {
    const { data, error } = await supabase
      .from('user_app_access')
      .select(`
        *,
        profiles:user_id (
          name
        )
      `)
      .eq('email', email)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Запись не найдена
        return null;
      }
      throw error;
    }

    return {
      email: data.email,
      userId: data.user_id,
      name: data.profiles?.name,
      equipment: data.equipment || false,
      water: data.water || false,
      updatedAt: data.updated_at,
      updatedBy: data.updated_by,
    };
  } catch (error: any) {
    console.error('Ошибка получения настроек доступа:', error);
    throw new Error(error.message || 'Ошибка при получении настроек доступа');
  }
}

/**
 * Обновить настройки доступа для пользователя
 */
export async function updateUserAccess(
  data: UpdateUserAccessData,
  updatedBy: string
): Promise<UserAppAccess> {
  try {
    // Получаем user_id по email
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', data.email)
      .single();

    if (!profile) {
      throw new Error('Пользователь не найден');
    }

    const updateData: any = {
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    };

    if (data.access.equipment !== undefined) {
      updateData.equipment = data.access.equipment;
    }
    if (data.access.water !== undefined) {
      updateData.water = data.access.water;
    }

    const { data: updated, error } = await supabase
      .from('user_app_access')
      .update(updateData)
      .eq('user_id', profile.id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return {
      email: updated.email,
      userId: updated.user_id,
      equipment: updated.equipment || false,
      water: updated.water || false,
      updatedAt: updated.updated_at,
      updatedBy: updated.updated_by,
    };
  } catch (error: any) {
    console.error('Ошибка обновления настроек доступа:', error);
    throw new Error(error.message || 'Ошибка при обновлении настроек доступа');
  }
}

/**
 * Проверить, есть ли у пользователя доступ к приложению
 */
export async function checkUserAccess(
  email: string,
  appId: 'equipment' | 'water'
): Promise<boolean> {
  try {
    const access = await getUserAccess(email);
    if (!access) {
      return false;
    }
    return access[appId] === true;
  } catch (error) {
    console.error('Ошибка проверки доступа:', error);
    return false;
  }
}
```

---

## 4. API для Beliot overrides (`src/services/api/supabaseBeliotStorageApi.ts`)

```typescript
import { supabase } from '../../config/supabase';
import type { BeliotDeviceOverride } from '../../services/api/beliotDevicesStorageApi';

/**
 * Получить все пользовательские изменения счетчиков Beliot
 */
export async function getBeliotDevicesOverrides(): Promise<Record<string, BeliotDeviceOverride>> {
  try {
    const { data, error } = await supabase
      .from('beliot_device_overrides')
      .select('*')
      .order('device_id');

    if (error) {
      throw error;
    }

    const overrides: Record<string, BeliotDeviceOverride> = {};

    (data || []).forEach((override) => {
      overrides[override.device_id] = {
        name: override.name || undefined,
        address: override.address || undefined,
        serialNumber: override.serial_number || undefined,
        group: override.device_group || undefined,
        object: override.object_name || undefined,
        lastSync: override.last_sync,
        lastModified: override.last_modified,
        modifiedBy: override.modified_by || undefined,
      };
    });

    return overrides;
  } catch (error: any) {
    console.error('Ошибка получения overrides:', error);
    throw new Error(error.message || 'Ошибка при получении изменений счетчиков');
  }
}

/**
 * Получить изменения для конкретного устройства
 */
export async function getBeliotDeviceOverride(
  deviceId: string
): Promise<BeliotDeviceOverride | null> {
  try {
    const { data, error } = await supabase
      .from('beliot_device_overrides')
      .select('*')
      .eq('device_id', deviceId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Запись не найдена
        return null;
      }
      throw error;
    }

    return {
      name: data.name || undefined,
      address: data.address || undefined,
      serialNumber: data.serial_number || undefined,
      group: data.device_group || undefined,
      object: data.object_name || undefined,
      lastSync: data.last_sync,
      lastModified: data.last_modified,
      modifiedBy: data.modified_by || undefined,
    };
  } catch (error: any) {
    console.error('Ошибка получения override:', error);
    throw new Error(error.message || 'Ошибка при получении изменений устройства');
  }
}

/**
 * Сохранить изменения для устройства
 */
export async function saveBeliotDeviceOverride(
  deviceId: string,
  override: BeliotDeviceOverride,
  modifiedBy?: string
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const modifier = modifiedBy || user?.email || 'unknown';

    const updateData: any = {
      device_id: deviceId,
      last_modified: new Date().toISOString(),
      modified_by: modifier,
      updated_at: new Date().toISOString(),
    };

    if (override.name !== undefined) {
      updateData.name = override.name || null;
    }
    if (override.address !== undefined) {
      updateData.address = override.address || null;
    }
    if (override.serialNumber !== undefined) {
      updateData.serial_number = override.serialNumber || null;
    }
    if (override.group !== undefined) {
      updateData.device_group = override.group || null;
    }
    if (override.object !== undefined) {
      updateData.object_name = override.object || null;
    }
    if (override.lastSync !== undefined) {
      updateData.last_sync = override.lastSync || null;
    }

    const { error } = await supabase
      .from('beliot_device_overrides')
      .upsert(updateData, {
        onConflict: 'device_id',
      });

    if (error) {
      throw error;
    }
  } catch (error: any) {
    console.error('Ошибка сохранения override:', error);
    throw new Error(error.message || 'Ошибка при сохранении изменений устройства');
  }
}

/**
 * Удалить изменения для устройства
 */
export async function deleteBeliotDeviceOverride(deviceId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('beliot_device_overrides')
      .delete()
      .eq('device_id', deviceId);

    if (error) {
      throw error;
    }
  } catch (error: any) {
    console.error('Ошибка удаления override:', error);
    throw new Error(error.message || 'Ошибка при удалении изменений устройства');
  }
}
```

---

## 5. Контекст авторизации (`src/contexts/SupabaseAuthContext.tsx`)

```typescript
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../config/supabase';
import * as authApi from '../services/api/supabaseAuthApi';
import { ROUTES } from '../utils/routes';
import type { User } from '../types/user';
import type { AuthState, UserSession } from '../types/auth';
import type { LoginData, RegisterData } from '../types/user';

interface AuthContextType extends AuthState {
  login: (data: LoginData) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function SupabaseAuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  // Загрузка текущего пользователя при монтировании
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Проверяем существующую сессию
        const currentUser = await authApi.getCurrentUser();
        setUser(currentUser);

        // Подписываемся на изменения авторизации
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          async (event, session) => {
            if (event === 'SIGNED_IN' && session) {
              const user = await authApi.getCurrentUser();
              setUser(user);
            } else if (event === 'SIGNED_OUT') {
              setUser(null);
            }
          }
        );

        setLoading(false);

        return () => {
          subscription.unsubscribe();
        };
      } catch (error: any) {
        console.error('Ошибка инициализации аутентификации:', error);
        setLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const login = useCallback(async (data: LoginData) => {
    try {
      setLoading(true);
      setError(null);

      const response = await authApi.login(data);
      setUser(response.user);
      setLoading(false);
    } catch (error: any) {
      setError(error.message || 'Ошибка при входе');
      setLoading(false);
      throw error;
    }
  }, []);

  const register = useCallback(async (data: RegisterData) => {
    try {
      setLoading(true);
      setError(null);

      const response = await authApi.register(data);
      setUser(response.user);
      setLoading(false);
    } catch (error: any) {
      setError(error.message || 'Ошибка при регистрации');
      setLoading(false);
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      setLoading(true);
      await authApi.logout();
      setUser(null);
      setError(null);
      navigate(ROUTES.LOGIN);
    } catch (error) {
      console.error('Ошибка при выходе:', error);
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  const refreshUser = useCallback(async () => {
    const currentUser = await authApi.getCurrentUser();
    setUser(currentUser);
  }, []);

  const value: AuthContextType = {
    user,
    loading,
    error,
    isAuthenticated: user !== null,
    isAdmin: user?.role === 'admin',
    login,
    register,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within SupabaseAuthProvider');
  }
  return context;
}
```

---

## Использование

1. Замените `AuthProvider` на `SupabaseAuthProvider` в `main.tsx`
2. Обновите импорты в компонентах
3. Все остальное должно работать автоматически!

