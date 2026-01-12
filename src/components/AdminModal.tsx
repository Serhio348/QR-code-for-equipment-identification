/**
 * Модальное окно администрирования
 * Позволяет выбрать между различными административными функциями
 */

import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../utils/routes';
import './AdminModal.css';

interface AdminModalProps {
  onClose: () => void;
}

const AdminModal: React.FC<AdminModalProps> = ({ onClose }) => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const stopPropagation = (event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  const handleNavigate = (route: string) => {
    onClose();
    navigate(route);
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="admin-modal" onClick={stopPropagation}>
        <div className="admin-modal__header">
          <h2>Администрирование</h2>
          <button
            className="admin-modal__close"
            onClick={onClose}
            aria-label="Закрыть окно администрирования"
            type="button"
          >
            ×
          </button>
        </div>
        <div className="admin-modal__content">
          <div className="admin-options">
            <button
              className="admin-option"
              onClick={() => handleNavigate(ROUTES.ACCESS_SETTINGS)}
              type="button"
            >
              <div className="admin-option-icon">⚙️</div>
              <div className="admin-option-text">
                <span className="admin-option-title">Настройки доступа</span>
                <span className="admin-option-subtitle">Управление доступом пользователей</span>
              </div>
            </button>

            <button
              className="admin-option"
              onClick={() => handleNavigate(ROUTES.ERROR_LOGS)}
              type="button"
            >
              <div className="admin-option-icon">📊</div>
              <div className="admin-option-text">
                <span className="admin-option-title">Логи ошибок</span>
                <span className="admin-option-subtitle">Мониторинг и анализ ошибок</span>
              </div>
            </button>

            <button
              className="admin-option"
              onClick={() => handleNavigate(ROUTES.WORKSHOP_SETTINGS)}
              type="button"
            >
              <div className="admin-option-icon">🏭</div>
              <div className="admin-option-text">
                <span className="admin-option-title">Управление участками</span>
                <span className="admin-option-subtitle">Добавление и редактирование участков</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminModal;
