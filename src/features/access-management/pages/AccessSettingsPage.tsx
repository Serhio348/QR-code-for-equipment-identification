/**
 * AccessSettingsPage.tsx
 * 
 * Страница настроек доступа к приложениям для администратора
 * Полная версия для десктопа, упрощенная для мобильных
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/contexts/AuthContext';
import { getAllUserAccess, updateUserAccess } from '../services/supabaseAccessApi';
import { AVAILABLE_APPS, type UserAppAccess, type AppId } from '../types/access';
import { ROUTES } from '../../../utils/routes';
import { showError, showSuccess } from '../../../utils/toast';
import LoadingSpinner from '../../common/components/LoadingSpinner';
import './AccessSettingsPage.css';

const AccessSettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAdmin, user } = useAuth();
  const [userAccessList, setUserAccessList] = useState<UserAppAccess[]>([]);
  const [selectedUserEmail, setSelectedUserEmail] = useState<string>('');
  const [selectedUserAccess, setSelectedUserAccess] = useState<UserAppAccess | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 10;

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
      setError(null);
      const accessList = await getAllUserAccess();
      setUserAccessList(accessList);
      
      // Если выбран пользователь, обновляем его данные
      if (selectedUserEmail) {
        const userAccess = accessList.find(access => access.email === selectedUserEmail);
        setSelectedUserAccess(userAccess || null);
      }
    } catch (err: any) {
      console.error('Ошибка загрузки настроек доступа:', err);
      setError(err.message || 'Не удалось загрузить настройки доступа');
    } finally {
      setLoading(false);
    }
  };

  // Обработка выбора пользователя (для мобильной версии)
  const handleUserSelect = (email: string) => {
    setSelectedUserEmail(email);
    const userAccess = userAccessList.find(access => access.email === email);
    setSelectedUserAccess(userAccess || null);
  };

  const handleToggleAccess = async (email: string, appId: AppId, currentValue: boolean) => {
    try {
      setSaving(prev => ({ ...prev, [email]: true }));
      
      await updateUserAccess({
        email,
        access: {
          [appId]: !currentValue,
        },
      });

      // Обновляем локальное состояние
      const updatedAccess = {
        ...userAccessList.find(a => a.email === email)!,
        [appId]: !currentValue,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.email,
      };
      
      setUserAccessList(prev =>
        prev.map(access =>
          access.email === email ? updatedAccess : access
        )
      );

      // Обновляем выбранного пользователя для мобильной версии
      if (selectedUserEmail === email) {
        setSelectedUserAccess(updatedAccess);
      }

      showSuccess('Доступ обновлен');
    } catch (err: any) {
      console.error('Ошибка обновления доступа:', err);
      showError(err);
    } finally {
      setSaving(prev => ({ ...prev, [email]: false }));
    }
  };

  // Фильтрация пользователей по поисковому запросу (для десктопа)
  const filteredUsers = useMemo(() => {
    return userAccessList.filter(access =>
      access.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (access.userId && access.userId.toLowerCase().includes(searchQuery.toLowerCase())) ||
      ((access as any).name && (access as any).name.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [userAccessList, searchQuery]);

  // Пагинация (для десктопа)
  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const paginatedUsers = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredUsers.slice(startIndex, endIndex);
  }, [filteredUsers, currentPage, itemsPerPage]);

  // Сброс страницы при изменении поискового запроса
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

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
          <h1>Настройки доступа к приложениям</h1>
          <p>Управление доступом пользователей к разделам системы</p>
        </div>

        {error && (
          <div className="error-message" role="alert">
            {error}
            <button onClick={loadUserAccess} className="retry-button">
              Повторить
            </button>
          </div>
        )}

        {/* Мобильная версия - выпадающий список */}
        <div className="mobile-only user-select-section">
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

        {/* Мобильная версия - информация о доступе */}
        {selectedUserAccess && (
          <div className="mobile-only user-access-info">
            <div className="user-access-header">
              <h2>Доступ пользователя: {selectedUserAccess.email}</h2>
              {(selectedUserAccess as any).name && (
                <p className="user-name">Имя: {(selectedUserAccess as any).name}</p>
              )}
            </div>

            <div className="access-permissions">
              {AVAILABLE_APPS.map(app => {
                const hasAccess = selectedUserAccess[app.id] === true;
                const isSaving = saving[selectedUserAccess.email] === true;
                
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
                        onChange={() => handleToggleAccess(selectedUserAccess.email, app.id, hasAccess)}
                        disabled={isSaving}
                      />
                      <span className={`toggle-slider ${hasAccess ? 'active' : ''}`}>
                        {isSaving ? '...' : hasAccess ? '✓' : '✗'}
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
          <div className="mobile-only no-user-selected">
            <p>Выберите пользователя из списка для просмотра и изменения его доступа</p>
          </div>
        )}

        {/* Десктопная версия - таблица */}
        <div className="desktop-only access-settings-controls">
          <div className="search-box">
            <input
              type="text"
              placeholder="Поиск по email или ID пользователя..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>
        </div>

        <div className="desktop-only access-settings-table-container">
          <table className="access-settings-table">
            <thead>
              <tr>
                <th>Пользователь</th>
                {AVAILABLE_APPS.map(app => (
                  <th key={app.id} className="app-header">
                    <div className="app-header-content">
                      <span className="app-name">{app.name}</span>
                      <span className="app-description">{app.description}</span>
                    </div>
                  </th>
                ))}
                <th>Обновлено</th>
              </tr>
            </thead>
            <tbody>
              {paginatedUsers.length === 0 ? (
                <tr>
                  <td colSpan={AVAILABLE_APPS.length + 2} className="no-data">
                    {searchQuery ? 'Пользователи не найдены' : 'Нет пользователей'}
                  </td>
                </tr>
              ) : (
                paginatedUsers.map(access => (
                  <tr key={access.email}>
                    <td className="user-info">
                      <div className="user-info-container">
                        <div className="user-name">
                          <span className="user-label">Имя:</span>
                          <span className="user-value">{(access as any).name || '—'}</span>
                        </div>
                        <div className="user-email">
                          <span className="user-label">Email:</span>
                          <span className="user-value">{access.email}</span>
                        </div>
                        <div className="user-id">
                          <span className="user-label">ID:</span>
                          <span className="user-value">{access.userId || '—'}</span>
                        </div>
                      </div>
                    </td>
                    {AVAILABLE_APPS.map(app => {
                      const hasAccess = access[app.id] === true;
                      const isSaving = saving[access.email] === true;
                      
                      return (
                        <td key={app.id} className="access-cell">
                          <label className="toggle-switch">
                            <input
                              type="checkbox"
                              checked={hasAccess}
                              onChange={() => handleToggleAccess(access.email, app.id, hasAccess)}
                              disabled={isSaving}
                            />
                            <span className={`toggle-slider ${hasAccess ? 'active' : ''}`}>
                              {isSaving ? '...' : hasAccess ? '✓' : '✗'}
                            </span>
                          </label>
                        </td>
                      );
                    })}
                    <td className="updated-info">
                      {access.updatedAt && (
                        <div>
                          <div>{new Date(access.updatedAt).toLocaleDateString('ru-RU')}</div>
                          <div className="updated-time">
                            {new Date(access.updatedAt).toLocaleTimeString('ru-RU', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                          {access.updatedBy && (
                            <div className="updated-by">by {access.updatedBy}</div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Пагинация для десктопа */}
        {totalPages > 1 && (
          <div className="desktop-only pagination">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="pagination-button"
            >
              ← Назад
            </button>
            <span className="pagination-info">
              Страница {currentPage} из {totalPages} (всего: {filteredUsers.length})
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="pagination-button"
            >
              Вперед →
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AccessSettingsPage;
