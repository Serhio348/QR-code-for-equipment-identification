/**
 * PWAMenu.tsx
 * 
 * Главное меню для обычных пользователей в PWA режиме
 * Показывает кнопку "Оборудование" для просмотра списка оборудования
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ROUTES } from '../../utils/routes';
import './PWAMenu.css';

const PWAMenu: React.FC = () => {
  const { user, logout, loading } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate(ROUTES.LOGIN);
    } catch (error) {
      console.error('Ошибка при выходе:', error);
    }
  };

  return (
    <div className="pwa-menu">
      <div className="pwa-menu-container">
        {/* Заголовок с информацией о пользователе */}
        <div className="pwa-menu-header">
          <h1 className="pwa-menu-title">Добро пожаловать</h1>
          {user && (
            <div className="pwa-menu-user-info">
              <p className="pwa-menu-user-email">{user.email}</p>
              {user.name && (
                <p className="pwa-menu-user-name">{user.name}</p>
              )}
            </div>
          )}
        </div>

        {/* Кнопки выбора приложения */}
        <div className="pwa-menu-content">
          <button
            className="pwa-menu-equipment-button"
            onClick={() => navigate(ROUTES.EQUIPMENT)}
            type="button"
            aria-label="Перейти к оборудованию"
          >
            <div className="pwa-menu-button-icon">
              📋
            </div>
            <div className="pwa-menu-button-text">
              <span className="pwa-menu-button-title">Оборудование</span>
              <span className="pwa-menu-button-subtitle">Управление оборудованием по QR-кодам</span>
            </div>
          </button>

          <button
            className="pwa-menu-water-button"
            onClick={() => navigate(ROUTES.WATER)}
            type="button"
            aria-label="Перейти к счётчикам воды"
          >
            <div className="pwa-menu-button-icon">
              💧
            </div>
            <div className="pwa-menu-button-text">
              <span className="pwa-menu-button-title">Вода</span>
              <span className="pwa-menu-button-subtitle">Счётчики воды</span>
            </div>
          </button>
        </div>

        {/* Кнопка выхода */}
        <div className="pwa-menu-footer">
          <button
            className="pwa-menu-logout-button"
            onClick={handleLogout}
            disabled={loading}
            type="button"
          >
            {loading ? (
              <>
                <span className="pwa-menu-button-spinner"></span>
                Выход...
              </>
            ) : (
              'Выйти'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PWAMenu;

