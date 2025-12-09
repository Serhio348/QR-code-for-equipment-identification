/**
 * AuthContext.tsx
 * 
 * Контекст для управления аутентификацией пользователя
 */

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { login as loginApi, logout as logoutApi, register as registerApi, checkSession, verifyAdmin } from '../services/api/authApi';
import { saveSession, loadSession, clearSession, isSessionExpired, isSessionTimeout } from '../utils/sessionStorage';
import { startActivityTracking, stopActivityTracking, checkSessionTimeout as checkTimeout } from '../utils/sessionTimeout';
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

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Загрузка сессии при монтировании компонента
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const session = loadSession();
        
        if (!session) {
          setLoading(false);
          return;
        }

        // Проверяем, не истекла ли сессия
        if (isSessionExpired() || isSessionTimeout()) {
          clearSession();
          setLoading(false);
          return;
        }

        // Проверяем сессию на сервере (с обработкой ошибок)
        let sessionCheck;
        try {
          sessionCheck = await checkSession(session.user.email);
          
          if (!sessionCheck.active) {
            clearSession();
            setLoading(false);
            return;
          }
        } catch (sessionError: any) {
          // Если ошибка при проверке сессии, но сессия не истекла по времени,
          // продолжаем работу (возможно, временная проблема с сетью)
          console.warn('⚠️ Ошибка проверки сессии на сервере, продолжаем с локальной сессией:', sessionError.message);
          // Не очищаем сессию при временных ошибках сети
        }

        // Обновляем роль пользователя (может измениться)
        let adminCheck;
        try {
          adminCheck = await verifyAdmin(session.user.email);
        } catch (adminError: any) {
          // Если ошибка при проверке роли, используем роль из сессии
          console.warn('⚠️ Ошибка проверки роли, используем роль из сессии:', adminError.message);
          adminCheck = { role: session.user.role || 'user' };
        }
        
        setUser({
          ...session.user,
          role: adminCheck.role,
        });

        // Обновляем сессию с новыми данными
        saveSession({
          ...session,
          user: {
            ...session.user,
            role: adminCheck.role,
          },
        });

        // Начинаем отслеживание активности
        startActivityTracking();
        
        setLoading(false);
      } catch (error: any) {
        console.error('Ошибка инициализации аутентификации:', error);
        // Не очищаем сессию при ошибках инициализации, если сессия валидна по времени
        // Пользователь может продолжить работу с локальной сессией
        if (isSessionExpired() || isSessionTimeout()) {
          clearSession();
        }
        setLoading(false);
      }
    };

    initializeAuth();

    // Обработчик события истечения сессии
    const handleSessionTimeout = () => {
      setUser(null);
      setError('Сессия истекла. Пожалуйста, войдите снова.');
    };

    window.addEventListener('session-timeout', handleSessionTimeout);

    return () => {
      stopActivityTracking();
      window.removeEventListener('session-timeout', handleSessionTimeout);
    };
  }, []);

  // Периодическая проверка таймаута
  useEffect(() => {
    if (!user) {
      return;
    }

    const interval = setInterval(() => {
      if (!checkTimeout()) {
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

      const response = await loginApi(data);

      const session: UserSession = {
        user: response.user,
        token: response.sessionToken,
        expiresAt: response.expiresAt,
        lastActivityAt: new Date().toISOString(),
      };

      saveSession(session);
      setUser(response.user);

      // Начинаем отслеживание активности
      startActivityTracking();
      
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

      const response = await registerApi(data);

      const session: UserSession = {
        user: response.user,
        token: response.sessionToken,
        expiresAt: response.expiresAt,
        lastActivityAt: new Date().toISOString(),
      };

      saveSession(session);
      setUser(response.user);

      // Начинаем отслеживание активности
      startActivityTracking();
      
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
      if (user) {
        await logoutApi(user.email);
      }
    } catch (error) {
      console.error('Ошибка при выходе:', error);
    } finally {
      clearSession();
      stopActivityTracking();
      setUser(null);
      setError(null);
      setLoading(false);
    }
  }, [user]);

  const refreshUser = useCallback(async () => {
    if (!user) {
      return;
    }

    try {
      const adminCheck = await verifyAdmin(user.email);
      
      const updatedUser: User = {
        ...user,
        role: adminCheck.role,
      };

      setUser(updatedUser);

      // Обновляем сессию
      const session = loadSession();
      if (session) {
        saveSession({
          ...session,
          user: updatedUser,
        });
      }
    } catch (error) {
      console.error('Ошибка обновления пользователя:', error);
    }
  }, [user]);

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

