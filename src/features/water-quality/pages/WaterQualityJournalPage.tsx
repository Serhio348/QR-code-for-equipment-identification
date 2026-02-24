/**
 * Страница журнала анализов качества воды
 * Отображает список всех анализов с возможностью фильтрации и создания новых
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWaterAnalyses } from '../hooks/useWaterQualityMeasurements';
import { useSamplingPoints } from '../hooks/useSamplingPoints';
import { ROUTES } from '@/shared/utils/routes';
import type { AnalysisStatus } from '../types/waterQuality';
import './WaterQualityJournalPage.css';

const WaterQualityJournalPage: React.FC = () => {
  const navigate = useNavigate();
  const { samplingPoints, loading: loadingPoints } = useSamplingPoints();

  // Фильтры
  const [selectedPointId, setSelectedPointId] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<AnalysisStatus | 'all'>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Применяем фильтры
  const filters: {
    samplingPointId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  } = {
    ...(selectedPointId && { samplingPointId: selectedPointId }),
    ...(statusFilter !== 'all' && { status: statusFilter }),
    ...(startDate && { startDate }),
    ...(endDate && { endDate }),
  };

  const { analyses, loading, error } = useWaterAnalyses(filters);

  const handleCreateNew = () => {
    navigate(ROUTES.WATER_QUALITY_ANALYSIS_NEW);
  };

  const handleViewAnalysis = (id: string) => {
    navigate(ROUTES.WATER_QUALITY_ANALYSIS_VIEW(id));
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('ru-RU', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  const getStatusLabel = (status: AnalysisStatus): string => {
    const labels: Record<AnalysisStatus, string> = {
      in_progress: 'В работе',
      completed: 'Норма',
      deviation: 'Отклонение',
      cancelled: 'Отменен',
    };
    return labels[status] || status;
  };

  const getStatusClass = (status: AnalysisStatus): string => {
    return `status-badge status-${status}`;
  };

  return (
    <div className="water-quality-journal">
      <div className="journal-header">
        <div className="journal-header-top">
          <h2 className="journal-title">Журнал анализов качества воды</h2>
          <div className="journal-actions">
            <button
              className="alerts-button"
              onClick={() => navigate(ROUTES.WATER_QUALITY_ALERTS)}
              type="button"
            >
              🔔 Оповещения
            </button>
            <button
              className="norms-button"
              onClick={() => navigate(ROUTES.WATER_QUALITY_NORMS)}
              type="button"
            >
              📋 Нормативы
            </button>
            <button
              className="sampling-points-button"
              onClick={() => navigate(ROUTES.WATER_QUALITY_SAMPLING_POINTS)}
              type="button"
            >
              📍 Точки отбора
            </button>
            <button
              className="create-analysis-button"
              onClick={handleCreateNew}
              type="button"
            >
              + Создать анализ
            </button>
          </div>
        </div>

        {/* Фильтры */}
        <div className="journal-filters">
          <div className="filter-group">
            <label>Пункт отбора проб:</label>
            <select
              value={selectedPointId}
              onChange={(e) => setSelectedPointId(e.target.value)}
              disabled={loadingPoints}
            >
              <option value="">Все пункты</option>
              {samplingPoints
                .filter((p) => p.isActive)
                .map((point) => (
                  <option key={point.id} value={point.id}>
                    {point.code} - {point.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Статус:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as AnalysisStatus | 'all')}
            >
              <option value="all">Все статусы</option>
              <option value="completed">Норма</option>
              <option value="deviation">Отклонение</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Дата отбора с:</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div className="filter-group">
            <label>Дата отбора по:</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <button
            className="clear-filters-button"
            onClick={() => {
              setSelectedPointId('');
              setStatusFilter('all');
              setStartDate('');
              setEndDate('');
            }}
            type="button"
          >
            Сбросить фильтры
          </button>
        </div>
      </div>

      {/* Список анализов */}
      <div className="journal-content">
        {loading && (
          <div className="loading-message">Загрузка анализов...</div>
        )}

        {error && (
          <div className="error-message">
            <span className="error-icon">⚠</span> {error}
          </div>
        )}

        {!loading && !error && analyses.length === 0 && (
          <div className="empty-state">
            <p className="empty-state-text">Анализы не найдены</p>
            <p className="empty-state-note">
              {Object.values(filters).some((f) => f !== undefined)
                ? 'Попробуйте изменить фильтры'
                : 'Используйте кнопку "Создать анализ" выше для добавления первого анализа'}
            </p>
          </div>
        )}

        {!loading && !error && analyses.length > 0 && (
          <div className="analyses-table-container">
            <table className="analyses-table">
              <thead>
                <tr>
                  <th>Дата отбора</th>
                  <th>Пункт отбора</th>
                  <th>Статус</th>
                  <th>Ответственное лицо</th>
                  <th>Примечания</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {analyses.map((analysis) => (
                  <tr key={analysis.id}>
                    <td>{formatDate(analysis.sampleDate)}</td>
                    <td>
                      {samplingPoints.find((p) => p.id === analysis.samplingPointId)?.name ||
                        analysis.samplingPointId}
                    </td>
                    <td>
                      <span className={getStatusClass(analysis.status)}>
                        {getStatusLabel(analysis.status)}
                      </span>
                    </td>
                    <td>{analysis.responsiblePerson || '-'}</td>
                    <td className="notes-cell">
                      {analysis.notes ? (
                        <span title={analysis.notes}>
                          {analysis.notes.length > 50
                            ? `${analysis.notes.substring(0, 50)}...`
                            : analysis.notes}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td>
                      <button
                        className="view-button"
                        onClick={() => handleViewAnalysis(analysis.id)}
                        type="button"
                      >
                        Просмотр
                      </button>
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

export default WaterQualityJournalPage;
