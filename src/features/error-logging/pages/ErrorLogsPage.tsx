/**
 * ErrorLogsPage.tsx
 * 
 * Страница просмотра логов ошибок
 * Доступна только администраторам
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getErrorLogs,
  getErrorStatistics,
  getUnresolvedErrorsCount,
  markErrorAsResolved,
  markErrorAsUnresolved,
  type ErrorLog,
  type ErrorLogFilters,
} from '../services/errorLogsApi';
import { showError, showSuccess } from '@/shared/utils/toast';
import { ROUTES } from '@/shared/utils/routes';
import LoadingSpinner from '../../common/components/LoadingSpinner';
import './ErrorLogsPage.css';

export default function ErrorLogsPage() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<ErrorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [statistics, setStatistics] = useState<any>(null);
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  const [filters, setFilters] = useState<ErrorLogFilters>({
    resolved: false, // По умолчанию показываем нерешенные
  });
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [daysBack, setDaysBack] = useState(7);

  const limit = 50;

  // Загрузка логов
  const loadLogs = async () => {
    try {
      setLoading(true);
      const result = await getErrorLogs(filters, limit, page * limit);
      setLogs(result.data);
      setTotalCount(result.count);
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  };

  // Загрузка статистики
  const loadStatistics = async () => {
    try {
      const stats = await getErrorStatistics(daysBack);
      setStatistics(stats);
    } catch (error) {
      console.error('Failed to load statistics:', error);
    }
  };

  // Загрузка количества нерешенных ошибок
  const loadUnresolvedCount = async () => {
    try {
      const count = await getUnresolvedErrorsCount();
      setUnresolvedCount(count);
    } catch (error) {
      console.error('Failed to load unresolved count:', error);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [filters, page]);

  useEffect(() => {
    loadStatistics();
    loadUnresolvedCount();
  }, [daysBack]);

  const handleResolveToggle = async (logId: string, resolved: boolean) => {
    try {
      if (resolved) {
        await markErrorAsResolved(logId);
        showSuccess('Ошибка помечена как решенная');
      } else {
        await markErrorAsUnresolved(logId);
        showSuccess('Ошибка помечена как нерешенная');
      }
      await loadLogs();
      await loadUnresolvedCount();
    } catch (error) {
      showError(error);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('ru-RU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return '#dc2626'; // red
      case 'high':
        return '#ea580c'; // orange
      case 'medium':
        return '#f59e0b'; // yellow
      case 'low':
        return '#10b981'; // green
      default:
        return '#6b7280'; // gray
    }
  };

  if (loading && logs.length === 0) {
    return <LoadingSpinner fullScreen text="Загрузка логов..." />;
  }

  return (
    <div className="error-logs-page">
      <div className="error-logs-container">
        <div className="error-logs-header">
          <div className="error-logs-header-top">
            <button
              onClick={() => navigate(ROUTES.HOME)}
              className="back-button"
              type="button"
              aria-label="Вернуться в главное меню"
            >
              ← Назад к главному меню
            </button>
          </div>
          <h1>Логи ошибок</h1>
          <p>Мониторинг и анализ ошибок приложения</p>
        </div>

        {/* Статистика - полная версия для десктопа, упрощенная для мобильных */}
        {statistics && (
          <div className="error-logs-statistics">
            <div className="stat-card">
              <div className="stat-label">Всего ошибок</div>
              <div className="stat-value">{statistics.total_errors}</div>
              <div className="stat-period">за {daysBack} дней</div>
            </div>
            <div className="stat-card critical desktop-only">
              <div className="stat-label">Критичные</div>
              <div className="stat-value">{statistics.critical_errors}</div>
            </div>
            <div className="stat-card high desktop-only">
              <div className="stat-label">Высокие</div>
              <div className="stat-value">{statistics.high_errors}</div>
            </div>
            <div className="stat-card medium desktop-only">
              <div className="stat-label">Средние</div>
              <div className="stat-value">{statistics.medium_errors}</div>
            </div>
            <div className="stat-card low desktop-only">
              <div className="stat-label">Низкие</div>
              <div className="stat-value">{statistics.low_errors}</div>
            </div>
            <div className="stat-card unresolved">
              <div className="stat-label">Активные</div>
              <div className="stat-value">{unresolvedCount}</div>
            </div>
            <div className="stat-card resolved mobile-only">
              <div className="stat-label">Решенные</div>
              <div className="stat-value">{statistics.total_errors - unresolvedCount}</div>
            </div>
          </div>
        )}

        {/* Фильтры - полная версия для десктопа, упрощенная для мобильных */}
        <div className="error-logs-filters">
          <div className="filter-group filter-group-inline">
            <label>Показать:</label>
            <select
              value={filters.resolved === undefined ? 'all' : filters.resolved ? 'resolved' : 'unresolved'}
              onChange={(e) => {
                const value = e.target.value;
                setFilters({
                  ...filters,
                  resolved: value === 'all' ? undefined : value === 'resolved',
                });
                setPage(0);
              }}
            >
              <option value="all">Все ошибки</option>
              <option value="unresolved">Только активные (нерешенные)</option>
              <option value="resolved">Только неактивные (решенные)</option>
            </select>
          </div>

          {/* Дополнительные фильтры только для десктопа */}
          <div className="filter-group desktop-only">
            <label>Уровень серьезности:</label>
            <select
              value={filters.severity || 'all'}
              onChange={(e) => {
                setFilters({
                  ...filters,
                  severity: e.target.value === 'all' ? undefined : e.target.value as any,
                });
                setPage(0);
              }}
            >
              <option value="all">Все</option>
              <option value="critical">Критичные</option>
              <option value="high">Высокие</option>
              <option value="medium">Средние</option>
              <option value="low">Низкие</option>
            </select>
          </div>

          <div className="filter-group desktop-only">
            <label>Период статистики:</label>
            <select
              value={daysBack}
              onChange={(e) => setDaysBack(Number(e.target.value))}
            >
              <option value={1}>1 день</option>
              <option value={7}>7 дней</option>
              <option value={30}>30 дней</option>
              <option value={90}>90 дней</option>
            </select>
          </div>
        </div>

        {/* Таблица логов */}
        <div className="error-logs-table-container">
          {logs.length === 0 ? (
            <div className="no-logs">Логи не найдены</div>
          ) : (
            <table className="error-logs-table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th className="desktop-only">Уровень</th>
                  <th>Сообщение</th>
                  <th className="desktop-only">Пользователь</th>
                  <th>Статус</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <React.Fragment key={log.id}>
                    <tr className={log.resolved ? 'resolved' : ''}>
                      <td>{formatDate(log.created_at)}</td>
                      <td className="desktop-only">
                        <span
                          className="severity-badge"
                          style={{ backgroundColor: getSeverityColor(log.severity) }}
                        >
                          {log.severity}
                        </span>
                      </td>
                      <td>
                        <div className="error-message-cell">
                          <div className="error-message-main">
                            {log.user_message || log.error_message}
                          </div>
                          {log.error_code && (
                            <div className="error-code">{log.error_code}</div>
                          )}
                        </div>
                      </td>
                      <td className="desktop-only">{log.user_email || 'Система'}</td>
                      <td>
                        <span className={`status-badge ${log.resolved ? 'resolved' : 'unresolved'}`}>
                          {log.resolved ? 'Решена' : 'Нерешена'}
                        </span>
                      </td>
                      <td>
                        <div className="log-actions">
                          <button
                            className="action-button"
                            onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                          >
                            {expandedLogId === log.id ? 'Скрыть' : 'Детали'}
                          </button>
                          <button
                            className="action-button"
                            onClick={() => handleResolveToggle(log.id, !log.resolved)}
                          >
                            {log.resolved ? 'Открыть' : 'Решить'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedLogId === log.id && (
                      <tr className="expanded-row">
                        <td colSpan={6}>
                          <div className="log-details">
                            <div className="detail-section">
                              <h4>Техническое сообщение:</h4>
                              <pre>{log.error_message}</pre>
                            </div>
                            {log.stack_trace && (
                              <div className="detail-section">
                                <h4>Stack trace:</h4>
                                <pre>{log.stack_trace}</pre>
                              </div>
                            )}
                            {log.context && (
                              <div className="detail-section">
                                <h4>Контекст:</h4>
                                <pre>{JSON.stringify(log.context, null, 2)}</pre>
                              </div>
                            )}
                            {log.url && (
                              <div className="detail-section">
                                <h4>URL:</h4>
                                <div>{log.url}</div>
                              </div>
                            )}
                            {log.user_agent && (
                              <div className="detail-section">
                                <h4>User Agent:</h4>
                                <div>{log.user_agent}</div>
                              </div>
                            )}
                            {log.resolved_at && (
                              <div className="detail-section">
                                <h4>Решена:</h4>
                                <div>{formatDate(log.resolved_at)}</div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Пагинация */}
        {totalCount > limit && (
          <div className="error-logs-pagination">
            <button
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              Назад
            </button>
            <span>
              Страница {page + 1} из {Math.ceil(totalCount / limit)}
            </span>
            <button
              disabled={(page + 1) * limit >= totalCount}
              onClick={() => setPage(page + 1)}
            >
              Вперед
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
