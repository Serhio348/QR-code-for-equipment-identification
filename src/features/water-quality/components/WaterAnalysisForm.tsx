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
  AnalysisResult,
  WaterQualityParameter,
  AnalysisStatus,
  SampleCondition,
} from '../types/waterQuality';
import { PARAMETER_METADATA, getAllParameters } from '../types/waterQuality';
import { useWaterAnalysisManagement, useWaterAnalysis } from '../hooks/useWaterQualityMeasurements';
import { useSamplingPoints } from '../hooks/useSamplingPoints';
import { useCurrentUser } from '../../../hooks/useCurrentUser';
import { createAnalysisResults, updateAnalysisResult, deleteAnalysisResult, checkResultCompliance, uploadAnalysisPDF, deleteAnalysisPDF } from '../services';
import { ROUTES } from '../../../utils/routes';
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
  const currentUser = useCurrentUser();

  // Основные поля анализа
  const [samplingPointId, setSamplingPointId] = useState<string>('');
  const [equipmentId, setEquipmentId] = useState<string>('');
  const [sampleDate, setSampleDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [status, setStatus] = useState<AnalysisStatus>('in_progress');
  const [notes, setNotes] = useState<string>('');
  const [sampleCondition, setSampleCondition] = useState<SampleCondition>('normal');
  const [externalLab, setExternalLab] = useState<boolean>(false);
  const [externalLabName, setExternalLabName] = useState<string>('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [uploadingPdf, setUploadingPdf] = useState<boolean>(false);
  const [attachmentUrls, setAttachmentUrls] = useState<string[]>([]);
  const [removingAttachmentUrl, setRemovingAttachmentUrl] = useState<string | null>(null);

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
  const [loadingAnalysis, setLoadingAnalysis] = useState<boolean>(false);

  // Загрузка данных для редактирования
  const { analysis: existingAnalysis, loading: loadingExistingAnalysis } = useWaterAnalysis(
    isEditMode ? analysisId || null : null
  );

  useEffect(() => {
    if (isEditMode && existingAnalysis) {
      setLoadingAnalysis(true);
      try {
        // Заполняем основные поля
        setSamplingPointId(existingAnalysis.samplingPointId);
        setEquipmentId(existingAnalysis.equipmentId || '');
        setSampleDate(existingAnalysis.sampleDate.split('T')[0]);
        setStatus(existingAnalysis.status);
        setNotes(existingAnalysis.notes || '');
        setSampleCondition(existingAnalysis.sampleCondition || 'normal');
        setExternalLab(existingAnalysis.externalLab || false);
        setExternalLabName(existingAnalysis.externalLabName || '');
        setAttachmentUrls(existingAnalysis.attachmentUrls || []);

        // Заполняем результаты измерений
        const loadedResults: Record<WaterQualityParameter, { value: string; method?: string }> = {
          iron: { value: '' },
          alkalinity: { value: '' },
          hardness: { value: '' },
          oxidizability: { value: '' },
          ph: { value: '' },
          temperature: { value: '' },
        };

        if (existingAnalysis.results && existingAnalysis.results.length > 0) {
          existingAnalysis.results.forEach((result) => {
            if (loadedResults[result.parameterName]) {
              loadedResults[result.parameterName] = {
                value: result.value.toString(),
                method: result.method || '',
              };
            }
          });
        }

        setResults(loadedResults);
      } catch (err: any) {
        console.error('[WaterAnalysisForm] Ошибка загрузки данных:', err);
        toast.error('Не удалось загрузить данные анализа');
      } finally {
        setLoadingAnalysis(false);
      }
    }
  }, [isEditMode, existingAnalysis]);

  const handleResultChange = (parameter: WaterQualityParameter, field: 'value' | 'method', value: string) => {
    setResults((prev) => ({
      ...prev,
      [parameter]: {
        ...prev[parameter],
        [field]: value,
      },
    }));
  };

  const handleRemoveAttachment = async (fileUrl: string) => {
    if (!isEditMode || !analysisId) {
      return;
    }

    try {
      setRemovingAttachmentUrl(fileUrl);
      await deleteAnalysisPDF(fileUrl);
      const updatedUrls = attachmentUrls.filter((url) => url !== fileUrl);
      await update(analysisId, { attachmentUrls: updatedUrls });
      setAttachmentUrls(updatedUrls);
      toast.success('Файл удален');
    } catch (err: any) {
      console.error('[WaterAnalysisForm] Ошибка удаления файла:', err);
      toast.error(err.message || 'Не удалось удалить файл');
    } finally {
      setRemovingAttachmentUrl(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Защита от множественных отправок
    if (saving || uploadingPdf) {
      return;
    }

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
      // Автоматически заполняем поля пользователя из аутентификации
      const analysisInput: WaterAnalysisInput = {
        samplingPointId: samplingPointId.trim(),
        equipmentId: equipmentId.trim() || undefined,
        sampleDate: `${sampleDate}T00:00:00Z`,
        sampledBy: currentUser,
        analyzedBy: currentUser,
        responsiblePerson: currentUser,
        status,
        notes: notes.trim() || undefined,
        sampleCondition,
        externalLab,
        externalLabName: externalLabName.trim() || undefined,
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

      // Подготовка и сохранение результатов измерений
      const allParams = getAllParameters();
      const existingResultsMap = new Map<string, AnalysisResult>();
      
      if (isEditMode && existingAnalysis?.results) {
        // Создаем карту существующих результатов для быстрого поиска
        existingAnalysis.results.forEach((result) => {
          existingResultsMap.set(result.parameterName, result);
        });
      }

      // Обрабатываем каждый параметр и проверяем соответствие нормам
      const savedResultIds: string[] = [];
      for (const param of allParams) {
        const resultValue = results[param].value.trim();
        const existingResult = existingResultsMap.get(param);

        // Если в режиме редактирования значение очищено — удаляем результат
        if (!resultValue) {
          if (isEditMode && existingResult) {
            try {
              await deleteAnalysisResult(existingResult.id);
            } catch (deleteError: any) {
              console.warn('[WaterAnalysisForm] Не удалось удалить результат:', deleteError);
            }
          }
          continue;
        }

        const numValue = parseFloat(resultValue);
        if (isNaN(numValue)) {
          continue;
        }

        const metadata = PARAMETER_METADATA[param];
        let savedResultId: string;
        if (isEditMode && existingResult) {
          // Обновляем существующий результат
          const updatedResult = await updateAnalysisResult(existingResult.id, {
            parameterLabel: metadata.label,
            value: numValue,
            unit: metadata.unit,
            method: results[param].method?.trim() || undefined,
          });
          savedResultId = updatedResult.id;
        } else {
          // Создаем новый результат
          const newResult: AnalysisResultInput = {
            analysisId: createdAnalysis.id,
            parameterName: param,
            parameterLabel: metadata.label,
            value: numValue,
            unit: metadata.unit,
            method: results[param].method?.trim() || undefined,
          };
          const createdResults = await createAnalysisResults([newResult]);
          savedResultId = createdResults[0]?.id;
        }

        if (savedResultId) {
          savedResultIds.push(savedResultId);

          // Проверяем соответствие нормам (триггеры БД тоже это делают, но для немедленной обратной связи)
          try {
            const compliance = await checkResultCompliance(savedResultId);
            if (compliance.status === 'exceeded') {
              toast.warning(
                `Превышение норматива: ${metadata.label} (${numValue} ${metadata.unit})`
              );
            } else if (compliance.status === 'warning') {
              toast.info(
                `Предупреждение: ${metadata.label} близко к пределу нормы`
              );
            }
          } catch (complianceError: any) {
            // Не критично, если проверка не удалась - триггеры БД все равно проверят
            console.warn('[WaterAnalysisForm] Предупреждение при проверке соответствия:', complianceError);
          }
        }
      }

      // Загрузка PDF файла, если он был выбран
      if (pdfFile && externalLab) {
        try {
          setUploadingPdf(true);
          const pdfUrl = await uploadAnalysisPDF(pdfFile, createdAnalysis.id);
          
          // Обновляем анализ с URL файла
          const existingUrls = isEditMode ? attachmentUrls : [];

          await update(createdAnalysis.id, {
            attachmentUrls: [...existingUrls, pdfUrl],
          });
          setAttachmentUrls([...existingUrls, pdfUrl]);
        } catch (err: any) {
          console.error('[WaterAnalysisForm] Ошибка загрузки PDF:', err);
          toast.warning('Анализ сохранен, но не удалось загрузить PDF файл: ' + (err.message || 'Неизвестная ошибка'));
        } finally {
          setUploadingPdf(false);
        }
      }

      toast.success(`Анализ успешно ${isEditMode ? 'обновлен' : 'создан'}!`);
      
      if (onSave) {
        onSave();
      } else {
        // Переходим на страницу просмотра созданного/обновленного анализа
        navigate(ROUTES.WATER_QUALITY_ANALYSIS_VIEW(createdAnalysis.id));
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

  if (loadingPoints || loadingExistingAnalysis || loadingAnalysis) {
    return (
      <div className="water-analysis-form">
        <div className="loading-message">
          {loadingExistingAnalysis || loadingAnalysis 
            ? 'Загрузка данных анализа...' 
            : 'Загрузка пунктов отбора проб...'}
        </div>
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

          <div className="form-group">
            <label>Дата отбора пробы *</label>
            <input
              type="date"
              value={sampleDate}
              onChange={(e) => setSampleDate(e.target.value)}
              required
            />
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
                <label>PDF файл анализа</label>
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.type !== 'application/pdf') {
                        toast.error('Пожалуйста, выберите PDF файл');
                        e.target.value = '';
                        return;
                      }
                      if (file.size > 10 * 1024 * 1024) {
                        toast.error('Размер файла не должен превышать 10 МБ');
                        e.target.value = '';
                        return;
                      }
                      setPdfFile(file);
                    } else {
                      setPdfFile(null);
                    }
                  }}
                  disabled={uploadingPdf || saving}
                />
                {pdfFile && (
                  <small className="file-info">
                    Выбран файл: {pdfFile.name} ({(pdfFile.size / 1024).toFixed(2)} КБ)
                  </small>
                )}
                {uploadingPdf && (
                  <small className="uploading-info">Загрузка PDF файла...</small>
                )}
              </div>

              {attachmentUrls.length > 0 && (
                <div className="form-group">
                  <label>Прикрепленные файлы</label>
                  <div className="attachments-list">
                    {attachmentUrls.map((url) => (
                      <div key={url} className="attachment-item">
                        <a href={url} target="_blank" rel="noreferrer">
                          Открыть PDF
                        </a>
                        <button
                          type="button"
                          className="delete-attachment-button"
                          onClick={() => handleRemoveAttachment(url)}
                          disabled={saving || uploadingPdf || removingAttachmentUrl === url}
                        >
                          {removingAttachmentUrl === url ? 'Удаление...' : 'Удалить'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
            disabled={saving || uploadingPdf}
          >
            {saving || uploadingPdf
              ? (uploadingPdf ? 'Загрузка файла...' : 'Сохранение...')
              : (isEditMode ? 'Сохранить изменения' : 'Создать анализ')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default WaterAnalysisForm;
