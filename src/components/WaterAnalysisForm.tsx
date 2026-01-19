/**
 * Форма добавления/редактирования анализа качества воды
 * Поддерживает режимы создания и редактирования
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import type {
  WaterAnalysisInput,
  AnalysisResultInput,
  WaterQualityParameter,
  AnalysisStatus,
  SampleCondition,
} from '../types/waterQuality';
import { PARAMETER_METADATA, getAllParameters } from '../types/waterQuality';
import { useWaterAnalysisManagement } from '../hooks/useWaterQualityMeasurements';
import { useSamplingPoints } from '../hooks/useSamplingPoints';
import { createAnalysisResults } from '../services/api/waterQuality';
import './WaterAnalysisForm.css';

interface WaterAnalysisFormProps {
  analysisId?: string; // Если передан - режим редактирования, иначе - создание
  onSave?: () => void;
  onCancel?: () => void;
}

const WaterAnalysisForm: React.FC<WaterAnalysisFormProps> = ({ analysisId, onSave, onCancel }) => {
  const navigate = useNavigate();
  const isEditMode = !!analysisId;
  const { create, update, error } = useWaterAnalysisManagement();
  const { samplingPoints, loading: loadingPoints } = useSamplingPoints();

  // Основные поля анализа
  const [samplingPointId, setSamplingPointId] = useState<string>('');
  const [equipmentId, setEquipmentId] = useState<string>('');
  const [sampleDate, setSampleDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [analysisDate, setAnalysisDate] = useState<string>('');
  const [receivedDate, setReceivedDate] = useState<string>('');
  const [sampledBy, setSampledBy] = useState<string>('');
  const [analyzedBy, setAnalyzedBy] = useState<string>('');
  const [responsiblePerson, setResponsiblePerson] = useState<string>('');
  const [status, setStatus] = useState<AnalysisStatus>('in_progress');
  const [notes, setNotes] = useState<string>('');
  const [sampleCondition, setSampleCondition] = useState<SampleCondition>('normal');
  const [externalLab, setExternalLab] = useState<boolean>(false);
  const [externalLabName, setExternalLabName] = useState<string>('');
  const [certificateNumber, setCertificateNumber] = useState<string>('');

  // Результаты измерений
  const [results, setResults] = useState<Record<WaterQualityParameter, { value: string; method?: string }>>({
    iron: { value: '' },
    alkalinity: { value: '' },
    hardness: { value: '' },
    oxidizability: { value: '' },
    ph: { value: '' },
    temperature: { value: '' },
  });

  const [saving, setSaving] = useState<boolean>(false);

  // Загрузка данных для редактирования
  useEffect(() => {
    if (isEditMode && analysisId) {
      // TODO: Загрузить данные анализа для редактирования
      // Пока оставляем пустым, добавим позже
    }
  }, [isEditMode, analysisId]);

  const handleResultChange = (parameter: WaterQualityParameter, field: 'value' | 'method', value: string) => {
    setResults((prev) => ({
      ...prev,
      [parameter]: {
        ...prev[parameter],
        [field]: value,
      },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!samplingPointId.trim()) {
      toast.error('Выберите пункт отбора проб');
      return;
    }

    if (!sampleDate) {
      toast.error('Укажите дату отбора пробы');
      return;
    }

    setSaving(true);

    try {
      // Подготовка данных анализа
      const analysisInput: WaterAnalysisInput = {
        samplingPointId: samplingPointId.trim(),
        equipmentId: equipmentId.trim() || undefined,
        sampleDate: `${sampleDate}T00:00:00Z`,
        analysisDate: analysisDate ? `${analysisDate}T00:00:00Z` : undefined,
        receivedDate: receivedDate ? `${receivedDate}T00:00:00Z` : undefined,
        sampledBy: sampledBy.trim() || undefined,
        analyzedBy: analyzedBy.trim() || undefined,
        responsiblePerson: responsiblePerson.trim() || undefined,
        status,
        notes: notes.trim() || undefined,
        sampleCondition,
        externalLab,
        externalLabName: externalLabName.trim() || undefined,
        certificateNumber: certificateNumber.trim() || undefined,
      };

      // Создание или обновление анализа
      let createdAnalysis;
      if (isEditMode && analysisId) {
        createdAnalysis = await update(analysisId, analysisInput);
      } else {
        createdAnalysis = await create(analysisInput);
      }

      if (!createdAnalysis) {
        throw new Error('Не удалось сохранить анализ');
      }

      // Подготовка результатов измерений
      const resultsInput: AnalysisResultInput[] = [];
      const allParams = getAllParameters();

      for (const param of allParams) {
        const resultValue = results[param].value.trim();
        if (resultValue) {
          const numValue = parseFloat(resultValue);
          if (!isNaN(numValue)) {
            const metadata = PARAMETER_METADATA[param];
            resultsInput.push({
              analysisId: createdAnalysis.id,
              parameterName: param,
              parameterLabel: metadata.label,
              value: numValue,
              unit: metadata.unit,
              method: results[param].method?.trim() || undefined,
            });
          }
        }
      }

      // Сохранение результатов измерений
      if (resultsInput.length > 0) {
        await createAnalysisResults(resultsInput);
      }

      toast.success(`Анализ успешно ${isEditMode ? 'обновлен' : 'создан'}!`);
      
      if (onSave) {
        onSave();
      } else {
        navigate(-1); // Возврат назад
      }
    } catch (err: any) {
      console.error('[WaterAnalysisForm] Ошибка сохранения:', err);
      toast.error(err.message || 'Не удалось сохранить анализ');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      navigate(-1);
    }
  };

  // Получаем выбранный пункт отбора проб для отображения equipment_id
  const selectedPoint = samplingPoints.find((p) => p.id === samplingPointId);

  if (loadingPoints) {
    return (
      <div className="water-analysis-form">
        <div className="loading-message">Загрузка пунктов отбора проб...</div>
      </div>
    );
  }

  return (
    <div className="water-analysis-form">
      <div className="form-header">
        <h2>{isEditMode ? 'Редактирование анализа' : 'Добавление анализа качества воды'}</h2>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Основная информация */}
        <div className="form-section">
          <h3>Основная информация</h3>

          <div className="form-group">
            <label>Пункт отбора проб *</label>
            <select
              value={samplingPointId}
              onChange={(e) => {
                setSamplingPointId(e.target.value);
                const point = samplingPoints.find((p) => p.id === e.target.value);
                if (point?.equipmentId) {
                  setEquipmentId(point.equipmentId);
                }
              }}
              required
            >
              <option value="">Выберите пункт отбора проб</option>
              {samplingPoints
                .filter((p) => p.isActive)
                .map((point) => (
                  <option key={point.id} value={point.id}>
                    {point.code} - {point.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="form-group">
            <label>ID оборудования</label>
            <input
              type="text"
              value={equipmentId}
              onChange={(e) => setEquipmentId(e.target.value)}
              placeholder="Автоматически заполняется из пункта отбора проб"
              disabled={!!selectedPoint?.equipmentId}
            />
            {selectedPoint?.equipmentId && (
              <small>Заполнено автоматически из пункта отбора проб</small>
            )}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Дата отбора пробы *</label>
              <input
                type="date"
                value={sampleDate}
                onChange={(e) => setSampleDate(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Дата анализа</label>
              <input
                type="date"
                value={analysisDate}
                onChange={(e) => setAnalysisDate(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Дата получения</label>
              <input
                type="date"
                value={receivedDate}
                onChange={(e) => setReceivedDate(e.target.value)}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Отобрал пробу</label>
              <input
                type="text"
                value={sampledBy}
                onChange={(e) => setSampledBy(e.target.value)}
                placeholder="ФИО или должность"
              />
            </div>

            <div className="form-group">
              <label>Провел анализ</label>
              <input
                type="text"
                value={analyzedBy}
                onChange={(e) => setAnalyzedBy(e.target.value)}
                placeholder="ФИО или должность"
              />
            </div>

            <div className="form-group">
              <label>Ответственное лицо</label>
              <input
                type="text"
                value={responsiblePerson}
                onChange={(e) => setResponsiblePerson(e.target.value)}
                placeholder="ФИО или должность"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Статус *</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as AnalysisStatus)} required>
                <option value="in_progress">В работе</option>
                <option value="completed">Завершен</option>
                <option value="deviation">Отклонение</option>
                <option value="cancelled">Отменен</option>
              </select>
            </div>

            <div className="form-group">
              <label>Состояние пробы</label>
              <select
                value={sampleCondition}
                onChange={(e) => setSampleCondition(e.target.value as SampleCondition)}
              >
                <option value="normal">Нормальное</option>
                <option value="turbid">Мутная</option>
                <option value="colored">Окрашенная</option>
                <option value="odorous">С запахом</option>
              </select>
            </div>
          </div>
        </div>

        {/* Внешняя лаборатория */}
        <div className="form-section">
          <h3>Внешняя лаборатория</h3>

          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={externalLab}
                onChange={(e) => setExternalLab(e.target.checked)}
              />
              <span>Анализ проведен внешней лабораторией</span>
            </label>
          </div>

          {externalLab && (
            <>
              <div className="form-group">
                <label>Название лаборатории</label>
                <input
                  type="text"
                  value={externalLabName}
                  onChange={(e) => setExternalLabName(e.target.value)}
                  placeholder="Например: ООО 'Лаборатория качества'"
                />
              </div>

              <div className="form-group">
                <label>Номер сертификата</label>
                <input
                  type="text"
                  value={certificateNumber}
                  onChange={(e) => setCertificateNumber(e.target.value)}
                  placeholder="Номер сертификата или протокола"
                />
              </div>
            </>
          )}
        </div>

        {/* Результаты измерений */}
        <div className="form-section">
          <h3>Результаты измерений</h3>
          <p className="section-description">
            Заполните значения параметров. Параметры с пустыми значениями не будут сохранены.
          </p>

          <div className="results-grid">
            {getAllParameters().map((param) => {
              const metadata = PARAMETER_METADATA[param];
              const result = results[param];

              return (
                <div key={param} className="result-item">
                  <div className="result-header">
                    <label>
                      {metadata.label} ({metadata.unit})
                    </label>
                    {metadata.description && (
                      <small className="parameter-description">{metadata.description}</small>
                    )}
                  </div>

                  <div className="result-inputs">
                    <input
                      type="number"
                      value={result.value}
                      onChange={(e) => handleResultChange(param, 'value', e.target.value)}
                      placeholder="0.00"
                      step={metadata.step || 0.1}
                      min={metadata.minValue}
                      max={metadata.maxValue}
                      className="result-value-input"
                    />

                    <input
                      type="text"
                      value={result.method || ''}
                      onChange={(e) => handleResultChange(param, 'method', e.target.value)}
                      placeholder="Метод измерения"
                      className="result-method-input"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Примечания */}
        <div className="form-section">
          <h3>Дополнительная информация</h3>

          <div className="form-group">
            <label>Примечания</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Дополнительная информация об анализе..."
              rows={4}
            />
          </div>
        </div>

        {/* Сообщения об ошибках */}
        {error && (
          <div className="error-message">
            <span className="error-icon">⚠</span> {error}
          </div>
        )}

        {/* Кнопки */}
        <div className="form-actions">
          <button
            type="button"
            onClick={handleCancel}
            className="cancel-button"
            disabled={saving}
          >
            Отмена
          </button>
          <button
            type="submit"
            className="submit-button"
            disabled={saving}
          >
            {saving ? 'Сохранение...' : (isEditMode ? 'Сохранить изменения' : 'Создать анализ')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default WaterAnalysisForm;
