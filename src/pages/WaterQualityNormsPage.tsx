/**
 * Страница управления нормативами качества воды
 * Отображает список нормативов с возможностью создания, редактирования и удаления
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWaterQualityNorms } from '../hooks/useWaterQualityNorms';
import { useSamplingPoints } from '../hooks/useSamplingPoints';
import { useWaterQualityNormManagement } from '../hooks/useWaterQualityNorms';
import { ROUTES } from '../utils/routes';
import type { WaterQualityParameter } from '../types/waterQuality';
import { PARAMETER_METADATA, getAllParameters } from '../types/waterQuality';
import { toast } from 'react-toastify';
import './WaterQualityNormsPage.css';

const WaterQualityNormsPage: React.FC = () => {
  const navigate = useNavigate();
  const { samplingPoints } = useSamplingPoints();
  const { remove } = useWaterQualityNormManagement();

  // Фильтры
  const [parameterFilter, setParameterFilter] = useState<WaterQualityParameter | 'all'>('all');

  const filters = {
    ...(parameterFilter !== 'all' && { parameterName: parameterFilter }),
  };

  const { norms, loading, error, refetch } = useWaterQualityNorms(
    Object.keys(filters).length > 0 ? filters : undefined
  );

  const handleCreateNew = () => {
    navigate(ROUTES.WATER_QUALITY_NORM_NEW);
  };

  const handleView = (id: string) => {
    navigate(ROUTES.WATER_QUALITY_NORM_VIEW(id));
  };

  const handleEdit = (id: string) => {
    navigate(ROUTES.WATER_QUALITY_NORM_EDIT(id));
  };

  const handleDelete = async (id: string, parameterName: string) => {
    if (!window.confirm(`Вы уверены, что хотите удалить норматив для параметра "${parameterName}"?`)) {
      return;
    }

    try {
      const success = await remove(id);
      if (success) {
        toast.success('Норматив успешно удален');
        // Принудительно обновляем список после удаления
        await refetch();
      } else {
        toast.error('Не удалось удалить норматив');
      }
    } catch (err: any) {
      console.error('[WaterQualityNormsPage] Ошибка при удалении норматива:', err);
      toast.error(err.message || 'Не удалось удалить норматив');
    }
  };

  const formatRange = (min?: number, max?: number): string => {
    if (min !== undefined && max !== undefined) {
      return `${min} - ${max}`;
    }
    if (min !== undefined) {
      return `≥ ${min}`;
    }
    if (max !== undefined) {
      return `≤ ${max}`;
    }
    return '-';
  };

  const getParameterLabel = (parameterName: WaterQualityParameter): string => {
    return PARAMETER_METADATA[parameterName]?.label || parameterName;
  };

  return (
    <div className="water-quality-norms">
      <div className="norms-header">
        <div className="norms-header-top">
          <button className="back-button" onClick={() => navigate(ROUTES.WATER_QUALITY_JOURNAL)} type="button">
            ← Назад
          </button>
          <h2 className="norms-title">Нормативы качества воды</h2>
          <button className="create-norm-button" onClick={handleCreateNew} type="button">
            + Создать норматив
          </button>
        </div>

        {/* Фильтры */}
        <div className="norms-filters">
          <div className="filter-group">
            <label>Параметр:</label>
            <select
              value={parameterFilter}
              onChange={(e) => setParameterFilter(e.target.value as WaterQualityParameter | 'all')}
            >
              <option value="all">Все параметры</option>
              {getAllParameters().map((param) => (
                <option key={param} value={param}>
                  {PARAMETER_METADATA[param].label}
                </option>
              ))}
            </select>
          </div>

          {parameterFilter !== 'all' && (
            <button
              className="clear-filters-button"
              onClick={() => {
                setParameterFilter('all');
              }}
              type="button"
            >
              Сбросить фильтр
            </button>
          )}
        </div>
      </div>

      {/* Список нормативов */}
      <div className="norms-content">
        {loading && <div className="loading-message">Загрузка нормативов...</div>}

        {error && (
          <div className="error-message">
            <span className="error-icon">⚠</span> {error}
          </div>
        )}

        {!loading && !error && norms.length === 0 && (
          <div className="empty-state">
            <p className="empty-state-text">Нормативы не найдены</p>
            <p className="empty-state-note">
              {Object.keys(filters).length > 0
                ? 'Попробуйте изменить фильтры'
                : 'Используйте кнопку "Создать норматив" для добавления первого норматива'}
            </p>
          </div>
        )}

        {!loading && !error && norms.length > 0 && (
          <div className="norms-table-container">
            <table className="norms-table">
              <thead>
                <tr>
                  <th>Параметр</th>
                  <th>Пункт отбора</th>
                  <th>Оптимальный диапазон</th>
                  <th>Допустимый диапазон</th>
                  <th>Предупреждение</th>
                  <th>Единица</th>
                  <th>Нормативный документ</th>
                  <th>Уведомления</th>
                  <th>Статус</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {norms.map((norm) => {
                  const samplingPoint = samplingPoints.find((p) => p.id === norm.samplingPointId);
                  return (
                    <tr key={norm.id}>
                      <td>
                        <strong>{getParameterLabel(norm.parameterName)}</strong>
                      </td>
                      <td>
                        {samplingPoint ? `${samplingPoint.code} - ${samplingPoint.name}` : 'Общий'}
                      </td>
                      <td>{formatRange(norm.optimalMin, norm.optimalMax)}</td>
                      <td>{formatRange(norm.minAllowed, norm.maxAllowed)}</td>
                      <td>{formatRange(norm.warningMin, norm.warningMax)}</td>
                      <td>{norm.unit}</td>
                      <td className="regulation-cell">
                        {norm.regulationReference ? (
                          <div>
                            <div className="regulation-ref">{norm.regulationReference}</div>
                            {norm.regulationDocumentUrl && (
                              <a
                                href={norm.regulationDocumentUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="regulation-link"
                              >
                                Открыть документ
                              </a>
                            )}
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td>
                        <span className={`status-badge ${norm.enableNotifications ? 'enabled' : 'disabled'}`}>
                          {norm.enableNotifications ? 'Включены' : 'Выключены'}
                        </span>
                      </td>
                      <td>
                        <span className={`status-badge ${norm.isActive ? 'active' : 'inactive'}`}>
                          {norm.isActive ? 'Активен' : 'Неактивен'}
                        </span>
                      </td>
                      <td>
                        <div className="norm-actions">
                          <button
                            className="view-button"
                            onClick={() => handleView(norm.id)}
                            type="button"
                          >
                            Просмотр
                          </button>
                          <button
                            className="edit-button"
                            onClick={() => handleEdit(norm.id)}
                            type="button"
                          >
                            Редактировать
                          </button>
                          <button
                            className="delete-button"
                            onClick={() => handleDelete(norm.id, getParameterLabel(norm.parameterName))}
                            type="button"
                          >
                            Удалить
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default WaterQualityNormsPage;
