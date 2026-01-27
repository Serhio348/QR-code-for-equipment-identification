/**
 * Страница просмотра точки отбора проб
 * Отображает полную информацию о точке отбора проб
 */

import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSamplingPoint } from '../hooks/useSamplingPoints';
import { ROUTES } from '@/shared/utils/routes';
import type { SamplingFrequency } from '../types/waterQuality';
import './SamplingPointViewPage.css';

const SamplingPointViewPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { samplingPoint, loading, error } = useSamplingPoint(id || null);

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

  const getFrequencyLabel = (frequency?: SamplingFrequency): string => {
    const labels: Record<SamplingFrequency, string> = {
      daily: 'Ежедневно',
      weekly: 'Еженедельно',
      monthly: 'Ежемесячно',
      custom: 'По расписанию',
    };
    return frequency ? labels[frequency] : 'Не указана';
  };

  const handleEdit = () => {
    if (id) {
      navigate(ROUTES.WATER_QUALITY_SAMPLING_POINT_EDIT(id));
    }
  };

  const handleBack = () => {
    navigate(ROUTES.WATER_QUALITY_SAMPLING_POINTS);
  };

  if (loading) {
    return (
      <div className="sampling-point-view">
        <div className="loading-message">Загрузка точки отбора проб...</div>
      </div>
    );
  }

  if (error || !samplingPoint) {
    return (
      <div className="sampling-point-view">
        <div className="error-message">
          <span className="error-icon">⚠</span>
          {error || 'Точка отбора проб не найдена'}
        </div>
        <button className="back-button" onClick={handleBack} type="button">
          Вернуться к списку точек отбора
        </button>
      </div>
    );
  }

  return (
    <div className="sampling-point-view">
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
              <label>Код:</label>
              <span><strong>{samplingPoint.code}</strong></span>
            </div>
            <div className="info-item">
              <label>Название:</label>
              <span>{samplingPoint.name}</span>
            </div>
            {samplingPoint.description && (
              <div className="info-item full-width">
                <label>Описание:</label>
                <span>{samplingPoint.description}</span>
              </div>
            )}
            {samplingPoint.equipmentId && (
              <div className="info-item">
                <label>ID оборудования:</label>
                <span>{samplingPoint.equipmentId}</span>
              </div>
            )}
            {samplingPoint.location && (
              <div className="info-item">
                <label>Местоположение:</label>
                <span>{samplingPoint.location}</span>
              </div>
            )}
            <div className="info-item">
              <label>Статус:</label>
              <span className={`status-badge ${samplingPoint.isActive ? 'active' : 'inactive'}`}>
                {samplingPoint.isActive ? 'Активна' : 'Неактивна'}
              </span>
            </div>
          </div>
        </div>

        {/* Параметры отбора проб */}
        <div className="view-section">
          <h2 className="section-title">Параметры отбора проб</h2>
          <div className="info-grid">
            <div className="info-item">
              <label>Частота отбора:</label>
              <span>{getFrequencyLabel(samplingPoint.samplingFrequency)}</span>
            </div>
            {samplingPoint.responsiblePerson && (
              <div className="info-item">
                <label>Ответственное лицо:</label>
                <span>{samplingPoint.responsiblePerson}</span>
              </div>
            )}
          </div>
        </div>

        {/* Метаданные */}
        <div className="view-section metadata-section">
          <h2 className="section-title">Метаданные</h2>
          <div className="info-grid">
            <div className="info-item">
              <label>Создана:</label>
              <span>{formatDate(samplingPoint.createdAt)}</span>
            </div>
            <div className="info-item">
              <label>Обновлена:</label>
              <span>{formatDate(samplingPoint.updatedAt)}</span>
            </div>
            {samplingPoint.createdBy && (
              <div className="info-item">
                <label>Создал:</label>
                <span>{samplingPoint.createdBy}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SamplingPointViewPage;
