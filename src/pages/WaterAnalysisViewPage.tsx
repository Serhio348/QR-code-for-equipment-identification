/**
 * Страница просмотра анализа качества воды
 * Отображает полную информацию об анализе, результаты измерений и прикрепленные файлы
 */

import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWaterAnalysis } from '../hooks/useWaterQualityMeasurements';
import { useSamplingPoints } from '../hooks/useSamplingPoints';
import { ROUTES } from '../utils/routes';
import type { AnalysisStatus, SampleCondition } from '../types/waterQuality';
import { PARAMETER_METADATA } from '../types/waterQuality';
import './WaterAnalysisViewPage.css';

const WaterAnalysisViewPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { analysis, loading, error } = useWaterAnalysis(id || null);
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

  const getStatusLabel = (status: AnalysisStatus): string => {
    const labels: Record<AnalysisStatus, string> = {
      in_progress: 'В работе',
      completed: 'Завершен',
      deviation: 'Отклонение',
      cancelled: 'Отменен',
    };
    return labels[status] || status;
  };

  const getStatusClass = (status: AnalysisStatus): string => {
    return `status-badge status-${status}`;
  };

  const getSampleConditionLabel = (condition?: SampleCondition): string => {
    const labels: Record<SampleCondition, string> = {
      normal: 'Нормальное',
      turbid: 'Мутная',
      colored: 'Окрашенная',
      odorous: 'С запахом',
    };
    return condition ? labels[condition] : '-';
  };

  const handleEdit = () => {
    if (id) {
      navigate(ROUTES.WATER_QUALITY_ANALYSIS_EDIT(id));
    }
  };

  const handleBack = () => {
    navigate(ROUTES.WATER_QUALITY_JOURNAL);
  };

  const handleDownloadPDF = (url: string) => {
    window.open(url, '_blank');
  };

  if (loading) {
    return (
      <div className="water-analysis-view">
        <div className="loading-message">Загрузка анализа...</div>
      </div>
    );
  }

  if (error || !analysis) {
    return (
      <div className="water-analysis-view">
        <div className="error-message">
          <span className="error-icon">⚠</span>
          {error || 'Анализ не найден'}
        </div>
        <button className="back-button" onClick={handleBack} type="button">
          Вернуться к журналу
        </button>
      </div>
    );
  }

  const samplingPoint = samplingPoints.find((p) => p.id === analysis.samplingPointId);

  return (
    <div className="water-analysis-view">
      <div className="view-header">
        <button className="back-button" onClick={handleBack} type="button">
          ← Назад к журналу
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
              <label>Пункт отбора проб:</label>
              <span>{samplingPoint ? `${samplingPoint.code} - ${samplingPoint.name}` : analysis.samplingPointId}</span>
            </div>
            <div className="info-item">
              <label>ID оборудования:</label>
              <span>{analysis.equipmentId || '-'}</span>
            </div>
            <div className="info-item">
              <label>Дата отбора пробы:</label>
              <span>{formatDate(analysis.sampleDate)}</span>
            </div>
            <div className="info-item">
              <label>Дата анализа:</label>
              <span>{formatDate(analysis.analysisDate)}</span>
            </div>
            <div className="info-item">
              <label>Дата получения:</label>
              <span>{formatDate(analysis.receivedDate)}</span>
            </div>
            <div className="info-item">
              <label>Статус:</label>
              <span className={getStatusClass(analysis.status)}>{getStatusLabel(analysis.status)}</span>
            </div>
            <div className="info-item">
              <label>Состояние пробы:</label>
              <span>{getSampleConditionLabel(analysis.sampleCondition)}</span>
            </div>
            <div className="info-item">
              <label>Отобрал пробу:</label>
              <span>{analysis.sampledBy || '-'}</span>
            </div>
            <div className="info-item">
              <label>Провел анализ:</label>
              <span>{analysis.analyzedBy || '-'}</span>
            </div>
            <div className="info-item">
              <label>Ответственное лицо:</label>
              <span>{analysis.responsiblePerson || '-'}</span>
            </div>
          </div>
        </div>

        {/* Внешняя лаборатория */}
        {analysis.externalLab && (
          <div className="view-section">
            <h2 className="section-title">Внешняя лаборатория</h2>
            <div className="info-grid">
              <div className="info-item">
                <label>Название лаборатории:</label>
                <span>{analysis.externalLabName || '-'}</span>
              </div>
              {analysis.attachmentUrls && analysis.attachmentUrls.length > 0 && (
                <div className="info-item full-width">
                  <label>PDF файлы анализа:</label>
                  <div className="pdf-files">
                    {analysis.attachmentUrls.map((url, index) => (
                      <button
                        key={index}
                        className="pdf-download-button"
                        onClick={() => handleDownloadPDF(url)}
                        type="button"
                      >
                        📄 Открыть PDF {index + 1}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Результаты измерений */}
        <div className="view-section">
          <h2 className="section-title">Результаты измерений</h2>
          {analysis.results && analysis.results.length > 0 ? (
            <div className="results-table-container">
              <table className="results-table">
                <thead>
                  <tr>
                    <th>Параметр</th>
                    <th>Значение</th>
                    <th>Единица измерения</th>
                    <th>Метод</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.results.map((result) => {
                    const metadata = PARAMETER_METADATA[result.parameterName];
                    return (
                      <tr key={result.id}>
                        <td>
                          <strong>{result.parameterLabel || metadata?.label || result.parameterName}</strong>
                          {metadata?.description && (
                            <div className="parameter-description">{metadata.description}</div>
                          )}
                        </td>
                        <td className="value-cell">{result.value}</td>
                        <td>{result.unit}</td>
                        <td>{result.method || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-results">Результаты измерений отсутствуют</div>
          )}
        </div>

        {/* Примечания */}
        {analysis.notes && (
          <div className="view-section">
            <h2 className="section-title">Примечания</h2>
            <div className="notes-content">{analysis.notes}</div>
          </div>
        )}

        {/* Метаданные */}
        <div className="view-section metadata-section">
          <h2 className="section-title">Метаданные</h2>
          <div className="info-grid">
            <div className="info-item">
              <label>Создан:</label>
              <span>{formatDate(analysis.createdAt)}</span>
            </div>
            <div className="info-item">
              <label>Обновлен:</label>
              <span>{formatDate(analysis.updatedAt)}</span>
            </div>
            {analysis.createdBy && (
              <div className="info-item">
                <label>Создал:</label>
                <span>{analysis.createdBy}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WaterAnalysisViewPage;
