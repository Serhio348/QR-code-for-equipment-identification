/**
 * AppAccessGuard.tsx
 * 
 * Компонент для проверки доступа пользователя к приложению
 */

import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/contexts/AuthContext';
import { checkUserAccess } from '../services/supabaseAccessApi';
import { guardDecision } from '../services/accessLoadState';
import { ROUTES } from '@/shared/utils/routes';
import LoadingSpinner from '../../common/components/LoadingSpinner';
import './AppAccessGuard.css';

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
  const [hasAccess, setHasAccess] = useState<boolean>(false);
  const [checking, setChecking] = useState<boolean>(true);
  const [failed, setFailed] = useState<boolean>(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const checkAccess = async () => {
      // Если пользователь не авторизован, доступ запрещен
      if (!isAuthenticated || !user) {
        setHasAccess(false);
        setFailed(false);
        setChecking(false);
        return;
      }

      if (user.role === 'admin') {
        setHasAccess(true);
        setFailed(false);
        setChecking(false);
        return;
      }

      // Проверяем доступ для обычных пользователей
      try {
        const access = await checkUserAccess(user.email, appId);
        setHasAccess(access);
        setFailed(false);
      } catch (error) {
        console.error('Ошибка проверки доступа:', error);
        setHasAccess(false);
        setFailed(true);
      } finally {
        setChecking(false);
      }
    };

    if (!authLoading) {
      setChecking(true);
      checkAccess();
    }
  }, [isAuthenticated, user, appId, authLoading, attempt]);

  const decision = guardDecision({ checking: authLoading || checking, failed, hasAccess });

  if (decision === 'loading') {
    return <LoadingSpinner fullScreen text="Проверка доступа..." />;
  }

  if (decision === 'error') {
    return (
      <div className="access-check-error" role="alert">
        <p>Не удалось проверить доступ. Раздел закрыт, пока проверка не пройдёт.</p>
        <button type="button" onClick={() => setAttempt(value => value + 1)}>Повторить</button>
      </div>
    );
  }

  if (decision === 'denied') {
    return <Navigate to={ROUTES.HOME} replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
