/**
 * Страница активных оповещений о превышении нормативов качества воды
 * Отображает список оповещений с возможностью фильтрации и управления статусами
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { getAllAlerts, updateAlertStatus } from '../services';
import { ROUTES } from '@/shared/utils/routes';
import type {
  WaterQualityAlert,
  AlertStatus,
  AlertType,
  AlertPriority,
  WaterQualityParameter,
} from '../types/waterQuality';
import { PARAMETER_METADATA } from '../types/waterQuality';
import './WaterQualityAlertsPage.css';

const WaterQualityAlertsPage: React.FC = () => {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<WaterQualityAlert[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(false);

  // Фильтры
  const [statusFilter, setStatusFilter] = useState<AlertStatus | 'all'>('active');
  const [typeFilter, setTypeFilter] = useState<AlertType | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<AlertPriority | 'all'>('all');
  const [parameterFilter, setParameterFilter] = useState<WaterQualityParameter | 'all'>('all');

  // Пагинация
  const [currentPage, setCurrentPage] = useState<number>(0);
  const pageSize = 50;

  const loadAlerts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const filters: {
        status?: AlertStatus;
        alertType?: AlertType;
        priority?: AlertPriority;
        parameterName?: WaterQualityParameter;
      } = {
        ...(statusFilter !== 'all' && { status: statusFilter }),
        ...(typeFilter !== 'all' && { alertType: typeFilter }),
        ...(priorityFilter !== 'all' && { priority: priorityFilter }),
        ...(parameterFilter !== 'all' && { parameterName: parameterFilter }),
      };

      const result = await getAllAlerts(filters, {
        limit: pageSize,
        offset: currentPage * pageSize,
      });

      setAlerts(result.data);
      setTotal(result.total);
      setHasMore(result.hasMore);
    } catch (err: any) {
      console.error('[WaterQualityAlertsPage] Ошибка загрузки оповещений:', err);
      setError(err.message || 'Не удалось загрузить оповещения');
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, priorityFilter, parameterFilter, currentPage]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  const handleStatusChange = async (alertId: string, newStatus: AlertStatus) => {
    try {
      await updateAlertStatus(alertId, newStatus);
      toast.success('Статус оповещения обновлен');
      loadAlerts(); // Перезагружаем список
    } catch (err: any) {
      console.error('[WaterQualityAlertsPage] Ошибка обновления статуса:', err);
      toast.error(err.message || 'Не удалось обновить статус');
    }
  };

  const handleViewAnalysis = (analysisId: string) => {
    navigate(ROUTES.WATER_QUALITY_ANALYSIS_VIEW(analysisId));
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('ru-RU', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  const getTypeLabel = (type: AlertType): string => {
    const labels: Record<AlertType, string> = {
      warning: 'Предупреждение',
      exceeded: 'Превышение',
      deviation: 'Отклонение',
    };
    return labels[type] || type;
  };

  const getPriorityLabel = (priority: AlertPriority): string => {
    const labels: Record<AlertPriority, string> = {
      low: 'Низкий',
      medium: 'Средний',
      high: 'Высокий',
      critical: 'Критический',
    };
    return labels[priority] || priority;
  };

  const getStatusLabel = (status: AlertStatus): string => {
    const labels: Record<AlertStatus, string> = {
      active: 'Активно',
      acknowledged: 'Принято',
      resolved: 'Решено',
      dismissed: 'Отклонено',
    };
    return labels[status] || status;
  };

  const getTypeClass = (type: AlertType): string => {
    return `alert-type-${type}`;
  };

  const getPriorityClass = (priority: AlertPriority): string => {
    return `alert-priority-${priority}`;
  };

  const getStatusClass = (status: AlertStatus): string => {
    return `alert-status-${status}`;
  };

  const handleClearFilters = () => {
    setStatusFilter('active');
    setTypeFilter('all');
    setPriorityFilter('all');
    setParameterFilter('all');
    setCurrentPage(0);
  };

  const handleBack = () => {
    navigate(ROUTES.WATER_QUALITY_JOURNAL);
  };

  return (
    <div className="water-quality-alerts">
      <div className="alerts-header">
        <div className="alerts-header-top">
          <button className="back-button" onClick={handleBack} type="button">
            ← Назад к журналу
          </button>
          <h2 className="alerts-title">Оповещения о превышении нормативов</h2>
        </div>
        <div className="alerts-stats">
          Всего: {total} | Активных: {alerts.filter((a) => a.status === 'active').length}
        </div>
      </div>

      {/* Фильтры */}
      <div className="alerts-filters">
        <div className="filter-group">
          <label>Статус:</label>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as AlertStatus | 'all');
              setCurrentPage(0);
            }}
          >
            <option value="all">Все статусы</option>
            <option value="active">Активно</option>
            <option value="acknowledged">Принято</option>
            <option value="resolved">Решено</option>
            <option value="dismissed">Отклонено</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Тип:</label>
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value as AlertType | 'all');
              setCurrentPage(0);
            }}
          >
            <option value="all">Все типы</option>
            <option value="warning">Предупреждение</option>
            <option value="exceeded">Превышение</option>
            <option value="deviation">Отклонение</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Приоритет:</label>
          <select
            value={priorityFilter}
            onChange={(e) => {
              setPriorityFilter(e.target.value as AlertPriority | 'all');
              setCurrentPage(0);
            }}
          >
            <option value="all">Все приоритеты</option>
            <option value="low">Низкий</option>
            <option value="medium">Средний</option>
            <option value="high">Высокий</option>
            <option value="critical">Критический</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Параметр:</label>
          <select
            value={parameterFilter}
            onChange={(e) => {
              setParameterFilter(e.target.value as WaterQualityParameter | 'all');
              setCurrentPage(0);
            }}
          >
            <option value="all">Все параметры</option>
            {Object.entries(PARAMETER_METADATA).map(([key, meta]) => (
              <option key={key} value={key}>
                {meta.label}
              </option>
            ))}
          </select>
        </div>

        <button className="clear-filters-button" onClick={handleClearFilters} type="button">
          Сбросить фильтры
        </button>
      </div>

      {/* Список оповещений */}
      <div className="alerts-content">
        {loading && <div className="loading-message">Загрузка оповещений...</div>}

        {error && (
          <div className="error-message">
            <span className="error-icon">⚠</span> {error}
          </div>
        )}

        {!loading && !error && alerts.length === 0 && (
          <div className="empty-state">
            <p className="empty-state-text">Оповещения не найдены</p>
            <p className="empty-state-note">
              {statusFilter !== 'all' || typeFilter !== 'all' || priorityFilter !== 'all' || parameterFilter !== 'all'
                ? 'Попробуйте изменить фильтры'
                : 'Активных оповещений нет'}
            </p>
          </div>
        )}

        {!loading && !error && alerts.length > 0 && (
          <>
            <div className="alerts-table-container">
              <table className="alerts-table">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Параметр</th>
                    <th>Тип</th>
                    <th>Приоритет</th>
                    <th>Статус</th>
                    <th>Значение</th>
                    <th>Норматив</th>
                    <th>Отклонение</th>
                    <th>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((alert) => {
                    const metadata = PARAMETER_METADATA[alert.parameterName];
                    return (
                      <tr key={alert.id} className={`alert-row priority-${alert.priority}`}>
                        <td>{formatDate(alert.createdAt)}</td>
                        <td>
                          <strong>{metadata?.label || alert.parameterName}</strong>
                        </td>
                        <td>
                          <span className={`alert-badge ${getTypeClass(alert.alertType)}`}>
                            {getTypeLabel(alert.alertType)}
                          </span>
                        </td>
                        <td>
                          <span className={`alert-badge ${getPriorityClass(alert.priority)}`}>
                            {getPriorityLabel(alert.priority)}
                          </span>
                        </td>
                        <td>
                          <span className={`alert-badge ${getStatusClass(alert.status)}`}>
                            {getStatusLabel(alert.status)}
                          </span>
                        </td>
                        <td className="value-cell">
                          {alert.value} {alert.unit}
                        </td>
                        <td className="norm-cell">
                          {alert.thresholdValue ? `${alert.thresholdValue} ${alert.unit}` : '-'}
                        </td>
                        <td className="deviation-cell">
                          {alert.deviationPercent !== null && alert.deviationPercent !== undefined
                            ? `${alert.deviationPercent > 0 ? '+' : ''}${alert.deviationPercent.toFixed(1)}%`
                            : '-'}
                        </td>
                        <td>
                          <div className="alert-actions">
                            {alert.analysisId && (
                              <button
                                className="view-button"
                                onClick={() => handleViewAnalysis(alert.analysisId!)}
                                type="button"
                              >
                                Анализ
                              </button>
                            )}
                            {alert.status === 'active' && (
                              <>
                                <button
                                  className="acknowledge-button"
                                  onClick={() => handleStatusChange(alert.id, 'acknowledged')}
                                  type="button"
                                >
                                  Принять
                                </button>
                                <button
                                  className="resolve-button"
                                  onClick={() => handleStatusChange(alert.id, 'resolved')}
                                  type="button"
                                >
                                  Решить
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Пагинация */}
            {total > pageSize && (
              <div className="pagination">
                <button
                  className="pagination-button"
                  onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                  disabled={currentPage === 0}
                  type="button"
                >
                  ← Назад
                </button>
                <span className="pagination-info">
                  Страница {currentPage + 1} из {Math.ceil(total / pageSize)} ({total} записей)
                </span>
                <button
                  className="pagination-button"
                  onClick={() => setCurrentPage((p) => p + 1)}
                  disabled={!hasMore}
                  type="button"
                >
                  Вперед →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default WaterQualityAlertsPage;
