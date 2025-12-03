/**
 * PWAMenu.tsx
 * 
 * Главное меню для обычных пользователей в PWA режиме
 * Показывает только кнопку "Оборудование" для сканирования QR-кода
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ROUTES } from '../../utils/routes';
import './PWAMenu.css';

interface PWAMenuProps {
  onScanQR: () => void;
}

const PWAMenu: React.FC<PWAMenuProps> = ({ onScanQR }) => {
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

        {/* Основная кнопка "Оборудование" */}
        <div className="pwa-menu-content">
          <button
            className="pwa-menu-equipment-button"
            onClick={onScanQR}
            type="button"
            aria-label="Открыть сканер QR-кода для оборудования"
          >
            <div className="pwa-menu-button-icon">
              📱
            </div>
            <div className="pwa-menu-button-text">
              <span className="pwa-menu-button-title">Оборудование</span>
              <span className="pwa-menu-button-subtitle">Сканировать QR-код</span>
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

