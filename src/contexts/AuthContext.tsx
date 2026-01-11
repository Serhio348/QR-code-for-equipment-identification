/**
 * AuthContext.tsx
 * 
 * Контекст для управления аутентификацией пользователя
 */

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../config/supabase';
import { login as loginApi, logout as logoutApi, register as registerApi, getCurrentUser } from '../services/api/supabaseAuthApi';
import { startActivityTracking, stopActivityTracking, checkSessionTimeout as checkTimeout } from '../utils/sessionTimeout';
import { clearLastPath } from '../utils/pathStorage';
import { ROUTES } from '../utils/routes';
import type { User } from '../types/user';
import type { AuthState } from '../types/auth';
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

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Инициализация аутентификации и отслеживание изменений сессии
  useEffect(() => {
    let mounted = true;
    let initializationComplete = false;
    let userRestored = false;

    // Инициализация: быстро проверяем сессию синхронно
    console.log('🔐 Инициализация аутентификации...');
    
    // Быстрая проверка сессии для немедленного восстановления пользователя
    const quickSessionCheck = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user && mounted) {
          console.log('🔐 Найдена активная сессия, восстанавливаем пользователя...');
          
          // Восстанавливаем пользователя - это может занять время
          const currentUser = await getCurrentUser();
          
          if (currentUser && mounted) {
            setUser(currentUser);
            startActivityTracking();
            userRestored = true;
            console.log('🔐 Пользователь восстановлен:', currentUser.email);
          } else {
            console.log('🔐 Сессия найдена, но профиль не восстановлен');
          }
        } else {
          console.log('🔐 Активная сессия не найдена');
        }
      } catch (error) {
        console.debug('⚠️ Ошибка быстрой проверки сессии (не критично):', error);
      } finally {
        // Устанавливаем loading = false только после завершения проверки
        // Это гарантирует, что пользователь либо восстановлен, либо точно его нет
        if (mounted && !initializationComplete) {
          initializationComplete = true;
          setLoading(false);
          console.log('🔐 Инициализация завершена');
        }
      }
    };

    quickSessionCheck();
    
    // Резервный таймаут на случай зависания запросов (например, проблемы с сетью)
    // Увеличен до 5 секунд, чтобы дать время getCurrentUser() завершиться
    setTimeout(() => {
      if (mounted && !initializationComplete) {
        initializationComplete = true;
        setLoading(false);
        console.log('🔐 Инициализация завершена (резервный таймаут 5 секунд)');
      }
    }, 5000);

    // Подписываемся на изменения состояния аутентификации
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('🔐 Auth state changed:', event, session?.user?.email);

      if (!mounted) return;

      try {
        if (event === 'SIGNED_IN' && session) {
          // Пользователь вошел или сессия обновлена
          // getCurrentUser() уже имеет таймауты внутри
          const currentUser = await getCurrentUser();
          
          if (currentUser) {
            setUser(currentUser);
            startActivityTracking();
            setError(null);
            
            // Создаем или обновляем user_session в localStorage для отслеживания активности
            // Это нужно для проверки таймаута бездействия
            try {
              const { saveSession } = await import('../utils/sessionStorage');
              const now = new Date().toISOString();
              saveSession({
                user: currentUser,
                token: session.access_token || '',
                expiresAt: session.expires_at 
                  ? new Date(session.expires_at * 1000).toISOString()
                  : new Date(Date.now() + (8 * 60 * 60 * 1000)).toISOString(),
                lastActivityAt: now,
              });
              console.debug('✅ user_session создана/обновлена при SIGNED_IN');
            } catch (error) {
              console.debug('⚠️ Ошибка создания user_session (не критично):', error);
            }
          } else {
            console.debug('⚠️ Пользователь не найден после SIGNED_IN, но сессия активна (профиль может быть создан позже)');
            // Не устанавливаем user в null, так как сессия есть
            // Профиль может быть создан с задержкой
          }
        } else if (event === 'SIGNED_OUT') {
          // Пользователь вышел
          setUser(null);
          stopActivityTracking();
          setError(null);
        } else if (event === 'TOKEN_REFRESHED' && session) {
          // Токен обновлен, обновляем данные пользователя и expiresAt в localStorage
          try {
            // Обновляем expiresAt в localStorage
            if (session.expires_at) {
              const { updateSessionExpiresAt } = await import('../utils/sessionStorage');
              const newExpiresAt = new Date(session.expires_at * 1000).toISOString();
              updateSessionExpiresAt(newExpiresAt);
              console.debug('✅ expiresAt обновлен в localStorage:', newExpiresAt);
            } else {
              console.warn('⚠️ TOKEN_REFRESHED: expires_at отсутствует в сессии');
            }
            
            const currentUser = await getCurrentUser();
            if (currentUser) {
              setUser(currentUser);
            }
          } catch (error) {
            // Игнорируем ошибки при обновлении токена
            console.debug('⚠️ Ошибка обновления пользователя после TOKEN_REFRESHED (не критично):', error);
          }
        } else if (event === 'USER_UPDATED' && session) {
          // Данные пользователя обновлены (не критично)
          try {
            const currentUser = await getCurrentUser();
            if (currentUser) {
              setUser(currentUser);
            }
          } catch (error) {
            // Игнорируем ошибки при обновлении пользователя
            console.debug('⚠️ Ошибка обновления пользователя после USER_UPDATED (не критично):', error);
          }
        } else if (event === 'INITIAL_SESSION') {
          // Начальная сессия при загрузке страницы
          // Если пользователь еще не восстановлен, восстанавливаем его
          if (session?.user && mounted && !userRestored) {
            try {
              console.log('🔐 INITIAL_SESSION: восстановление сессии для', session.user.email);
              
              const currentUser = await getCurrentUser();
              
              if (currentUser && mounted) {
                setUser(currentUser);
                startActivityTracking();
                userRestored = true;
                console.log('🔐 INITIAL_SESSION: пользователь восстановлен:', currentUser.email);
                
                // Создаем или обновляем user_session в localStorage для отслеживания активности
                // Это нужно для проверки таймаута бездействия
                try {
                  const { saveSession } = await import('../utils/sessionStorage');
                  const now = new Date().toISOString();
                  saveSession({
                    user: currentUser,
                    token: session.access_token || '',
                    expiresAt: session.expires_at 
                      ? new Date(session.expires_at * 1000).toISOString()
                      : new Date(Date.now() + (8 * 60 * 60 * 1000)).toISOString(),
                    lastActivityAt: now,
                  });
                  console.debug('✅ user_session создана/обновлена при INITIAL_SESSION');
                } catch (error) {
                  console.debug('⚠️ Ошибка создания user_session (не критично):', error);
                }
              } else {
                console.debug('🔐 INITIAL_SESSION: профиль не найден (может быть создан позже)');
              }
            } catch (error) {
              console.debug('⚠️ Ошибка получения пользователя при INITIAL_SESSION (не критично):', error);
            }
          } else if (!session?.user) {
            console.log('🔐 INITIAL_SESSION: сессия не найдена');
          } else {
            console.debug('🔐 INITIAL_SESSION: пользователь уже восстановлен ранее');
          }
          
          // Не устанавливаем loading = false здесь, так как это уже сделано в quickSessionCheck
          // INITIAL_SESSION может прийти позже, но мы уже завершили загрузку
        }
      } catch (error: any) {
        // Ошибки не критичны - продолжаем работу
        console.warn('⚠️ Ошибка обработки изменения состояния аутентификации (не критично):', error.message || error);
      } finally {
        // INITIAL_SESSION обрабатывается выше и устанавливает loading = false
        // Для других событий ничего не делаем здесь
      }
    });

    // Обработчик события истечения сессии
    const handleSessionTimeout = () => {
      setUser(null);
      setError('Сессия истекла. Пожалуйста, войдите снова.');
    };

    window.addEventListener('session-timeout', handleSessionTimeout);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      stopActivityTracking();
      window.removeEventListener('session-timeout', handleSessionTimeout);
    };
  }, []);

  // Периодическая проверка таймаута
  // ВАЖНО: checkTimeout проверяет только таймаут бездействия (1 час),
  // но не проверяет истечение Supabase токена - это делает сам Supabase через autoRefreshToken
  useEffect(() => {
    if (!user) {
      return;
    }

    const interval = setInterval(() => {
      // Проверяем только таймаут бездействия, не истечение токена
      // Supabase сам управляет токенами через autoRefreshToken
      if (!checkTimeout()) {
        console.log('🔐 Таймаут бездействия истек (1 час)');
        setUser(null);
        setError('Сессия истекла из-за бездействия. Пожалуйста, войдите снова.');
      }
    }, 60000); // Проверка каждую минуту

    return () => clearInterval(interval);
  }, [user]);

  const login = useCallback(async (data: LoginData) => {
    try {
      setLoading(true);
      setError(null);

      // Вход через Supabase Auth
      // onAuthStateChange автоматически обновит состояние пользователя
      const response = await loginApi(data);
      
      // Пользователь уже установлен через onAuthStateChange
      // Но можем обновить для немедленного отклика
      if (response.user) {
        setUser(response.user);
        startActivityTracking();
      }
      
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

      // Регистрация через Supabase Auth
      // onAuthStateChange автоматически обновит состояние пользователя
      const response = await registerApi(data);
      
      // Пользователь уже установлен через onAuthStateChange
      // Но можем обновить для немедленного отклика
      if (response.user) {
        setUser(response.user);
        startActivityTracking();
      }
      
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
      // Выход через Supabase Auth
      // onAuthStateChange автоматически обновит состояние (SIGNED_OUT)
      await logoutApi();
    } catch (error) {
      console.error('Ошибка при выходе:', error);
    } finally {
      clearLastPath(); // Очищаем сохраненный путь при выходе
      stopActivityTracking();
      setUser(null);
      setError(null);
      setLoading(false);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      // Получаем актуальные данные пользователя из Supabase
      const currentUser = await getCurrentUser();
      
      if (currentUser) {
        setUser(currentUser);
      } else {
        // Если пользователь не найден, возможно сессия истекла
        setUser(null);
      }
    } catch (error) {
      console.error('Ошибка обновления пользователя:', error);
    }
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

/**
 * Хук для использования контекста аутентификации
 * 
 * @returns Объект с состоянием и функциями аутентификации
 * @throws Error если используется вне AuthProvider
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/**
 * Хук для проверки, требуется ли аутентификация
 * 
 * Используйте этот хук внутри компонента для редиректа на страницу входа
 * 
 * @example
 * function MyComponent() {
 *   useRequireAuth();
 *   return <div>Защищенный контент</div>;
 * }
 */
export function useRequireAuth(): void {
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate(ROUTES.LOGIN);
    }
  }, [isAuthenticated, loading, navigate]);
}

/**
 * Хук для проверки роли пользователя
 * 
 * Редиректит на главную страницу, если у пользователя нет нужной роли
 * 
 * @param requiredRole - Требуемая роль ('admin' | 'user')
 * 
 * @example
 * function AdminComponent() {
 *   useRequireRole('admin');
 *   return <div>Только для админов</div>;
 * }
 */
export function useRequireRole(requiredRole: 'admin' | 'user'): void {
  const { user, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && isAuthenticated && user) {
      if (requiredRole === 'admin' && user.role !== 'admin') {
        navigate(ROUTES.HOME);
      }
    }
  }, [user, isAuthenticated, loading, requiredRole, navigate]);
}

