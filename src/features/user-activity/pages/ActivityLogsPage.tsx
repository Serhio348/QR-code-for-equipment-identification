/**
 * Страница просмотра логов активности пользователей (только для администраторов)
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '../../../shared/utils/routes';
import {
  getActivityLogs,
  getActivityStatistics,
  exportActivityLogsToCSV,
  cleanupOldActivityLogs,
  deleteLogsForToday,
  deleteLogsForMonth,
  deleteAllLogs,
  testActivityLogging,
} from '../services/activityLogsApi';
import {
  ActivityLog,
  ActivityLogFilters,
  ActivityStatistics,
  ActivityType,
  EntityType,
} from '../types/activityLog';
import './ActivityLogsPage.css';

/**
 * Маппинг типов активности на русские названия
 */
const activityTypeLabels: Record<ActivityType, string> = {
  chat_message: 'Сообщение в чат',
  qr_code_scan: 'Сканирование QR-кода',
  equipment_view: 'Просмотр оборудования',
  equipment_list_view: 'Просмотр списка оборудования',
  equipment_create: 'Создание оборудования',
  equipment_update: 'Обновление оборудования',
  equipment_delete: 'Удаление оборудования',
  equipment_search: 'Поиск оборудования',
  equipment_filter: 'Фильтрация оборудования',
  equipment_export_pdf: 'Экспорт в PDF',
  maintenance_add: 'Добавление записи ТО',
  maintenance_update: 'Обновление записи ТО',
  maintenance_delete: 'Удаление записи ТО',
  maintenance_log_open: 'Открытие журнала ТО',
  file_upload: 'Загрузка файла',
  file_view: 'Просмотр файла',
  folder_open: 'Открытие папки',
  documentation_open: 'Открытие документации',
  login: 'Вход в систему',
  logout: 'Выход из системы',
  user_register: 'Регистрация пользователя',
  other: 'Другое',
};

/**
 * Маппинг типов сущностей на русские названия
 */
const entityTypeLabels: Record<EntityType, string> = {
  equipment: 'Оборудование',
  maintenance_entry: 'Запись ТО',
  file: 'Файл',
  chat: 'Чат',
  user: 'Пользователь',
  other: 'Другое',
};

const ActivityLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [statistics, setStatistics] = useState<ActivityStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Фильтры
  const [filters, setFilters] = useState<ActivityLogFilters>({});
  const [userEmailFilter, setUserEmailFilter] = useState('');
  const [activityTypeFilter, setActivityTypeFilter] = useState<ActivityType | ''>('');
  const [entityTypeFilter, setEntityTypeFilter] = useState<EntityType | ''>('');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');

  // Пагинация
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const logsPerPage = 50;

  // Загрузка данных
  useEffect(() => {
    loadData();
  }, [filters, currentPage]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const offset = (currentPage - 1) * logsPerPage;

      // Загружаем логи и статистику параллельно
      const [logsResult, stats] = await Promise.all([
        getActivityLogs(filters, logsPerPage, offset),
        getActivityStatistics(filters),
      ]);

      setLogs(logsResult.data);
      setTotalCount(logsResult.count);
      setStatistics(stats);
    } catch (err) {
      console.error('Failed to load activity logs:', err);
      setError('Не удалось загрузить логи активности');
    } finally {
      setLoading(false);
    }
  };

  // Применение фильтров
  const applyFilters = () => {
    const newFilters: ActivityLogFilters = {};

    if (userEmailFilter.trim()) {
      newFilters.userEmail = userEmailFilter.trim();
    }

    if (activityTypeFilter) {
      newFilters.activityType = activityTypeFilter;
    }

    if (entityTypeFilter) {
      newFilters.entityType = entityTypeFilter;
    }

    if (startDateFilter) {
      newFilters.startDate = new Date(startDateFilter).toISOString();
    }

    if (endDateFilter) {
      newFilters.endDate = new Date(endDateFilter).toISOString();
    }

    setFilters(newFilters);
    setCurrentPage(1);
  };

  // Сброс фильтров
  const resetFilters = () => {
    setUserEmailFilter('');
    setActivityTypeFilter('');
    setEntityTypeFilter('');
    setStartDateFilter('');
    setEndDateFilter('');
    setFilters({});
    setCurrentPage(1);
  };

  // Экспорт в CSV
  const handleExport = async () => {
    try {
      const csvContent = await exportActivityLogsToCSV(filters);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `activity_logs_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
    } catch (err) {
      console.error('Failed to export logs:', err);
      alert('Не удалось экспортировать логи');
    }
  };

  // Состояние для выпадающего меню очистки
  const [showCleanupMenu, setShowCleanupMenu] = useState(false);

  // Удаление логов за сегодня
  const handleDeleteToday = async () => {
    setShowCleanupMenu(false);
    if (!confirm('Удалить все логи за сегодняшний день? Это действие необратимо.')) return;

    try {
      const deletedCount = await deleteLogsForToday();
      alert(`Удалено ${deletedCount} записей за сегодня`);
      loadData();
    } catch (err) {
      console.error('Failed to delete today logs:', err);
      alert('Не удалось удалить логи');
    }
  };

  // Удаление логов за месяц
  const handleDeleteMonth = async () => {
    setShowCleanupMenu(false);
    if (!confirm('Удалить все логи за текущий месяц? Это действие необратимо.')) return;

    try {
      const deletedCount = await deleteLogsForMonth();
      alert(`Удалено ${deletedCount} записей за текущий месяц`);
      loadData();
    } catch (err) {
      console.error('Failed to delete month logs:', err);
      alert('Не удалось удалить логи');
    }
  };

  // Удаление всех логов
  const handleDeleteAll = async () => {
    setShowCleanupMenu(false);
    if (!confirm('Удалить ВСЕ логи активности? Это действие необратимо!')) return;
    if (!confirm('Вы точно уверены? Все данные будут потеряны безвозвратно.')) return;

    try {
      const deletedCount = await deleteAllLogs();
      alert(`Удалено ${deletedCount} записей`);
      loadData();
    } catch (err) {
      console.error('Failed to delete all logs:', err);
      alert('Не удалось удалить логи');
    }
  };

  // Тест системы логирования
  const handleTestLogging = async () => {
    setLoading(true);
    try {
      const result = await testActivityLogging();

      // Формируем детальное сообщение
      let message = result.message + '\n\n';
      message += '═══════════════════════════\n';
      message += 'ДЕТАЛИ ДИАГНОСТИКИ:\n';
      message += '═══════════════════════════\n\n';

      message += `✓ Пользователь аутентифицирован: ${result.details.userAuthenticated ? 'ДА' : 'НЕТ'}\n`;
      if (result.details.userId) {
        message += `  - User ID: ${result.details.userId}\n`;
        message += `  - Email: ${result.details.userEmail}\n`;
      }
      message += '\n';

      message += `✓ Таблица доступна для чтения: ${result.details.tableAccessible ? 'ДА' : 'НЕТ'}\n`;
      message += '\n';

      message += `✓ Запись успешно вставлена: ${result.details.insertSucceeded ? 'ДА' : 'НЕТ'}\n`;
      message += '\n';

      if (result.details.error) {
        message += '═══════════════════════════\n';
        message += 'ИНФОРМАЦИЯ ОБ ОШИБКЕ:\n';
        message += '═══════════════════════════\n\n';
        message += `Ошибка: ${result.details.error}\n`;
        if (result.details.errorCode) {
          message += `Код ошибки: ${result.details.errorCode}\n`;
        }
        if (result.details.errorDetails) {
          message += `Детали: ${result.details.errorDetails}\n`;
        }
        if (result.details.errorHint) {
          message += `\nРекомендация: ${result.details.errorHint}\n`;
        }
      }

      alert(message);

      // Если тест успешен, обновляем данные
      if (result.success) {
        loadData();
      }
    } catch (err) {
      console.error('Test failed:', err);
      alert('Ошибка при выполнении теста: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  // Пагинация
  const totalPages = Math.ceil(totalCount / logsPerPage);

  return (
    <div className="activity-logs-page page-container">
      <div className="page-header">
        <div className="header-left">
          <Link to={ROUTES.HOME} className="back-link">
            ← Назад
          </Link>
          <h1>Логи активности пользователей</h1>
        </div>
        <div className="header-actions">
          <button onClick={handleTestLogging} className="button button-primary">
            🔧 Тест логирования
          </button>
          <button onClick={handleExport} className="button button-secondary">
            📊 Экспортировать CSV
          </button>
          <div className="cleanup-dropdown">
            <button
              onClick={() => setShowCleanupMenu(!showCleanupMenu)}
              className="button button-danger"
            >
              🗑️ Очистить логи ▾
            </button>
            {showCleanupMenu && (
              <div className="cleanup-dropdown__menu">
                <button onClick={handleDeleteToday} className="cleanup-dropdown__item">
                  Удалить за сегодня
                </button>
                <button onClick={handleDeleteMonth} className="cleanup-dropdown__item">
                  Удалить за месяц
                </button>
                <button onClick={handleDeleteAll} className="cleanup-dropdown__item cleanup-dropdown__item--danger">
                  Удалить все логи
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Статистика */}
      {statistics && (
        <div className="statistics-grid">
          <div className="stat-card">
            <div className="stat-value">{statistics.total_count}</div>
            <div className="stat-label">Всего действий</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{statistics.unique_users_count}</div>
            <div className="stat-label">Уникальных пользователей</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{statistics.recent_24h_count}</div>
            <div className="stat-label">За последние 24 часа</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Топ активность</div>
            <div className="stat-small">
              {statistics.activities_by_type.slice(0, 3).map((item) => (
                <div key={item.activity_type}>
                  {activityTypeLabels[item.activity_type]}: {item.count}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Фильтры */}
      <div className="filters-section">
        <h3>Фильтры</h3>
        <div className="filters-grid">
          <div className="filter-item">
            <label>Email пользователя:</label>
            <input
              type="text"
              value={userEmailFilter}
              onChange={(e) => setUserEmailFilter(e.target.value)}
              placeholder="Введите email..."
            />
          </div>

          <div className="filter-item">
            <label>Тип активности:</label>
            <select
              value={activityTypeFilter}
              onChange={(e) => setActivityTypeFilter(e.target.value as ActivityType | '')}
            >
              <option value="">Все типы</option>
              {Object.entries(activityTypeLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-item">
            <label>Тип сущности:</label>
            <select
              value={entityTypeFilter}
              onChange={(e) => setEntityTypeFilter(e.target.value as EntityType | '')}
            >
              <option value="">Все сущности</option>
              {Object.entries(entityTypeLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-item">
            <label>Дата от:</label>
            <input
              type="date"
              value={startDateFilter}
              onChange={(e) => setStartDateFilter(e.target.value)}
            />
          </div>

          <div className="filter-item">
            <label>Дата до:</label>
            <input
              type="date"
              value={endDateFilter}
              onChange={(e) => setEndDateFilter(e.target.value)}
            />
          </div>
        </div>

        <div className="filter-actions">
          <button onClick={applyFilters} className="button button-primary">
            Применить фильтры
          </button>
          <button onClick={resetFilters} className="button button-secondary">
            Сбросить
          </button>
        </div>
      </div>

      {/* Таблица логов */}
      {loading ? (
        <div className="loading-state">Загрузка логов...</div>
      ) : error ? (
        <div className="error-state">{error}</div>
      ) : logs.length === 0 ? (
        <div className="empty-state">
          <p>Нет логов активности</p>
        </div>
      ) : (
        <>
          <div className="logs-table-container">
            <table className="logs-table">
              <thead>
                <tr>
                  <th>Дата и время</th>
                  <th>Пользователь</th>
                  <th>Тип активности</th>
                  <th>Описание</th>
                  <th>Сущность</th>
                  <th>ID сущности</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="date-cell">
                      {new Date(log.created_at).toLocaleString('ru-RU')}
                    </td>
                    <td className="user-cell">{log.user_email || 'Неизвестно'}</td>
                    <td className="type-cell">
                      <span className={`activity-badge activity-${log.activity_type}`}>
                        {activityTypeLabels[log.activity_type]}
                      </span>
                    </td>
                    <td className="description-cell">{log.activity_description}</td>
                    <td className="entity-cell">
                      {log.entity_type ? entityTypeLabels[log.entity_type] : '—'}
                    </td>
                    <td className="entity-id-cell">
                      {log.entity_id ? (
                        <span className="entity-id" title={log.entity_id}>
                          {log.entity_id.substring(0, 8)}...
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Пагинация */}
          {totalPages > 1 && (
            <div className="pagination">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="pagination-button"
              >
                ← Предыдущая
              </button>
              <span className="pagination-info">
                Страница {currentPage} из {totalPages} (всего записей: {totalCount})
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="pagination-button"
              >
                Следующая →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ActivityLogsPage;
