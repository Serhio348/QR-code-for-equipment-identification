/**
 * AccessSettingsPage.tsx
 * 
 * Страница настроек доступа к приложениям для администратора
 * Упрощенная версия для мобильных устройств
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAllUserAccess, updateUserAccess } from '../services/api/supabaseAccessApi';
import { AVAILABLE_APPS, type UserAppAccess, type AppId } from '../types/access';
import { ROUTES } from '../utils/routes';
import { showError, showSuccess } from '../utils/toast';
import LoadingSpinner from '../components/LoadingSpinner';
import './AccessSettingsPage.css';

const AccessSettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAdmin, user } = useAuth();
  const [userAccessList, setUserAccessList] = useState<UserAppAccess[]>([]);
  const [selectedUserEmail, setSelectedUserEmail] = useState<string>('');
  const [selectedUserAccess, setSelectedUserAccess] = useState<UserAppAccess | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  // Загрузка данных при монтировании
  useEffect(() => {
    if (!isAdmin) {
      navigate(ROUTES.HOME);
      return;
    }
    loadUserAccess();
  }, [isAdmin, navigate]);

  const loadUserAccess = async () => {
    try {
      setLoading(true);
      const accessList = await getAllUserAccess();
      setUserAccessList(accessList);
      
      // Если выбран пользователь, обновляем его данные
      if (selectedUserEmail) {
        const userAccess = accessList.find(access => access.email === selectedUserEmail);
        setSelectedUserAccess(userAccess || null);
      }
    } catch (err: any) {
      showError(err);
    } finally {
      setLoading(false);
    }
  };

  // Обработка выбора пользователя
  const handleUserSelect = (email: string) => {
    setSelectedUserEmail(email);
    const userAccess = userAccessList.find(access => access.email === email);
    setSelectedUserAccess(userAccess || null);
  };

  // Обработка изменения доступа
  const handleToggleAccess = async (appId: AppId, currentValue: boolean) => {
    if (!selectedUserEmail) return;

    try {
      setSaving(true);
      
      await updateUserAccess({
        email: selectedUserEmail,
        access: {
          [appId]: !currentValue,
        },
      });

      // Обновляем локальное состояние
      const updatedAccess = {
        ...selectedUserAccess!,
        [appId]: !currentValue,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.email,
      };
      setSelectedUserAccess(updatedAccess);

      // Обновляем в списке
      setUserAccessList(prev =>
        prev.map(access =>
          access.email === selectedUserEmail ? updatedAccess : access
        )
      );

      showSuccess('Доступ обновлен');
    } catch (err: any) {
      showError(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingSpinner fullScreen text="Загрузка настроек доступа..." />;
  }

  return (
    <div className="access-settings-page">
      <div className="access-settings-container">
        <div className="access-settings-header">
          <div className="access-settings-header-top">
            <button
              onClick={() => navigate(ROUTES.HOME)}
              className="back-button"
              type="button"
              aria-label="Вернуться в главное меню"
            >
              ← Назад к главному меню
            </button>
          </div>
          <h1>Настройки доступа</h1>
          <p>Управление доступом пользователей к разделам системы</p>
        </div>

        {/* Выбор пользователя */}
        <div className="user-select-section">
          <label htmlFor="user-select" className="user-select-label">
            Выберите пользователя:
          </label>
          <select
            id="user-select"
            value={selectedUserEmail}
            onChange={(e) => handleUserSelect(e.target.value)}
            className="user-select"
          >
            <option value="">-- Выберите пользователя --</option>
            {userAccessList.map(access => (
              <option key={access.email} value={access.email}>
                {access.email} {((access as any).name ? `(${(access as any).name})` : '')}
              </option>
            ))}
          </select>
        </div>

        {/* Информация о доступе выбранного пользователя */}
        {selectedUserAccess && (
          <div className="user-access-info">
            <div className="user-access-header">
              <h2>Доступ пользователя: {selectedUserAccess.email}</h2>
              {(selectedUserAccess as any).name && (
                <p className="user-name">Имя: {(selectedUserAccess as any).name}</p>
              )}
            </div>

            <div className="access-permissions">
              {AVAILABLE_APPS.map(app => {
                const hasAccess = selectedUserAccess[app.id] === true;
                
                return (
                  <div key={app.id} className="permission-item">
                    <div className="permission-info">
                      <div className="permission-app-name">{app.name}</div>
                      <div className="permission-app-description">{app.description}</div>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={hasAccess}
                        onChange={() => handleToggleAccess(app.id, hasAccess)}
                        disabled={saving}
                      />
                      <span className={`toggle-slider ${hasAccess ? 'active' : ''}`}>
                        {saving ? '...' : hasAccess ? '✓' : '✗'}
                      </span>
                    </label>
                  </div>
                );
              })}
            </div>

            {selectedUserAccess.updatedAt && (
              <div className="user-access-footer">
                <div className="updated-info">
                  <span>Обновлено: {new Date(selectedUserAccess.updatedAt).toLocaleString('ru-RU')}</span>
                  {selectedUserAccess.updatedBy && (
                    <span>Администратором: {selectedUserAccess.updatedBy}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {!selectedUserEmail && (
          <div className="no-user-selected">
            <p>Выберите пользователя из списка для просмотра и изменения его доступа</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AccessSettingsPage;
