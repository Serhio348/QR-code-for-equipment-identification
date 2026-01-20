/**
 * Страница управления точками отбора проб
 * Отображает список точек отбора проб с возможностью создания, редактирования и удаления
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSamplingPoints, useSamplingPointManagement } from '../hooks/useSamplingPoints';
import { ROUTES } from '../utils/routes';
import type { SamplingFrequency } from '../types/waterQuality';
import { toast } from 'react-toastify';
import './SamplingPointsPage.css';

const SamplingPointsPage: React.FC = () => {
  const navigate = useNavigate();
  const { remove } = useSamplingPointManagement();

  // Фильтры
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const { samplingPoints, loading, error, refetch } = useSamplingPoints();

  // Фильтрация точек отбора проб
  const filteredPoints = samplingPoints.filter((point) => {
    // Фильтр по статусу
    if (statusFilter === 'active' && !point.isActive) return false;
    if (statusFilter === 'inactive' && point.isActive) return false;

    // Поиск по коду или названию
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchesCode = point.code.toLowerCase().includes(query);
      const matchesName = point.name.toLowerCase().includes(query);
      const matchesLocation = point.location?.toLowerCase().includes(query);
      if (!matchesCode && !matchesName && !matchesLocation) return false;
    }

    return true;
  });

  const handleCreateNew = () => {
    navigate(ROUTES.WATER_QUALITY_SAMPLING_POINT_NEW);
  };

  const handleView = (id: string) => {
    navigate(ROUTES.WATER_QUALITY_SAMPLING_POINT_VIEW(id));
  };

  const handleEdit = (id: string) => {
    navigate(ROUTES.WATER_QUALITY_SAMPLING_POINT_EDIT(id));
  };

  const handleDelete = async (id: string, code: string, name: string) => {
    if (!window.confirm(`Вы уверены, что хотите удалить точку отбора проб "${code} - ${name}"?`)) {
      return;
    }

    try {
      const success = await remove(id);
      if (success) {
        toast.success('Точка отбора проб успешно удалена');
        await refetch();
      } else {
        toast.error('Не удалось удалить точку отбора проб');
      }
    } catch (err: any) {
      console.error('[SamplingPointsPage] Ошибка при удалении точки отбора проб:', err);
      toast.error(err.message || 'Не удалось удалить точку отбора проб');
    }
  };

  const getFrequencyLabel = (frequency?: SamplingFrequency): string => {
    const labels: Record<SamplingFrequency, string> = {
      daily: 'Ежедневно',
      weekly: 'Еженедельно',
      monthly: 'Ежемесячно',
      custom: 'По расписанию',
    };
    return frequency ? labels[frequency] : '-';
  };

  return (
    <div className="sampling-points">
      <div className="points-header">
        <div className="points-header-top">
          <button className="back-button" onClick={() => navigate(ROUTES.WATER_QUALITY_JOURNAL)} type="button">
            ← Назад
          </button>
          <h2 className="points-title">Точки отбора проб</h2>
          <button className="create-point-button" onClick={handleCreateNew} type="button">
            + Создать точку отбора
          </button>
        </div>

        {/* Фильтры */}
        <div className="points-filters">
          <div className="filter-group">
            <label>Статус:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
            >
              <option value="all">Все</option>
              <option value="active">Активные</option>
              <option value="inactive">Неактивные</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Поиск:</label>
            <input
              type="text"
              placeholder="Код, название или местоположение..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {(statusFilter !== 'all' || searchQuery.trim()) && (
            <button
              className="clear-filters-button"
              onClick={() => {
                setStatusFilter('all');
                setSearchQuery('');
              }}
              type="button"
            >
              Сбросить фильтры
            </button>
          )}
        </div>
      </div>

      {/* Список точек отбора проб */}
      <div className="points-content">
        {loading && <div className="loading-message">Загрузка точек отбора проб...</div>}

        {error && (
          <div className="error-message">
            <span className="error-icon">⚠</span> {error}
          </div>
        )}

        {!loading && !error && filteredPoints.length === 0 && (
          <div className="empty-state">
            <p className="empty-state-text">
              {searchQuery.trim() || statusFilter !== 'all'
                ? 'Точки отбора проб не найдены'
                : 'Точки отбора проб не найдены'}
            </p>
            <p className="empty-state-note">
              {searchQuery.trim() || statusFilter !== 'all'
                ? 'Попробуйте изменить фильтры'
                : 'Используйте кнопку "Создать точку отбора" для добавления первой точки'}
            </p>
          </div>
        )}

        {!loading && !error && filteredPoints.length > 0 && (
          <div className="points-table-container">
            <table className="points-table">
              <thead>
                <tr>
                  <th>Код</th>
                  <th>Название</th>
                  <th>Описание</th>
                  <th>ID оборудования</th>
                  <th>Местоположение</th>
                  <th>Частота отбора</th>
                  <th>Ответственное лицо</th>
                  <th>Статус</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {filteredPoints.map((point) => (
                  <tr key={point.id}>
                    <td>
                      <strong>{point.code}</strong>
                    </td>
                    <td>{point.name}</td>
                    <td className="description-cell">
                      {point.description || '-'}
                    </td>
                    <td>{point.equipmentId || '-'}</td>
                    <td>{point.location || '-'}</td>
                    <td>{getFrequencyLabel(point.samplingFrequency)}</td>
                    <td>{point.responsiblePerson || '-'}</td>
                    <td>
                      <span className={`status-badge ${point.isActive ? 'active' : 'inactive'}`}>
                        {point.isActive ? 'Активна' : 'Неактивна'}
                      </span>
                    </td>
                    <td>
                      <div className="point-actions">
                        <button
                          className="view-button"
                          onClick={() => handleView(point.id)}
                          type="button"
                        >
                          Просмотр
                        </button>
                        <button
                          className="edit-button"
                          onClick={() => handleEdit(point.id)}
                          type="button"
                        >
                          Редактировать
                        </button>
                        <button
                          className="delete-button"
                          onClick={() => handleDelete(point.id, point.code, point.name)}
                          type="button"
                        >
                          Удалить
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default SamplingPointsPage;
