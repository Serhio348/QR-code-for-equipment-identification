/**
 * Форма добавления/редактирования оборудования
 * Поддерживает режимы создания и редактирования
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Equipment, EquipmentType, EquipmentStatus, EquipmentSpecs } from '../types/equipment';
import { addEquipment, updateEquipment, getEquipmentById } from '../services/equipmentApi';
import { generateQRCodeUrl } from '../utils/urlGenerator';
import { getEquipmentViewUrl } from '../utils/routes';
import './EquipmentForm.css';

interface EquipmentFormProps {
  equipmentId?: string; // Если передан - режим редактирования, иначе - создание
  onSave?: (equipment: Equipment) => void;
  onCancel?: () => void;
}

const EquipmentForm: React.FC<EquipmentFormProps> = ({ equipmentId, onSave, onCancel }) => {
  const navigate = useNavigate();
  const isEditMode = !!equipmentId;

  // Основные поля формы
  const [name, setName] = useState<string>('');
  const [type, setType] = useState<EquipmentType>('filter');
  const [status, setStatus] = useState<EquipmentStatus>('active');
  const [googleDriveUrl, setGoogleDriveUrl] = useState<string>('');
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [commissioningDate, setCommissioningDate] = useState<string>('');

  // Характеристики (динамические поля)
  const [specs, setSpecs] = useState<EquipmentSpecs>({});

  // Состояния
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  // Загрузка данных для редактирования
  useEffect(() => {
    if (isEditMode && equipmentId) {
      loadEquipment();
    }
  }, [equipmentId, isEditMode]);

  // Нормализация даты в формат YYYY-MM-DD
  // ВАЖНО: Не используем new Date() для парсинга, чтобы избежать проблем с часовыми поясами
  const normalizeDate = (dateString?: string): string => {
    if (!dateString) return '';
    
    // Убираем возможное время из строки даты
    const dateOnly = dateString.split('T')[0].split(' ')[0].trim();
    
    // Проверяем, что это формат YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
      return dateOnly;
    }
    
    // Если формат не YYYY-MM-DD, пытаемся извлечь дату
    const match = dateOnly.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return match[0];
    }
    
    return '';
  };

  const loadEquipment = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const equipment = await getEquipmentById(equipmentId!);
      if (equipment) {
        setName(equipment.name);
        setType(equipment.type);
        setStatus(equipment.status);
        setGoogleDriveUrl(equipment.googleDriveUrl);
        setQrCodeUrl(equipment.qrCodeUrl);
        // Нормализуем дату перед установкой в state
        setCommissioningDate(normalizeDate(equipment.commissioningDate));
        setSpecs(equipment.specs || {});
      } else {
        setError('Оборудование не найдено');
      }
    } catch (err: any) {
      console.error('Ошибка загрузки оборудования:', err);
      setError('Не удалось загрузить данные оборудования');
    } finally {
      setLoading(false);
    }
  };

  // Обработка изменения типа оборудования
  const handleTypeChange = (newType: EquipmentType) => {
    setType(newType);
    // Сбрасываем характеристики при смене типа
    setSpecs({});
  };

  // Обработка изменения характеристик
  const handleSpecChange = (key: string, value: string) => {
    setSpecs(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Валидация формы
  const validateForm = (): boolean => {
    if (!name.trim()) {
      setError('Название оборудования обязательно');
      return false;
    }
    // Google Drive URL обязателен только при редактировании
    // При создании он может быть создан автоматически
    if (isEditMode && !googleDriveUrl.trim()) {
      setError('URL Google Drive обязателен при редактировании');
      return false;
    }
    // QR Code URL обязателен только при редактировании
    // При создании он будет сгенерирован автоматически
    if (isEditMode && !qrCodeUrl.trim()) {
      setError('URL для QR-кода обязателен при редактировании');
      return false;
    }
    return true;
  };

  // Сохранение формы
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      let finalGoogleDriveUrl = googleDriveUrl.trim();
      let finalQrCodeUrl = qrCodeUrl.trim();

      // Если это создание нового оборудования и не указан Google Drive URL,
      // backend автоматически создаст папку в Google Drive при добавлении оборудования.
      // Это решает проблему CORS, так как вся логика выполняется на сервере.
      // Нам не нужно делать отдельный запрос на создание папки.

      // Если URL для QR-кода не указан, используем Google Drive URL или генерируем
      if (!finalQrCodeUrl) {
        if (finalGoogleDriveUrl) {
          finalQrCodeUrl = finalGoogleDriveUrl;
        } else if (isEditMode && equipmentId) {
          finalQrCodeUrl = generateQRCodeUrl(equipmentId, finalGoogleDriveUrl);
        } else {
          // Для нового оборудования URL будет установлен после создания
          finalQrCodeUrl = '';
        }
      }

      // input type="date" уже возвращает YYYY-MM-DD, просто убираем возможное время для гарантии
      const normalizedCommissioningDate = commissioningDate ? commissioningDate.split('T')[0].trim() : undefined;
      
      console.log('💾 Сохранение оборудования:', {
        исходная_дата: commissioningDate,
        нормализованная_дата: normalizedCommissioningDate
      });
      
      const equipmentData: Partial<Equipment> = {
        name: name.trim(),
        type,
        status,
        specs,
        googleDriveUrl: finalGoogleDriveUrl,
        qrCodeUrl: finalQrCodeUrl,
        commissioningDate: normalizedCommissioningDate,
      };

      let savedEquipment: Equipment;

      if (isEditMode && equipmentId) {
        // Режим редактирования
        savedEquipment = await updateEquipment(equipmentId, equipmentData);
      } else {
        // Режим создания
        // Backend автоматически создаст папку в Google Drive, если googleDriveUrl не указан
        savedEquipment = await addEquipment(equipmentData as any);
        
        // После создания обновляем QR-код URL с правильным ID, если нужно
        // Используем URL из ответа backend (может быть создан автоматически)
        const driveUrl = savedEquipment.googleDriveUrl || finalGoogleDriveUrl;
        if (!savedEquipment.qrCodeUrl && driveUrl) {
          // Если backend создал папку, используем её URL для QR-кода
          savedEquipment = await updateEquipment(savedEquipment.id, {
            qrCodeUrl: driveUrl
          });
        } else if (!savedEquipment.qrCodeUrl) {
          // Если папка не была создана, генерируем URL на основе ID оборудования
          const generatedUrl = generateQRCodeUrl(savedEquipment.id, driveUrl);
          savedEquipment = await updateEquipment(savedEquipment.id, {
            qrCodeUrl: generatedUrl
          });
        }
      }

      setSuccess(true);
      
      // Вызываем callback если передан
      if (onSave) {
        onSave(savedEquipment);
      }

      // Перенаправляем на страницу оборудования через 1 секунду
      setTimeout(() => {
        navigate(getEquipmentViewUrl(savedEquipment.id));
      }, 1000);

    } catch (err: any) {
      console.error('Ошибка сохранения оборудования:', err);
      setError(`Ошибка сохранения: ${err.message || 'Не удалось сохранить оборудование'}`);
    } finally {
      setSaving(false);
    }
  };

  // Отмена
  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      navigate(-1);
    }
  };

  // Рендер полей характеристик в зависимости от типа
  const renderSpecFields = () => {
    switch (type) {
      case 'filter':
        return (
          <>
            <div className="form-group">
              <label>Высота:</label>
              <input
                type="text"
                value={specs.height || ''}
                onChange={(e) => handleSpecChange('height', e.target.value)}
                placeholder="Например: 1,5 м"
              />
            </div>
            <div className="form-group">
              <label>Диаметр:</label>
              <input
                type="text"
                value={specs.diameter || ''}
                onChange={(e) => handleSpecChange('diameter', e.target.value)}
                placeholder="Например: 0,8 м"
              />
            </div>
            <div className="form-group">
              <label>Производительность:</label>
              <input
                type="text"
                value={specs.capacity || ''}
                onChange={(e) => handleSpecChange('capacity', e.target.value)}
                placeholder="Например: 5 м³"
              />
            </div>
            <div className="form-group">
              <label>Площадь фильтрации:</label>
              <input
                type="text"
                value={specs.filtrationArea || ''}
                onChange={(e) => handleSpecChange('filtrationArea', e.target.value)}
                placeholder="Например: 0,5 м²"
              />
            </div>
            <div className="form-group">
              <label>Скорость фильтрации:</label>
              <input
                type="text"
                value={specs.filtrationSpeed || ''}
                onChange={(e) => handleSpecChange('filtrationSpeed', e.target.value)}
                placeholder="Например: 10 м/ч"
              />
            </div>
            <div className="form-group">
              <label>Материал засыпки:</label>
              <input
                type="text"
                value={specs.fillingMaterial || ''}
                onChange={(e) => handleSpecChange('fillingMaterial', e.target.value)}
                placeholder="Например: Nevtraco 1,0-2,5 мм"
              />
            </div>
            <div className="form-group">
              <label>Объем засыпки:</label>
              <input
                type="text"
                value={specs.fillingVolume || ''}
                onChange={(e) => handleSpecChange('fillingVolume', e.target.value)}
                placeholder="Например: 350 л"
              />
            </div>
          </>
        );
      case 'pump':
        return (
          <>
            <div className="form-group">
              <label>Производительность:</label>
              <input
                type="text"
                value={specs.capacity || ''}
                onChange={(e) => handleSpecChange('capacity', e.target.value)}
                placeholder="Например: 10 м³/ч"
              />
            </div>
            <div className="form-group">
              <label>Напор:</label>
              <input
                type="text"
                value={specs.head || ''}
                onChange={(e) => handleSpecChange('head', e.target.value)}
                placeholder="Например: 50 м"
              />
            </div>
            <div className="form-group">
              <label>Мощность:</label>
              <input
                type="text"
                value={specs.power || ''}
                onChange={(e) => handleSpecChange('power', e.target.value)}
                placeholder="Например: 5,5 кВт"
              />
            </div>
          </>
        );
      case 'tank':
        return (
          <>
            <div className="form-group">
              <label>Объем:</label>
              <input
                type="text"
                value={specs.volume || ''}
                onChange={(e) => handleSpecChange('volume', e.target.value)}
                placeholder="Например: 10 м³"
              />
            </div>
            <div className="form-group">
              <label>Высота:</label>
              <input
                type="text"
                value={specs.height || ''}
                onChange={(e) => handleSpecChange('height', e.target.value)}
                placeholder="Например: 2,5 м"
              />
            </div>
            <div className="form-group">
              <label>Диаметр:</label>
              <input
                type="text"
                value={specs.diameter || ''}
                onChange={(e) => handleSpecChange('diameter', e.target.value)}
                placeholder="Например: 2 м"
              />
            </div>
          </>
        );
      case 'valve':
        return (
          <>
            <div className="form-group">
              <label>Диаметр:</label>
              <input
                type="text"
                value={specs.diameter || ''}
                onChange={(e) => handleSpecChange('diameter', e.target.value)}
                placeholder="Например: DN50"
              />
            </div>
            <div className="form-group">
              <label>Тип клапана:</label>
              <input
                type="text"
                value={specs.valveType || ''}
                onChange={(e) => handleSpecChange('valveType', e.target.value)}
                placeholder="Например: Шаровой"
              />
            </div>
          </>
        );
      case 'other':
        return (
          <div className="form-group">
            <label>Дополнительные характеристики (JSON):</label>
            <textarea
              value={JSON.stringify(specs, null, 2)}
              onChange={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value);
                  setSpecs(parsed);
                } catch {
                  // Игнорируем ошибки парсинга при вводе
                }
              }}
              placeholder='{"ключ": "значение"}'
              rows={5}
            />
          </div>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="equipment-form">
        <div className="loading-message">Загрузка данных оборудования...</div>
      </div>
    );
  }

  return (
    <div className="equipment-form">
      <div className="form-header">
        <h2>{isEditMode ? 'Редактирование оборудования' : 'Добавление оборудования'}</h2>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Основные поля */}
        <div className="form-section">
          <h3>Основная информация</h3>
          
          <div className="form-group">
            <label>Название оборудования *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Фильтр обезжелезивания ФО-0,8-1,5 №1"
              required
            />
          </div>

          <div className="form-group">
            <label>Тип оборудования *</label>
            <select
              value={type}
              onChange={(e) => handleTypeChange(e.target.value as EquipmentType)}
              required
            >
              <option value="filter">Фильтр</option>
              <option value="pump">Насос</option>
              <option value="tank">Резервуар</option>
              <option value="valve">Клапан</option>
              <option value="other">Другое</option>
            </select>
          </div>

          <div className="form-group">
            <label>Статус *</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as EquipmentStatus)}
              required
            >
              <option value="active">Активен</option>
              <option value="inactive">Неактивен</option>
              <option value="archived">Архив</option>
            </select>
          </div>

          <div className="form-group">
            <label>URL Google Drive {isEditMode ? '*' : '(оставьте пустым для автоматического создания)'}</label>
            <input
              type="url"
              value={googleDriveUrl}
              onChange={(e) => setGoogleDriveUrl(e.target.value)}
              placeholder={isEditMode 
                ? "https://drive.google.com/drive/folders/..." 
                : "Оставьте пустым - папка создастся автоматически на сервере"}
              required={isEditMode}
            />
            {!isEditMode && (
              <small>Если оставить пустым, папка будет создана автоматически на сервере с названием оборудования. Это решает проблему CORS.</small>
            )}
          </div>

          <div className="form-group">
            <label>URL для QR-кода {isEditMode ? '*' : '(заполнится автоматически)'}</label>
            <input
              type="url"
              value={qrCodeUrl}
              onChange={(e) => setQrCodeUrl(e.target.value)}
              placeholder={isEditMode 
                ? "https://drive.google.com/drive/folders/..." 
                : "Заполнится автоматически на основе Google Drive URL"}
              required={isEditMode}
              disabled={!isEditMode && !googleDriveUrl.trim()}
            />
            <small>Обычно совпадает с URL Google Drive. {!isEditMode && 'Заполнится автоматически при создании папки.'}</small>
          </div>

          <div className="form-group">
            <label>Дата ввода в эксплуатацию</label>
            <input
              type="date"
              value={commissioningDate}
              onChange={(e) => {
                // input type="date" всегда возвращает YYYY-MM-DD, просто сохраняем как есть
                setCommissioningDate(e.target.value || '');
              }}
            />
          </div>
        </div>

        {/* Характеристики */}
        <div className="form-section">
          <h3>Характеристики</h3>
          {renderSpecFields()}
        </div>

        {/* Сообщения об ошибках и успехе */}
        {error && (
          <div className="error-message">
            <span className="error-icon">⚠</span> {error}
          </div>
        )}
        {success && (
          <div className="success-message">
            <span className="success-icon">✓</span> Оборудование успешно {isEditMode ? 'обновлено' : 'добавлено'}!
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
            {saving ? 'Сохранение...' : (isEditMode ? 'Сохранить изменения' : 'Добавить оборудование')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default EquipmentForm;

