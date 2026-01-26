/**
 * AppAccessGuard.tsx
 * 
 * Компонент для проверки доступа пользователя к приложению
 */

import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/contexts/AuthContext';
import { checkUserAccess } from '../services/supabaseAccessApi';
import { ROUTES } from '../../../utils/routes';
import LoadingSpinner from '../../../components/LoadingSpinner';

interface AppAccessGuardProps {
  children: React.ReactNode;
  appId: 'equipment' | 'water';
}

/**
 * Компонент для защиты доступа к приложениям
 * Проверяет, есть ли у пользователя доступ к указанному приложению
 */
export default function AppAccessGuard({ children, appId }: AppAccessGuardProps) {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const location = useLocation();
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [checking, setChecking] = useState<boolean>(true);

  useEffect(() => {
    const checkAccess = async () => {
      // Если пользователь не авторизован, доступ запрещен
      if (!isAuthenticated || !user) {
        setHasAccess(false);
        setChecking(false);
        return;
      }

      // Администраторы имеют доступ ко всем приложениям
      if (user.role === 'admin') {
        setHasAccess(true);
        setChecking(false);
        return;
      }

      // Проверяем доступ для обычных пользователей
      try {
        const access = await checkUserAccess(user.email, appId);
        setHasAccess(access);
      } catch (error) {
        console.error('Ошибка проверки доступа:', error);
        // В случае ошибки, по умолчанию доступ запрещен
        setHasAccess(false);
      } finally {
        setChecking(false);
      }
    };

    if (!authLoading) {
      checkAccess();
    }
  }, [isAuthenticated, user, appId, authLoading]);

  // Показываем загрузку во время проверки аутентификации или доступа
  if (authLoading || checking) {
    return <LoadingSpinner fullScreen text="Проверка доступа..." />;
  }

  // Если нет доступа, редиректим на главное меню
  if (!hasAccess) {
    return <Navigate to={ROUTES.HOME} replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
