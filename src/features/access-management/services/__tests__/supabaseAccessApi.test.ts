/**
 * Тесты для supabaseAccessApi
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkUserAccess, getUserAccess } from '../supabaseAccessApi';
import { supabase } from '@/shared/config/supabase';

// Мокаем Supabase клиент
vi.mock('@/shared/config/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('supabaseAccessApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkUserAccess', () => {
    it('should return true for admin user (always has access)', async () => {
      const mockAdminProfile = {
        id: 'admin-id',
        email: 'admin@example.com',
        role: 'admin',
      };

      // Мокаем получение профиля администратора
      const fromMock = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockAdminProfile,
          error: null,
        }),
      }));

      (supabase.from as any).mockReturnValue(fromMock());

      const result = await checkUserAccess('admin@example.com', 'equipment');

      expect(result).toBe(true);
      expect(supabase.from).toHaveBeenCalledWith('profiles');
    });

    it('should return true for user with access granted', async () => {
      const mockUserProfile = {
        id: 'user-id',
        email: 'user@example.com',
        role: 'user',
      };

      const mockAccess = {
        user_id: 'user-id',
        equipment: true,
        water: false,
      };

      // Мокаем получение профиля
      let callCount = 0;
      const fromMock = vi.fn(() => {
        callCount++;
        if (callCount === 1) {
          // Первый вызов - получение профиля
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockUserProfile,
              error: null,
            }),
          };
        } else {
          // Второй вызов - получение доступа
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockAccess,
              error: null,
            }),
          };
        }
      });

      (supabase.from as any).mockImplementation(fromMock);

      const result = await checkUserAccess('user@example.com', 'equipment');

      expect(result).toBe(true);
    });

    it('should return false for user without access', async () => {
      const mockUserProfile = {
        id: 'user-id',
        email: 'user@example.com',
        role: 'user',
      };

      const mockAccess = {
        user_id: 'user-id',
        equipment: false,
        water: false,
      };

      // Мокаем получение профиля
      let callCount = 0;
      const fromMock = vi.fn(() => {
        callCount++;
        if (callCount === 1) {
          // Первый вызов - получение профиля
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockUserProfile,
              error: null,
            }),
          };
        } else {
          // Второй вызов - получение доступа
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockAccess,
              error: null,
            }),
          };
        }
      });

      (supabase.from as any).mockImplementation(fromMock);

      const result = await checkUserAccess('user@example.com', 'equipment');

      expect(result).toBe(false);
    });

    it('should return false when user is not found', async () => {
      // Мокаем отсутствие пользователя
      const fromMock = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Not found' },
        }),
      }));

      (supabase.from as any).mockReturnValue(fromMock());

      const result = await checkUserAccess('nonexistent@example.com', 'equipment');

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      // Мокаем ошибку
      const fromMock = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockRejectedValue(new Error('Database error')),
      }));

      (supabase.from as any).mockReturnValue(fromMock());

      const result = await checkUserAccess('user@example.com', 'equipment');

      expect(result).toBe(false);
    });
  });

  describe('getUserAccess', () => {
    it('should return user access settings', async () => {
      const mockUserProfile = {
        id: 'user-id',
        email: 'user@example.com',
        name: 'Test User',
      };

      const mockAccess = {
        user_id: 'user-id',
        equipment: true,
        water: true,
        updated_at: new Date().toISOString(),
        updated_by: 'admin-id',
      };

      // Мокаем получение профиля и доступа
      let callCount = 0;
      const fromMock = vi.fn(() => {
        callCount++;
        if (callCount === 1) {
          // Первый вызов - получение профиля
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockUserProfile,
              error: null,
            }),
          };
        } else {
          // Второй вызов - получение доступа
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockAccess,
              error: null,
            }),
          };
        }
      });

      (supabase.from as any).mockImplementation(fromMock);

      const result = await getUserAccess('user@example.com');

      expect(result).toBeDefined();
      expect(result?.email).toBe('user@example.com');
      expect(result?.equipment).toBe(true);
      expect(result?.water).toBe(true);
    });

    it('should return null when user is not found', async () => {
      // Мокаем отсутствие пользователя
      const fromMock = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Not found' },
        }),
      }));

      (supabase.from as any).mockReturnValue(fromMock());

      const result = await getUserAccess('nonexistent@example.com');

      expect(result).toBeNull();
    });
  });
});
