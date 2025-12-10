/**
 * ProtectedRoute.tsx
 * 
 * Компонент для защиты маршрутов, требующих аутентификации
 */

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ROUTES } from '../utils/routes';
import { saveRedirectPath } from '../utils/pathStorage';
import type { ReactNode } from 'react';

interface ProtectedRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;
}

/**
 * Защищенный маршрут
 * 
 * Редиректит на страницу входа, если пользователь не авторизован.
 * Если указан requireAdmin=true, редиректит на главную, если пользователь не администратор.
 * 
 * @param children - Компонент для отображения
 * @param requireAdmin - Требовать ли роль администратора
 */
export default function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { isAuthenticated, isAdmin, loading } = useAuth();
  const location = useLocation();

  // Показываем загрузку во время проверки аутентификации
  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh' 
      }}>
        <div>Загрузка...</div>
      </div>
    );
  }

  // Если не авторизован, сохраняем текущий путь и редиректим на страницу входа
  if (!isAuthenticated) {
    saveRedirectPath(location.pathname + location.search);
    return <Navigate to={ROUTES.LOGIN} replace />;
  }

  // Если требуется роль администратора, но пользователь не админ
  if (requireAdmin && !isAdmin) {
    return <Navigate to={ROUTES.HOME} replace />;
  }

  return <>{children}</>;
}

