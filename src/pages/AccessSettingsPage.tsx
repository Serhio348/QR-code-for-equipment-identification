/**
 * AccessSettingsPage.tsx
 * 
 * Страница настроек доступа к приложениям для администратора
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAllUserAccess, updateUserAccess } from '../services/api/accessApi';
import { AVAILABLE_APPS, type UserAppAccess, type AppId } from '../types/access';
import { ROUTES } from '../utils/routes';
import LoadingSpinner from '../components/LoadingSpinner';
import './AccessSettingsPage.css';

const AccessSettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAdmin, user } = useAuth();
  const [userAccessList, setUserAccessList] = useState<UserAppAccess[]>([]);
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
    } catch (err: any) {
      console.error('Ошибка загрузки настроек доступа:', err);
      setError(err.message || 'Не удалось загрузить настройки доступа');
    } finally {
      setLoading(false);
    }
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
      setUserAccessList(prev =>
        prev.map(access =>
          access.email === email
            ? { ...access, [appId]: !currentValue, updatedAt: new Date().toISOString(), updatedBy: user?.email }
            : access
        )
      );
    } catch (err: any) {
      console.error('Ошибка обновления доступа:', err);
      alert(err.message || 'Не удалось обновить настройки доступа');
    } finally {
      setSaving(prev => ({ ...prev, [email]: false }));
    }
  };

  // Фильтрация пользователей по поисковому запросу
  const filteredUsers = useMemo(() => {
    return userAccessList.filter(access =>
      access.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (access.userId && access.userId.toLowerCase().includes(searchQuery.toLowerCase())) ||
      ((access as any).name && (access as any).name.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [userAccessList, searchQuery]);

  // Пагинация
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

        <div className="access-settings-controls">
          <div className="search-box">
            <input
              type="text"
              placeholder="Поиск по email или ID пользователя..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>
          <button onClick={loadUserAccess} className="refresh-button" disabled={loading}>
            🔄 Обновить
          </button>
        </div>

        <div className="access-settings-table-container">
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

        {/* Пагинация */}
        {totalPages > 1 && (
          <div className="pagination">
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

        <div className="access-settings-footer">
          <button onClick={() => navigate(ROUTES.HOME)} className="back-button">
            ← Назад к главному меню
          </button>
        </div>
      </div>
    </div>
  );
};

export default AccessSettingsPage;

