/**
 * Страница просмотра норматива качества воды
 * Отображает полную информацию о нормативе
 */

import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWaterQualityNorm } from '../hooks/useWaterQualityNorms';
import { useSamplingPoints } from '../hooks/useSamplingPoints';
import { ROUTES } from '../utils/routes';
import { PARAMETER_METADATA } from '../types/waterQuality';
import './WaterQualityNormViewPage.css';

const WaterQualityNormViewPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { norm, loading, error } = useWaterQualityNorm(id || null);
  const { samplingPoints } = useSamplingPoints();

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
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

  const handleEdit = () => {
    if (id) {
      navigate(ROUTES.WATER_QUALITY_NORM_EDIT(id));
    }
  };

  const handleBack = () => {
    navigate(ROUTES.WATER_QUALITY_NORMS);
  };

  if (loading) {
    return (
      <div className="water-quality-norm-view">
        <div className="loading-message">Загрузка норматива...</div>
      </div>
    );
  }

  if (error || !norm) {
    return (
      <div className="water-quality-norm-view">
        <div className="error-message">
          <span className="error-icon">⚠</span>
          {error || 'Норматив не найден'}
        </div>
        <button className="back-button" onClick={handleBack} type="button">
          Вернуться к списку нормативов
        </button>
      </div>
    );
  }

  const samplingPoint = samplingPoints.find((p) => p.id === norm.samplingPointId);
  const metadata = PARAMETER_METADATA[norm.parameterName];

  return (
    <div className="water-quality-norm-view">
      <div className="view-header">
        <button className="back-button" onClick={handleBack} type="button">
          ← Назад к списку
        </button>
        <div className="header-actions">
          <button className="edit-button" onClick={handleEdit} type="button">
            Редактировать
          </button>
        </div>
      </div>

      <div className="view-content">
        {/* Основная информация */}
        <div className="view-section">
          <h2 className="section-title">Основная информация</h2>
          <div className="info-grid">
            <div className="info-item">
              <label>Параметр:</label>
              <span>
                <strong>{metadata?.label || norm.parameterName}</strong>
                {metadata?.description && (
                  <div className="parameter-description">{metadata.description}</div>
                )}
              </span>
            </div>
            <div className="info-item">
              <label>Единица измерения:</label>
              <span>{norm.unit}</span>
            </div>
            <div className="info-item">
              <label>Пункт отбора проб:</label>
              <span>
                {samplingPoint ? `${samplingPoint.code} - ${samplingPoint.name}` : 'Общий (для всех пунктов)'}
              </span>
            </div>
            {norm.equipmentId && (
              <div className="info-item">
                <label>ID оборудования:</label>
                <span>{norm.equipmentId}</span>
              </div>
            )}
            <div className="info-item">
              <label>Статус:</label>
              <span className={`status-badge ${norm.isActive ? 'active' : 'inactive'}`}>
                {norm.isActive ? 'Активен' : 'Неактивен'}
              </span>
            </div>
            <div className="info-item">
              <label>Уведомления:</label>
              <span className={`status-badge ${norm.enableNotifications ? 'enabled' : 'disabled'}`}>
                {norm.enableNotifications ? 'Включены' : 'Выключены'}
              </span>
            </div>
          </div>
        </div>

        {/* Диапазоны значений */}
        <div className="view-section">
          <h2 className="section-title">Диапазоны значений</h2>
          <div className="ranges-grid">
            <div className="range-item">
              <h4>Оптимальный диапазон</h4>
              <div className="range-value">{formatRange(norm.optimalMin, norm.optimalMax)}</div>
            </div>
            <div className="range-item">
              <h4>Допустимый диапазон</h4>
              <div className="range-value">{formatRange(norm.minAllowed, norm.maxAllowed)}</div>
            </div>
            <div className="range-item">
              <h4>Диапазон предупреждения</h4>
              <div className="range-value">{formatRange(norm.warningMin, norm.warningMax)}</div>
            </div>
          </div>
        </div>

        {/* Пороги уведомлений */}
        <div className="view-section">
          <h2 className="section-title">Пороги уведомлений</h2>
          <div className="info-grid">
            <div className="info-item">
              <label>Порог предупреждения:</label>
              <span>{norm.warningThresholdPercent}%</span>
            </div>
            <div className="info-item">
              <label>Порог тревоги:</label>
              <span>{norm.alarmThresholdPercent}%</span>
            </div>
          </div>
        </div>

        {/* Нормативный документ */}
        {(norm.regulationReference || norm.regulationDocumentUrl) && (
          <div className="view-section">
            <h2 className="section-title">Нормативный документ</h2>
            <div className="info-grid">
              {norm.regulationReference && (
                <div className="info-item">
                  <label>Ссылка на документ:</label>
                  <span>{norm.regulationReference}</span>
                </div>
              )}
              {norm.regulationDocumentUrl && (
                <div className="info-item full-width">
                  <label>URL документа:</label>
                  <a
                    href={norm.regulationDocumentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="document-link"
                  >
                    {norm.regulationDocumentUrl}
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Метаданные */}
        <div className="view-section metadata-section">
          <h2 className="section-title">Метаданные</h2>
          <div className="info-grid">
            <div className="info-item">
              <label>Создан:</label>
              <span>{formatDate(norm.createdAt)}</span>
            </div>
            <div className="info-item">
              <label>Обновлен:</label>
              <span>{formatDate(norm.updatedAt)}</span>
            </div>
            {norm.createdBy && (
              <div className="info-item">
                <label>Создал:</label>
                <span>{norm.createdBy}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WaterQualityNormViewPage;
