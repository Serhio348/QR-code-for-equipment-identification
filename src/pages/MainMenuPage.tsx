/**
 * Главное меню приложения
 * Позволяет выбрать между приложением "Оборудование" и "Вода"
 * Показывает только те приложения, к которым у пользователя есть доступ
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getUserAccess } from '../services/api/supabaseAccessApi';
import { AVAILABLE_APPS, type UserAppAccess } from '../types/access';
import { ROUTES } from '../utils/routes';
import { clearLastPath } from '../utils/pathStorage';
import './MainMenuPage.css';

const MainMenuPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAdmin, logout } = useAuth();
  const [userAccess, setUserAccess] = useState<UserAppAccess | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loggingOut, setLoggingOut] = useState<boolean>(false);

  // Очищаем сохраненный путь при переходе в главное меню
  useEffect(() => {
    clearLastPath();
  }, []);

  // Загрузка настроек доступа для обычных пользователей
  useEffect(() => {
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
        setUserAccess(access);
      } catch (error) {
        console.error('Ошибка загрузки настроек доступа:', error);
      } finally {
        setLoading(false);
      }
    };

    loadAccess();
  }, [user, isAdmin]);

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
        {loading ? (
          <div className="main-menu-loading">Загрузка...</div>
        ) : availableApps.length === 0 ? (
          <div className="main-menu-no-access">
            <p>У вас нет доступа ни к одному приложению.</p>
            <p>Обратитесь к администратору для получения доступа.</p>
          </div>
        ) : (
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

            {/* Кнопка настроек доступа для администраторов */}
            {isAdmin && (
              <button
                className="main-menu-button main-menu-button-settings"
                onClick={() => navigate(ROUTES.ACCESS_SETTINGS)}
                type="button"
                aria-label="Настройки доступа"
              >
                <div className="main-menu-button-icon">
                  ⚙️
                </div>
                <div className="main-menu-button-text">
                  <span className="main-menu-button-title">Настройки доступа</span>
                  <span className="main-menu-button-subtitle">Управление доступом пользователей</span>
                </div>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MainMenuPage;

