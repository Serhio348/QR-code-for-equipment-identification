/**
 * AppAccessGuard.tsx
 * 
 * Компонент для проверки доступа пользователя к приложению
 */

import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/contexts/AuthContext';
import { getUserAccess } from '../services/supabaseAccessApi';
import { readAccessSession, writeAccessSession } from '../services/accessSessionCache';
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
function sessionAllows(email: string, appId: 'equipment' | 'water'): boolean | undefined {
  const cached = readAccessSession(email);
  if (cached === undefined) return undefined;
  return cached?.[appId] === true;
}

export default function AppAccessGuard({ children, appId }: AppAccessGuardProps) {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const location = useLocation();
  const knownAccess = user && user.role !== 'admin' ? sessionAllows(user.email, appId) : undefined;
  const [hasAccess, setHasAccess] = useState<boolean>(
    user?.role === 'admin' || knownAccess === true,
  );
  const [checking, setChecking] = useState<boolean>(
    user?.role !== 'admin' && knownAccess === undefined,
  );
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

      const cached = attempt === 0 ? readAccessSession(user.email) : undefined;
      if (cached !== undefined) {
        setHasAccess(cached?.[appId] === true);
        setFailed(false);
        setChecking(false);
        return;
      }

      // Проверяем доступ для обычных пользователей
      setChecking(true);
      try {
        const access = await getUserAccess(user.email);
        writeAccessSession(user.email, access);
        setHasAccess(access?.[appId] === true);
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
      void checkAccess();
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
