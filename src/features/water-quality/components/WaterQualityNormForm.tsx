/**
 * Форма создания/редактирования норматива качества воды
 * Поддерживает режимы создания и редактирования
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import type {
  WaterQualityNormInput,
  WaterQualityParameter,
} from '../types/waterQuality';
import { PARAMETER_METADATA, getAllParameters } from '../types/waterQuality';
import { useWaterQualityNormManagement, useWaterQualityNorm } from '../hooks/useWaterQualityNorms';
import { useSamplingPoints } from '../hooks/useSamplingPoints';
import { ROUTES } from '../../../utils/routes';
import './WaterQualityNormForm.css';

interface WaterQualityNormFormProps {
  normId?: string; // Если передан - режим редактирования, иначе - создание
  onSave?: () => void;
  onCancel?: () => void;
}

const WaterQualityNormForm: React.FC<WaterQualityNormFormProps> = ({ normId, onSave, onCancel }) => {
  const navigate = useNavigate();
  const isEditMode = !!normId;
  const { create, update, error } = useWaterQualityNormManagement();
  const { norm: existingNorm, loading: loadingNorm } = useWaterQualityNorm(isEditMode ? normId || null : null);
  const { samplingPoints, loading: loadingPoints } = useSamplingPoints();

  // Основные поля
  const [samplingPointId, setSamplingPointId] = useState<string>('');
  const [equipmentId, setEquipmentId] = useState<string>('');
  const [parameterName, setParameterName] = useState<WaterQualityParameter>('iron');
  const [unit, setUnit] = useState<string>('');
  const [isActive, setIsActive] = useState<boolean>(true);
  const [enableNotifications, setEnableNotifications] = useState<boolean>(true);

  // Диапазоны значений
  const [minAllowed, setMinAllowed] = useState<string>('');
  const [maxAllowed, setMaxAllowed] = useState<string>('');
  const [warningMin, setWarningMin] = useState<string>('');
  const [warningMax, setWarningMax] = useState<string>('');

  // Пороги уведомлений
  const [warningThresholdPercent, setWarningThresholdPercent] = useState<string>('10');
  const [alarmThresholdPercent, setAlarmThresholdPercent] = useState<string>('20');

  // Дополнительные поля
  const [regulationReference, setRegulationReference] = useState<string>('');
  const [regulationDocumentUrl, setRegulationDocumentUrl] = useState<string>('');

  const [saving, setSaving] = useState<boolean>(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Валидация диапазонов
  const validateRanges = (): boolean => {
    const errors: Record<string, string> = {};

    // Проверка допустимого диапазона
    if (minAllowed && maxAllowed) {
      const min = parseFloat(minAllowed);
      const max = parseFloat(maxAllowed);
      if (!isNaN(min) && !isNaN(max) && min > max) {
        errors.allowedRange = 'Минимальное значение не может быть больше максимального';
      }
    }

    // Проверка диапазона предупреждения
    if (warningMin && warningMax) {
      const min = parseFloat(warningMin);
      const max = parseFloat(warningMax);
      if (!isNaN(min) && !isNaN(max) && min > max) {
        errors.warningRange = 'Минимальное значение не может быть больше максимального';
      }
    }

    // Проверка порогов уведомлений
    if (warningThresholdPercent) {
      const value = parseFloat(warningThresholdPercent);
      if (!isNaN(value) && (value < 0 || value > 100)) {
        errors.warningThreshold = 'Порог предупреждения должен быть от 0 до 100%';
      }
    }

    if (alarmThresholdPercent) {
      const value = parseFloat(alarmThresholdPercent);
      if (!isNaN(value) && (value < 0 || value > 100)) {
        errors.alarmThreshold = 'Порог тревоги должен быть от 0 до 100%';
      }
    }

    // Проверка, что порог тревоги больше порога предупреждения
    if (warningThresholdPercent && alarmThresholdPercent) {
      const warning = parseFloat(warningThresholdPercent);
      const alarm = parseFloat(alarmThresholdPercent);
      if (!isNaN(warning) && !isNaN(alarm) && alarm <= warning) {
        errors.thresholds = 'Порог тревоги должен быть больше порога предупреждения';
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Загрузка данных для редактирования
  useEffect(() => {
    if (isEditMode && existingNorm) {
      setSamplingPointId(existingNorm.samplingPointId || '');
      setEquipmentId(existingNorm.equipmentId || '');
      setParameterName(existingNorm.parameterName);
      setUnit(existingNorm.unit);
      setIsActive(existingNorm.isActive);
      setEnableNotifications(existingNorm.enableNotifications);
      setMinAllowed(existingNorm.minAllowed?.toString() || '');
      setMaxAllowed(existingNorm.maxAllowed?.toString() || '');
      setWarningMin(existingNorm.warningMin?.toString() || '');
      setWarningMax(existingNorm.warningMax?.toString() || '');
      setWarningThresholdPercent(existingNorm.warningThresholdPercent?.toString() || '10');
      setAlarmThresholdPercent(existingNorm.alarmThresholdPercent?.toString() || '20');
      setRegulationReference(existingNorm.regulationReference || '');
      setRegulationDocumentUrl(existingNorm.regulationDocumentUrl || '');
    } else if (!isEditMode) {
      // При создании устанавливаем единицу измерения по умолчанию для выбранного параметра
      const metadata = PARAMETER_METADATA[parameterName];
      if (metadata) {
        setUnit(metadata.unit);
      }
    }
  }, [isEditMode, existingNorm, parameterName]);

  // Обновление единицы измерения при изменении параметра
  useEffect(() => {
    const metadata = PARAMETER_METADATA[parameterName];
    if (metadata) {
      setUnit(metadata.unit);
    }
  }, [parameterName]);

  // Валидация при изменении значений
  useEffect(() => {
    if (minAllowed || maxAllowed || warningMin || warningMax || 
        warningThresholdPercent || alarmThresholdPercent) {
      validateRanges();
    }
  }, [minAllowed, maxAllowed, warningMin, warningMax, 
      warningThresholdPercent, alarmThresholdPercent]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!unit.trim()) {
      toast.error('Укажите единицу измерения');
      return;
    }

    if (!validateRanges()) {
      toast.error('Исправьте ошибки валидации перед сохранением');
      return;
    }

    setSaving(true);

    try {
      const normInput: WaterQualityNormInput = {
        samplingPointId: samplingPointId.trim() || undefined,
        equipmentId: equipmentId.trim() || undefined,
        parameterName,
        unit: unit.trim(),
        minAllowed: minAllowed ? parseFloat(minAllowed) : undefined,
        maxAllowed: maxAllowed ? parseFloat(maxAllowed) : undefined,
        warningMin: warningMin ? parseFloat(warningMin) : undefined,
        warningMax: warningMax ? parseFloat(warningMax) : undefined,
        warningThresholdPercent: warningThresholdPercent ? parseFloat(warningThresholdPercent) : undefined,
        alarmThresholdPercent: alarmThresholdPercent ? parseFloat(alarmThresholdPercent) : undefined,
        regulationReference: regulationReference.trim() || undefined,
        regulationDocumentUrl: regulationDocumentUrl.trim() || undefined,
        enableNotifications,
        isActive,
      };

      let savedNorm;
      if (isEditMode && normId) {
        savedNorm = await update(normId, normInput);
      } else {
        savedNorm = await create(normInput);
      }

      if (!savedNorm) {
        throw new Error('Не удалось сохранить норматив');
      }

      toast.success(`Норматив успешно ${isEditMode ? 'обновлен' : 'создан'}!`);
      
      if (onSave) {
        onSave();
      } else {
        navigate(ROUTES.WATER_QUALITY_NORMS);
      }
    } catch (err: any) {
      console.error('[WaterQualityNormForm] Ошибка сохранения:', err);
      toast.error(err.message || 'Не удалось сохранить норматив');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      navigate(ROUTES.WATER_QUALITY_NORMS);
    }
  };

  if (loadingNorm || loadingPoints) {
    return (
      <div className="water-quality-norm-form">
        <div className="loading-message">
          {loadingNorm ? 'Загрузка данных норматива...' : 'Загрузка пунктов отбора проб...'}
        </div>
      </div>
    );
  }

  const selectedParameterMetadata = PARAMETER_METADATA[parameterName];

  return (
    <div className="water-quality-norm-form">
      <div className="form-header">
        <h2>{isEditMode ? 'Редактирование норматива' : 'Создание норматива качества воды'}</h2>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Основная информация */}
        <div className="form-section">
          <h3>Основная информация</h3>

          <div className="form-group">
            <label>Пункт отбора проб</label>
            <div className="form-group-with-action">
              <select
                value={samplingPointId}
                onChange={(e) => setSamplingPointId(e.target.value)}
              >
                <option value="">Общий норматив (для всех пунктов)</option>
                {samplingPoints.length === 0 ? (
                  <option value="" disabled>Нет доступных пунктов отбора проб</option>
                ) : (
                  samplingPoints
                    .filter((p) => p.isActive)
                    .map((point) => (
                      <option key={point.id} value={point.id}>
                        {point.code} - {point.name}
                      </option>
                    ))
                )}
              </select>
              {samplingPoints.length === 0 && (
                <button
                  type="button"
                  onClick={() => navigate(ROUTES.WATER_QUALITY_SAMPLING_POINT_NEW)}
                  className="create-sampling-point-button"
                >
                  Создать точку
                </button>
              )}
            </div>
            <small className="field-description">
              <strong>Рекомендуется:</strong> Выберите конкретную точку отбора проб, так как для разных точек могут быть разные нормативы. 
              Если не указана, норматив будет применяться ко всем пунктам (глобальный норматив).
            </small>
          </div>

          <div className="form-group">
            <label>Параметр *</label>
            <select
              value={parameterName}
              onChange={(e) => setParameterName(e.target.value as WaterQualityParameter)}
              required
            >
              {getAllParameters().map((param) => (
                <option key={param} value={param}>
                  {PARAMETER_METADATA[param].label}
                </option>
              ))}
            </select>
            {selectedParameterMetadata?.description && (
              <small className="field-description">{selectedParameterMetadata.description}</small>
            )}
          </div>

          <div className="form-group">
            <label>Единица измерения *</label>
            <input
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="мг/л, pH, °C и т.д."
              required
            />
          </div>

          <div className="form-group">
            <label>ID оборудования</label>
            <input
              type="text"
              value={equipmentId}
              onChange={(e) => setEquipmentId(e.target.value)}
              placeholder="Опционально"
            />
            <small className="field-description">
              Дополнительная привязка к оборудованию (опционально)
            </small>
          </div>
        </div>

        {/* Диапазоны значений */}
        <div className="form-section">
          <h3>Диапазоны значений</h3>
          <div className="section-description">
            <p>Укажите границы для разных уровней соответствия норме. Можно указать только минимум или только максимум, или оба значения.</p>
            <ul>
              <li><strong>Допустимый диапазон:</strong> Значения, которые не требуют действий (границы нормы)</li>
              <li><strong>Диапазон предупреждения:</strong> Значения, при которых генерируется предупреждение (близко к границе)</li>
            </ul>
          </div>

          <div className="range-group">
            <h4>Допустимый диапазон</h4>
            {validationErrors.allowedRange && (
              <div className="validation-error">{validationErrors.allowedRange}</div>
            )}
            <div className="range-inputs">
              <div className="form-group">
                <label>Минимум</label>
                <input
                  type="number"
                  step="0.0001"
                  value={minAllowed}
                  onChange={(e) => setMinAllowed(e.target.value)}
                  placeholder="Опционально"
                  className={validationErrors.allowedRange ? 'error' : ''}
                />
              </div>
              <div className="form-group">
                <label>Максимум</label>
                <input
                  type="number"
                  step="0.0001"
                  value={maxAllowed}
                  onChange={(e) => setMaxAllowed(e.target.value)}
                  placeholder="Опционально"
                  className={validationErrors.allowedRange ? 'error' : ''}
                />
              </div>
            </div>
          </div>

          <div className="range-group">
            <h4>Диапазон предупреждения</h4>
            <div className="range-inputs">
              <div className="form-group">
                <label>Минимум</label>
                <input
                  type="number"
                  step="0.0001"
                  value={warningMin}
                  onChange={(e) => setWarningMin(e.target.value)}
                  placeholder="Опционально"
                />
              </div>
              <div className="form-group">
                <label>Максимум</label>
                <input
                  type="number"
                  step="0.0001"
                  value={warningMax}
                  onChange={(e) => setWarningMax(e.target.value)}
                  placeholder="Опционально"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Пороги уведомлений */}
        <div className="form-section">
          <h3>Пороги уведомлений</h3>
          {(validationErrors.warningThreshold || validationErrors.alarmThreshold || validationErrors.thresholds) && (
            <div className="validation-error">
              {validationErrors.warningThreshold || validationErrors.alarmThreshold || validationErrors.thresholds}
            </div>
          )}

          <div className="form-group">
            <label>Порог предупреждения (%)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={warningThresholdPercent}
              onChange={(e) => setWarningThresholdPercent(e.target.value)}
              placeholder="10"
              className={validationErrors.warningThreshold || validationErrors.thresholds ? 'error' : ''}
            />
            <small className="field-description">
              Процент отклонения от нормы, при котором генерируется предупреждение
            </small>
          </div>

          <div className="form-group">
            <label>Порог тревоги (%)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={alarmThresholdPercent}
              onChange={(e) => setAlarmThresholdPercent(e.target.value)}
              placeholder="20"
              className={validationErrors.alarmThreshold || validationErrors.thresholds ? 'error' : ''}
            />
            <small className="field-description">
              Процент отклонения от нормы, при котором генерируется критическое оповещение (должен быть больше порога предупреждения)
            </small>
          </div>
        </div>

        {/* Дополнительная информация */}
        <div className="form-section">
          <h3>Дополнительная информация</h3>

          <div className="form-group">
            <label>Ссылка на нормативный документ</label>
            <input
              type="text"
              value={regulationReference}
              onChange={(e) => setRegulationReference(e.target.value)}
              placeholder="Например: СанПиН 2.1.4.1074-01"
            />
          </div>

          <div className="form-group">
            <label>URL документа</label>
            <input
              type="url"
              value={regulationDocumentUrl}
              onChange={(e) => setRegulationDocumentUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
        </div>

        {/* Настройки */}
        <div className="form-section">
          <h3>Настройки</h3>

          <div className="form-group checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={enableNotifications}
                onChange={(e) => setEnableNotifications(e.target.checked)}
              />
              <span>Включить уведомления о превышении</span>
            </label>
          </div>

          <div className="form-group checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <span>Норматив активен</span>
            </label>
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
            {saving ? 'Сохранение...' : (isEditMode ? 'Сохранить изменения' : 'Создать норматив')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default WaterQualityNormForm;
