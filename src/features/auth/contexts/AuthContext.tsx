/**
 * AuthContext.tsx
 * 
 * Контекст для управления аутентификацией пользователя
 */

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, invalidateProfileCache } from '@/shared/config/supabase';
import { login as loginApi, logout as logoutApi, register as registerApi, getCurrentUser } from '../services/supabaseAuthApi';
import { startActivityTracking, stopActivityTracking, checkSessionTimeout as checkTimeout } from '@/shared/utils/sessionTimeout';
import { clearLastPath } from '@/shared/utils/pathStorage';
import { ROUTES } from '@/shared/utils/routes';
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
    let restorationInProgress = false;
    let signedInProcessing = false; // Флаг для предотвращения повторной обработки SIGNED_IN

    // Инициализация: быстро проверяем сессию синхронно
    console.log('🔐 Инициализация аутентификации...');
    
    // Быстрая проверка сессии для немедленного восстановления пользователя
    const quickSessionCheck = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user && mounted) {
          console.debug('🔐 Найдена активная сессия, восстанавливаем пользователя...');
          
          // Устанавливаем флаг, что восстановление началось
          restorationInProgress = true;
          
          // Восстанавливаем пользователя
          const currentUser = await getCurrentUser();
          
          if (currentUser && mounted) {
            setUser(currentUser);
            startActivityTracking();
            userRestored = true;
            console.debug('🔐 Пользователь восстановлен:', currentUser.email);
          } else {
            console.debug('🔐 Сессия найдена, но профиль не восстановлен');
          }
          
          // Восстановление завершено
          restorationInProgress = false;
        } else {
          console.debug('🔐 Активная сессия не найдена');
        }
      } catch (error) {
        console.debug('⚠️ Ошибка быстрой проверки сессии (не критично):', error);
        restorationInProgress = false;
      } finally {
        // Устанавливаем loading = false только после завершения проверки
        // Это гарантирует, что пользователь либо восстановлен, либо точно его нет
        if (mounted && !initializationComplete) {
          initializationComplete = true;
          setLoading(false);
          console.debug('🔐 Инициализация завершена');
        }
      }
    };

    // Запускаем quickSessionCheck
    quickSessionCheck().catch((error) => {
      console.debug('⚠️ Ошибка в quickSessionCheck:', error);
      // Если произошла ошибка, все равно завершаем инициализацию
      if (mounted && !initializationComplete) {
        initializationComplete = true;
        setLoading(false);
        console.debug('🔐 Инициализация завершена (после ошибки)');
      }
    });
    
    // Резервный таймаут на случай зависания запросов (например, проблемы с сетью)
    // Установлен в 5 секунд - если quickSessionCheck не завершился, принудительно завершаем инициализацию
    setTimeout(() => {
      if (mounted && !initializationComplete) {
        initializationComplete = true;
        setLoading(false);
        console.debug('🔐 Инициализация завершена (резервный таймаут 5 секунд)');
      }
    }, 5000);

    // Подписываемся на изменения состояния аутентификации
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.debug('🔐 Auth state changed:', event, session?.user?.email);

      if (!mounted) return;

      // Обработка ошибок refresh token
      if (event === 'SIGNED_OUT' && !session) {
        // Если сессия истекла из-за невалидного refresh token, очищаем localStorage
        try {
          localStorage.removeItem('sb-auth-token');
          localStorage.removeItem('sb-auth-token.0');
          localStorage.removeItem('sb-auth-token.1');
          localStorage.removeItem('user_session');
        } catch (error) {
          // Игнорируем ошибки очистки
          console.debug('⚠️ Ошибка очистки localStorage (не критично):', error);
        }
      }

      try {
        if (event === 'SIGNED_IN' && session) {
          // Защита от повторной обработки SIGNED_IN
          // Если уже обрабатываем SIGNED_IN или пользователь уже установлен с тем же ID, пропускаем
          if (signedInProcessing) {
            console.debug('🔐 SIGNED_IN уже обрабатывается, пропускаем повторное событие');
            return;
          }
          
          // Если пользователь уже установлен с тем же ID, не обрабатываем повторно
          if (user && user.id === session.user.id) {
            console.debug('🔐 Пользователь уже установлен, пропускаем повторное SIGNED_IN');
            return;
          }
          
          // Устанавливаем флаг обработки
          signedInProcessing = true;
          
          // Пользователь вошел или сессия обновлена
          // Инвалидируем кеш профиля, чтобы получить свежие данные
          invalidateProfileCache();
          
          // Получаем пользователя с уменьшенным таймаутом для быстрой загрузки
          const getUserWithTimeout = Promise.race([
            getCurrentUser(),
            new Promise<User | null>((resolve) =>
              setTimeout(() => {
                console.debug('⚠️ Таймаут getCurrentUser() (800ms)');
                resolve(null);
              }, 800)
            )
          ]);

          let currentUser = await getUserWithTimeout;

          // Если пользователь не найден, делаем одну быструю повторную попытку
          if (!currentUser) {
            console.debug('⚠️ Повторная попытка загрузки профиля...');
            await new Promise(resolve => setTimeout(resolve, 200));

            const retryGetUser = Promise.race([
              getCurrentUser(),
              new Promise<User | null>((resolve) =>
                setTimeout(() => {
                  console.debug('⚠️ Таймаут повторной попытки (600ms)');
                  resolve(null);
                }, 600)
              )
            ]);

            currentUser = await retryGetUser;
          }
          
          if (currentUser) {
            setUser(currentUser);
            startActivityTracking();
            setError(null);
            
            // Создаем или обновляем user_session в localStorage для отслеживания активности
            // Это нужно для проверки таймаута бездействия
            try {
              const { saveSession } = await import('../../../shared/utils/sessionStorage');
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
            
            // Снимаем флаг обработки после успешной установки пользователя
            signedInProcessing = false;
          } else if (session?.user) {
            // Если профиль не найден, создаем пользователя из данных сессии
            // Это позволяет странице загрузиться даже если профиль еще не создан
            console.debug('⚠️ Профиль не найден, создаем пользователя из данных сессии');
            const fallbackUser: User = {
              id: session.user.id,
              email: session.user.email || '',
              name: session.user.user_metadata?.name || undefined,
              role: 'user', // По умолчанию user, пока не загрузится профиль
              createdAt: session.user.created_at || new Date().toISOString(),
            };
            
            setUser(fallbackUser);
            startActivityTracking();
            setError(null);
            
            // Сохраняем в localStorage
            try {
              const { saveSession } = await import('../../../shared/utils/sessionStorage');
              const now = new Date().toISOString();
              saveSession({
                user: fallbackUser,
                token: session.access_token || '',
                expiresAt: session.expires_at 
                  ? new Date(session.expires_at * 1000).toISOString()
                  : new Date(Date.now() + (8 * 60 * 60 * 1000)).toISOString(),
                lastActivityAt: now,
              });
              console.debug('✅ user_session создана из данных сессии при SIGNED_IN');
            } catch (error) {
              console.debug('⚠️ Ошибка создания user_session (не критично):', error);
            }
            
            // Пытаемся обновить пользователя в фоне, когда профиль будет готов
            setTimeout(async () => {
              try {
                const updatedUser = await getCurrentUser();
                if (updatedUser && mounted) {
                  setUser(updatedUser);
                  console.debug('✅ Пользователь обновлен из профиля');
                }
              } catch (error) {
                console.debug('⚠️ Ошибка обновления пользователя в фоне (не критично):', error);
              }
            }, 2000);
            
            // Снимаем флаг обработки после создания fallback пользователя
            signedInProcessing = false;
          } else {
            console.debug('⚠️ Пользователь не найден после SIGNED_IN, но сессия активна (профиль может быть создан позже)');
            // Не устанавливаем user в null, так как сессия есть
            // Профиль может быть создан с задержкой
            // Снимаем флаг обработки
            signedInProcessing = false;
          }
        } else if (event === 'SIGNED_OUT') {
          // Пользователь вышел
          signedInProcessing = false; // Сбрасываем флаг обработки
          invalidateProfileCache(); // Очищаем кеш профиля
          setUser(null);
          stopActivityTracking();
          setError(null);
        } else if (event === 'TOKEN_REFRESHED' && session) {
          // Токен обновлен, обновляем данные пользователя и expiresAt в localStorage
          try {
            // Обновляем expiresAt в localStorage
            if (session.expires_at) {
              const { updateSessionExpiresAt } = await import('../../../shared/utils/sessionStorage');
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
          // Пропускаем восстановление, если оно уже выполнено или выполняется в quickSessionCheck
          if (session?.user && mounted && !userRestored && !restorationInProgress) {
            try {
              console.debug('🔐 INITIAL_SESSION: восстановление сессии для', session.user.email);
              
              // Устанавливаем флаг, что восстановление началось
              restorationInProgress = true;
              
              const currentUser = await getCurrentUser();
              
              if (currentUser && mounted) {
                setUser(currentUser);
                startActivityTracking();
                userRestored = true;
                console.debug('🔐 INITIAL_SESSION: пользователь восстановлен:', currentUser.email);
                
                // Создаем или обновляем user_session в localStorage для отслеживания активности
                // Это нужно для проверки таймаута бездействия
                try {
                  const { saveSession } = await import('../../../shared/utils/sessionStorage');
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
              
              // Восстановление завершено
              restorationInProgress = false;
            } catch (error) {
              console.debug('⚠️ Ошибка получения пользователя при INITIAL_SESSION (не критично):', error);
              restorationInProgress = false;
            }
          } else if (!session?.user) {
            console.debug('🔐 INITIAL_SESSION: сессия не найдена');
          } else if (userRestored || restorationInProgress) {
            console.debug('🔐 INITIAL_SESSION: пользователь уже восстановлен или восстановление в процессе');
          }
          
          // Не устанавливаем loading = false здесь, так как это уже сделано в quickSessionCheck
          // INITIAL_SESSION может прийти позже, но мы уже завершили загрузку
        }
      } catch (error: any) {
        // Сбрасываем флаг обработки при ошибке
        signedInProcessing = false;
        
        // Обработка ошибок refresh token
        if (error?.message?.includes('Refresh Token') || error?.message?.includes('refresh_token')) {
          console.debug('🔐 Ошибка refresh token, очищаем сессию:', error.message);
          // Очищаем невалидные токены
          try {
            invalidateProfileCache(); // Очищаем кеш профиля
            localStorage.removeItem('sb-auth-token');
            localStorage.removeItem('sb-auth-token.0');
            localStorage.removeItem('sb-auth-token.1');
            localStorage.removeItem('user_session');
            setUser(null);
            stopActivityTracking();
          } catch (clearError) {
            console.debug('⚠️ Ошибка очистки localStorage (не критично):', clearError);
          }
        } else {
          // Другие ошибки не критичны - продолжаем работу
          console.warn('⚠️ Ошибка обработки изменения состояния аутентификации (не критично):', error.message || error);
        }
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
        console.debug('🔐 Таймаут бездействия истек (1 час)');
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
      } else {
        // Если пользователь не пришел в response, пытаемся получить его напрямую
        // Это может произойти, если onAuthStateChange еще не сработал
        const currentUser = await getCurrentUser();
        if (currentUser) {
          setUser(currentUser);
          startActivityTracking();
        }
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
      invalidateProfileCache(); // Очищаем кеш профиля при выходе
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

