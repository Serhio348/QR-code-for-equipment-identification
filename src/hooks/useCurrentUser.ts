/**
 * Хук для получения текущего пользователя из аутентификации
 * Использует useMemo для оптимизации вычислений
 */

import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';

/**
 * Возвращает имя текущего пользователя
 * Приоритет: user.name > user.email > 'Неизвестный пользователь'
 */
export function useCurrentUser(): string {
  const { user } = useAuth();

  return useMemo(() => {
    if (!user) {
      return 'Неизвестный пользователь';
    }

    if (user.name) {
      return user.name;
    }

    if (user.email) {
      return user.email;
    }

    return 'Неизвестный пользователь';
  }, [user?.name, user?.email]);
}
