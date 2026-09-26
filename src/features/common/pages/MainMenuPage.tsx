/**
 * Главное меню приложения
 * Позволяет выбрать между приложением "Оборудование" и "Вода"
 * Показывает только те приложения, к которым у пользователя есть доступ
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/contexts/AuthContext';
import { getUserAccess } from '../../access-management/services/supabaseAccessApi';
import { AVAILABLE_APPS, type UserAppAccess } from '../../access-management/types/access';
import { menuAccessView } from '../../access-management/services/accessLoadState';
import { ROUTES } from '@/shared/utils/routes';
import { clearLastPath } from '@/shared/utils/pathStorage';
import AdminModal from '../components/AdminModal';
import './MainMenuPage.css';

const MainMenuPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAdmin, logout } = useAuth();
  const [userAccess, setUserAccess] = useState<UserAppAccess | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [profileMissing, setProfileMissing] = useState<boolean>(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [loggingOut, setLoggingOut] = useState<boolean>(false);
  const [showAdminModal, setShowAdminModal] = useState<boolean>(false);

  // Очищаем сохраненный путь при переходе в главное меню
  useEffect(() => {
    clearLastPath();
  }, []);

  // Загрузка настроек доступа для обычных пользователей
  useEffect(() => {
    let mounted = true;
    let retryCount = 0;
    const maxRetries = 3;
    const retryDelay = 1000; // 1 секунда между попытками

    const loadAccess = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      // Администраторы имеют доступ ко всем приложениям
      if (isAdmin) {
        setLoading(false);
        return;
      }

      try {
        const access = await getUserAccess(user.email);

        // Если профиль не найден (null), возможно он ещё не создан после регистрации
        // Пробуем повторить запрос через некоторое время
        if (access === null && retryCount < maxRetries && mounted) {
          retryCount++;
          console.debug(`[MainMenuPage] Профиль не найден, повторная попытка ${retryCount}/${maxRetries}...`);
          setTimeout(() => {
            if (mounted) {
              loadAccess();
            }
          }, retryDelay);
          return;
        }

        if (mounted) {
          setAccessError(null);
          setProfileMissing(access === null);
          setUserAccess(access);
          setLoading(false);
        }
      } catch (error) {
        console.error('Ошибка загрузки настроек доступа:', error);
        if (mounted) {
          setAccessError(error instanceof Error ? error.message : 'Не удалось загрузить права доступа');
          setProfileMissing(false);
          setUserAccess(null);
          setLoading(false);
        }
      }
    };

    loadAccess();

    return () => {
      mounted = false;
    };
  }, [user, isAdmin, reloadKey]);

  // Проверка доступа к приложению
  const hasAccessToApp = (appId: 'equipment' | 'water'): boolean => {
    // Администраторы имеют доступ ко всем приложениям
    if (isAdmin) {
      return true;
    }

    // Для обычных пользователей проверяем настройки доступа
    if (!userAccess) {
      return false;
    }

    return userAccess[appId] === true;
  };

  // Фильтруем доступные приложения
  const availableApps = AVAILABLE_APPS.filter(app => hasAccessToApp(app.id));
  const menuView = menuAccessView({
    loading,
    accessError,
    profileMissing,
    appCount: availableApps.length,
  });

  const retryAccessLoad = (): void => {
    setLoading(true);
    setAccessError(null);
    setProfileMissing(false);
    setReloadKey(key => key + 1);
  };

  // Обработчик выхода
  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      await logout();
      navigate(ROUTES.LOGIN);
    } catch (error) {
      console.error('Ошибка при выходе:', error);
      setLoggingOut(false);
    }
  };

  return (
    <div className="main-menu-page">
      <div className="main-menu-container">
        {/* Заголовок */}
        <div className="main-menu-header">
          <h1 className="main-menu-title">Главное меню</h1>
          {user && (
            <div className="main-menu-user-info">
              <p className="main-menu-user-email">{user.email}</p>
              {user.name && (
                <p className="main-menu-user-name">{user.name}</p>
              )}
              <button
                className="main-menu-logout-link"
                onClick={handleLogout}
                disabled={loggingOut}
                type="button"
                aria-label="Выйти из системы"
              >
                {loggingOut ? 'Выход...' : 'Выйти из аккаунта'}
              </button>
            </div>
          )}
        </div>

        {/* Кнопки выбора приложения */}
        {menuView === 'loading' && (
          <div className="main-menu-loading">Загрузка...</div>
        )}
        {menuView === 'error' && (
          <div className="main-menu-no-access" role="alert">
            <p>Не удалось загрузить права доступа. Это не значит, что доступа нет.</p>
            <p>{accessError}</p>
            <button type="button" className="main-menu-retry" onClick={retryAccessLoad}>Повторить</button>
          </div>
        )}
        {menuView === 'profile-missing' && (
          <div className="main-menu-no-access" role="status">
            <p>Профиль не найден. Доступ закрыт, пока учётная запись не появится в системе.</p>
            <button type="button" className="main-menu-retry" onClick={retryAccessLoad}>Повторить</button>
          </div>
        )}
        {menuView === 'denied' && (
          <div className="main-menu-no-access">
            <p>У вас нет доступа ни к одному приложению.</p>
            <p>Обратитесь к администратору для получения доступа.</p>
          </div>
        )}
        {menuView === 'apps' && (
          <div className="main-menu-content">
            {availableApps.map(app => (
              <button
                key={app.id}
                className={`main-menu-button main-menu-button-${app.id}`}
                onClick={() => navigate(app.route)}
                type="button"
                aria-label={`Перейти к ${app.name}`}
              >
                <div className="main-menu-button-icon">
                  {app.id === 'equipment' ? '📋' : '💧'}
                </div>
                <div className="main-menu-button-text">
                  <span className="main-menu-button-title">{app.name}</span>
                  <span className="main-menu-button-subtitle">{app.description}</span>
                </div>
              </button>
            ))}

            {/* Административные функции */}
            {isAdmin && (
              <button
                className="main-menu-button main-menu-button-admin"
                onClick={() => setShowAdminModal(true)}
                type="button"
                aria-label="Администрирование"
              >
                <div className="main-menu-button-icon">
                  🔧
                </div>
                <div className="main-menu-button-text">
                  <span className="main-menu-button-title">Администрирование</span>
                  <span className="main-menu-button-subtitle">Настройки доступа, логи ошибок и активности, управление участками</span>
                </div>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Модальное окно администрирования */}
      {showAdminModal && (
        <AdminModal onClose={() => setShowAdminModal(false)} />
      )}
    </div>
  );
};

export default MainMenuPage;

