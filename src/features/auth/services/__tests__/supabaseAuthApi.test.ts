/**
 * Тесты для supabaseAuthApi
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { login, register, logout, verifyAdmin, invalidateAdminCache } from '../supabaseAuthApi';
import { supabase } from '../../../../shared/config/supabase';
import type { LoginData, RegisterData } from '../../types/user';

// Мокаем Supabase клиент
vi.mock('../../../../shared/config/supabase', () => {
  const mockUser = {
    id: 'test-user-id',
    email: 'test@example.com',
    created_at: new Date().toISOString(),
  };

  const mockSession = {
    access_token: 'mock-access-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: mockUser,
  };

  const mockProfile = {
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User',
    role: 'user' as const,
    created_at: new Date().toISOString(),
    last_login_at: null,
    last_activity_at: null,
    updated_at: new Date().toISOString(),
  };

  return {
    supabase: {
      auth: {
        signUp: vi.fn(),
        signInWithPassword: vi.fn(),
        signOut: vi.fn(),
        getUser: vi.fn(),
        getSession: vi.fn(),
      },
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn(),
      })),
    },
    getCurrentProfile: vi.fn(),
  };
});


describe('supabaseAuthApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateAdminCache();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('login', () => {
    it('should successfully login user with valid credentials', async () => {
      const loginData: LoginData = {
        email: 'test@example.com',
        password: 'password123',
      };

      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
        created_at: new Date().toISOString(),
      };

      const mockSession = {
        access_token: 'mock-access-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: mockUser,
      };

      const mockProfile = {
        id: 'test-user-id',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user' as const,
        created_at: new Date().toISOString(),
        last_login_at: null,
        last_activity_at: null,
        updated_at: new Date().toISOString(),
      };

      // Мокаем успешный вход
      (supabase.auth.signInWithPassword as any).mockResolvedValue({
        data: {
          user: mockUser,
          session: mockSession,
        },
        error: null,
      });

      // Мокаем получение сессии
      (supabase.auth.getSession as any).mockResolvedValue({
        data: {
          session: mockSession,
        },
        error: null,
      });

      // Мокаем получение профиля
      const fromMock = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockProfile,
          error: null,
        }),
      }));

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'profiles') {
          return fromMock();
        }
        if (table === 'login_history') {
          return {
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        return fromMock();
      });

      const result = await login(loginData);

      expect(result).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.user.email).toBe('test@example.com');
      expect(result.sessionToken).toBe('mock-access-token');
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
    });

    it('should throw error with invalid credentials', async () => {
      const loginData: LoginData = {
        email: 'test@example.com',
        password: 'wrong-password',
      };

      // Мокаем ошибку входа
      (supabase.auth.signInWithPassword as any).mockResolvedValue({
        data: null,
        error: {
          message: 'Invalid login credentials',
        },
      });

      // Мокаем логирование ошибки
      const fromMock = vi.fn(() => ({
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      }));
      (supabase.from as any).mockReturnValue(fromMock());

      await expect(login(loginData)).rejects.toThrow('Неверный email или пароль');
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'wrong-password',
      });
    });

    it('should throw error when user is not found', async () => {
      const loginData: LoginData = {
        email: 'nonexistent@example.com',
        password: 'password123',
      };

      // Мокаем ошибку "User not found"
      (supabase.auth.signInWithPassword as any).mockResolvedValue({
        data: null,
        error: {
          message: 'User not found',
        },
      });

      // Мокаем логирование ошибки
      const fromMock = vi.fn(() => ({
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      }));
      (supabase.from as any).mockReturnValue(fromMock());

      await expect(login(loginData)).rejects.toThrow('Пользователь не найден');
    });
  });

  describe('register', () => {
    it('should successfully register new user', async () => {
      const registerData: RegisterData = {
        email: 'newuser@example.com',
        password: 'password123',
        name: 'New User',
      };

      const mockUser = {
        id: 'new-user-id',
        email: 'newuser@example.com',
        created_at: new Date().toISOString(),
      };

      const mockSession = {
        access_token: 'mock-access-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: mockUser,
      };

      const mockProfile = {
        id: 'new-user-id',
        email: 'newuser@example.com',
        name: 'New User',
        role: 'user' as const,
        created_at: new Date().toISOString(),
        last_login_at: null,
        last_activity_at: null,
        updated_at: new Date().toISOString(),
      };

      // Мокаем успешную регистрацию
      (supabase.auth.signUp as any).mockResolvedValue({
        data: {
          user: mockUser,
          session: mockSession,
        },
        error: null,
      });

      // Мокаем получение сессии
      (supabase.auth.getSession as any).mockResolvedValue({
        data: {
          session: mockSession,
        },
        error: null,
      });

      // Мокаем получение профиля (с задержкой для имитации триггера)
      let profileCallCount = 0;
      const fromMock = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockImplementation(() => {
          profileCallCount++;
          if (profileCallCount === 1) {
            // Первый вызов - профиль еще не создан
            return Promise.resolve({
              data: null,
              error: { message: 'Not found' },
            });
          }
          // Второй вызов - профиль создан
          return Promise.resolve({
            data: mockProfile,
            error: null,
          });
        }),
      }));

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'profiles') {
          return fromMock();
        }
        if (table === 'login_history') {
          return {
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        return fromMock();
      });

      const result = await register(registerData);

      expect(result).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.user.email).toBe('newuser@example.com');
      expect(result.user.name).toBe('New User');
      expect(supabase.auth.signUp).toHaveBeenCalledWith({
        email: 'newuser@example.com',
        password: 'password123',
        options: {
          data: {
            name: 'New User',
          },
        },
      });
    });

    it('should throw error when registration fails', async () => {
      const registerData: RegisterData = {
        email: 'existing@example.com',
        password: 'password123',
        name: 'Existing User',
      };

      // Мокаем ошибку регистрации
      (supabase.auth.signUp as any).mockResolvedValue({
        data: null,
        error: {
          message: 'User already registered',
        },
      });

      // Мокаем логирование ошибки
      const fromMock = vi.fn(() => ({
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      }));
      (supabase.from as any).mockReturnValue(fromMock());

      await expect(register(registerData)).rejects.toThrow();
    });
  });

  describe('logout', () => {
    it('should successfully logout user', async () => {
      // Мокаем успешный выход
      (supabase.auth.signOut as any).mockResolvedValue({
        error: null,
      });

      await logout();

      expect(supabase.auth.signOut).toHaveBeenCalled();
    });

    it('should handle logout errors gracefully', async () => {
      // Мокаем ошибку выхода
      (supabase.auth.signOut as any).mockResolvedValue({
        error: {
          message: 'Logout failed',
        },
      });

      // Функция должна выбросить ошибку
      await expect(logout()).rejects.toThrow();
    });
  });

  describe('verifyAdmin', () => {
    // Тесты verifyAdmin требуют более сложного мокирования getCurrentUser,
    // который зависит от getCurrentProfile из config/supabase.
    // Эти тесты лучше выполнять как integration тесты с реальным Supabase клиентом.
    // Для unit тестов достаточно проверить логику через другие функции.
    
    it('should return false when user is not logged in', async () => {
      // Мокаем getCurrentProfile для возврата null
      const { getCurrentProfile } = await import('../../../../shared/config/supabase');
      (getCurrentProfile as any).mockResolvedValue(null);

      const result = await verifyAdmin();

      expect(result.isAdmin).toBe(false);
      expect(result.role).toBe('user');
      expect(result.email).toBe('');
    });
  });
});
