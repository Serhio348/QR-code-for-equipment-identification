/**
 * Компонент журнала обслуживания оборудования
 * 
 * Отображает и позволяет управлять записями журнала обслуживания
 * для конкретного оборудования через API
 */

import React, { useState, useEffect } from 'react';
import { MaintenanceEntry, MaintenanceEntryInput, MaintenanceFile, Equipment } from '../types/equipment';
import { TechnicalInspectionData } from '../types/technicalInspection';
import {
  getMaintenanceLog,
  addMaintenanceEntry,
  deleteMaintenanceEntry,
  updateEquipment,
  getEquipmentById
} from '../services/equipmentApi';
import { uploadMaintenanceFile, attachFilesToEntry } from '../services/maintenanceApi';
import { formatDate } from '@/shared/utils/dateFormatting';
import { exportToPDF } from '@/shared/utils/pdfExport';
import { InspectionExportSettings } from '@/shared/types/inspectionExport';
import { TechnicalInspectionForm } from './TechnicalInspectionForm';
import { TechnicalInspectionPDF } from './TechnicalInspectionPDF';
import InspectionExportSettingsModal from './InspectionExportSettingsModal';
import { showSuccess } from '@/shared/utils/toast';
import './MaintenanceLog.css';

interface MaintenanceLogProps {
  /** ID оборудования, для которого отображается журнал */
  equipmentId: string;
  /** Опциональный ID общего журнала обслуживания (для нескольких единиц оборудования) */
  maintenanceSheetId?: string;
  /** Опциональная информация об оборудовании (если уже загружена) */
  equipment?: Equipment;
}

const MaintenanceLog: React.FC<MaintenanceLogProps> = ({ equipmentId, maintenanceSheetId, equipment: propEquipment }) => {
  const [entries, setEntries] = useState<MaintenanceEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [savingProgress, setSavingProgress] = useState<number>(0);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<Equipment | null>(propEquipment || null);
  const [showInspectionForm, setShowInspectionForm] = useState<boolean>(false);
  const [showInspectionPDF, setShowInspectionPDF] = useState<boolean>(false);
  const [showInspectionExportSettings, setShowInspectionExportSettings] = useState<boolean>(false);
  const [inspectionData, setInspectionData] = useState<TechnicalInspectionData | null>(null);

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState<boolean>(false);
  const [uploadStep, setUploadStep] = useState<string>('');
  const [uploadFileIndex, setUploadFileIndex] = useState<number>(0);
  const [uploadTotalFiles, setUploadTotalFiles] = useState<number>(0);

  const [formData, setFormData] = useState<MaintenanceEntryInput>({
    date: new Date().toISOString().split('T')[0],
    type: '',
    description: '',
    performedBy: '',
    status: 'completed'
  });

  /**
   * Загрузка журнала обслуживания и информации об оборудовании при монтировании компонента
   */
  useEffect(() => {
    loadMaintenanceLog();
    // Всегда загружаем оборудование для определения типа
    if (propEquipment) {
      // Если оборудование передано, используем его
      setEquipment(propEquipment);
      console.log('✅ Оборудование передано в пропсах:', {
        id: propEquipment.id,
        name: propEquipment.name,
        type: propEquipment.type,
        isEnergySource: propEquipment.type === 'energy_source'
      });
    } else if (equipmentId) {
      // Если не передано, загружаем по ID
      loadEquipment();
    }
  }, [equipmentId, maintenanceSheetId, propEquipment]);

  /**
   * Загрузить информацию об оборудовании
   */
  const loadEquipment = async () => {
    try {
      const eq = await getEquipmentById(equipmentId);
      if (eq) {
        console.log('✅ Оборудование загружено:', {
          id: eq.id,
          name: eq.name,
          type: eq.type,
          isEnergySource: eq.type === 'energy_source'
        });
        setEquipment(eq);
      } else {
        console.warn('⚠️ Оборудование не найдено для ID:', equipmentId);
      }
    } catch (err) {
      console.error('❌ Ошибка загрузки оборудования:', err);
    }
  };

  /**
   * Загрузить журнал обслуживания с сервера
   */
  const loadMaintenanceLog = async () => {
    if (!equipmentId) {
      console.warn('⚠️ loadMaintenanceLog: equipmentId не указан');
      return;
    }

    console.log('📋 loadMaintenanceLog вызвана:', {
      equipmentId,
      maintenanceSheetId,
      timestamp: new Date().toISOString()
    });

    setLoading(true);
    setError(null);

    try {
      const log = await getMaintenanceLog(equipmentId, maintenanceSheetId);
      console.log('📋 loadMaintenanceLog: получено записей:', log.length);
      console.log('📋 loadMaintenanceLog: записи:', log);
      setEntries(log);
      
      if (log.length === 0) {
        console.warn('⚠️ loadMaintenanceLog: журнал пустой. Проверьте:');
        console.warn('  1. Есть ли записи в Google Sheets таблице');
        console.warn('  2. Правильный ли equipmentId:', equipmentId);
        console.warn('  3. Настройки переменных окружения на Railway');
      }
    } catch (err: any) {
      console.error('❌ Ошибка загрузки журнала в компоненте:', {
        error: err,
        message: err.message,
        stack: err.stack,
        equipmentId,
        maintenanceSheetId
      });
      setError(`Не удалось загрузить журнал обслуживания: ${err.message || 'Неизвестная ошибка'}`);
    } finally {
      setLoading(false);
      console.log('📋 loadMaintenanceLog: завершена');
    }
  };

  /**
   * Обработка отправки формы для добавления новой записи
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!equipmentId) {
      setError('ID оборудования не указан');
      return;
    }

    setSaving(true);
    setError(null);
    setUploadStep('Сохранение записи...');

    try {
      const newEntry = await addMaintenanceEntry(equipmentId, formData, maintenanceSheetId);

      // Проверяем, является ли это временной записью
      const isTempEntry = newEntry.id.startsWith('temp-');

      // Загружаем файлы, если выбраны и запись создана с реальным ID
      if (selectedFiles.length > 0 && !newEntry.id.startsWith('temp-')) {
        setUploadingFiles(true);
        setUploadTotalFiles(selectedFiles.length);
        const uploadedFiles: MaintenanceFile[] = [];

        for (let fi = 0; fi < selectedFiles.length; fi++) {
          const file = selectedFiles[fi];
          setUploadFileIndex(fi + 1);
          setUploadStep(`Загрузка файла ${fi + 1} из ${selectedFiles.length}: ${file.name}`);
          try {
            const uploaded = await uploadMaintenanceFile(
              equipmentId,
              newEntry.id,
              file,
              formData.date
            );
            uploadedFiles.push(uploaded);
          } catch (fileError) {
            console.warn('Не удалось загрузить файл:', file.name, fileError);
          }
        }

        if (uploadedFiles.length > 0) {
          setUploadStep('Прикрепление файлов к записи...');
          try {
            await attachFilesToEntry(newEntry.id, uploadedFiles);
            newEntry.files = uploadedFiles;
          } catch (attachError) {
            console.warn('Не удалось прикрепить файлы к записи:', attachError);
          }
        }
        setUploadingFiles(false);
        setUploadFileIndex(0);
        setUploadTotalFiles(0);
      }

      if (isTempEntry) {
        setEntries([newEntry, ...entries]);
        setError(null);
        setFormData({
          date: new Date().toISOString().split('T')[0],
          type: '',
          description: '',
          performedBy: '',
          status: 'completed'
        });
        setSelectedFiles([]);
        setTimeout(() => {
          loadMaintenanceLog();
        }, 3000);
      } else {
        setEntries([newEntry, ...entries]);
        setError(null);

        const allEntries = [newEntry, ...entries];
        const sortedEntries = allEntries
          .filter(e => e.status === 'completed' && e.date)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        if (sortedEntries.length > 0) {
          const lastMaintenanceDate = sortedEntries[0].date;
          try {
            await updateEquipment(equipmentId, {
              lastMaintenanceDate: lastMaintenanceDate
            });
          } catch (updateError) {
            console.warn('Не удалось обновить дату последнего обслуживания:', updateError);
          }
        }

        setFormData({
          date: new Date().toISOString().split('T')[0],
          type: '',
          description: '',
          performedBy: '',
          status: 'completed'
        });
        setSelectedFiles([]);
      }
    } catch (err: any) {
      console.error('Ошибка добавления записи:', err);
      const errorMessage = err.message || 'Неизвестная ошибка';
      setError(`Не удалось добавить запись: ${errorMessage}`);
      
      // Все равно пытаемся обновить журнал на случай, если запись добавилась
      setTimeout(() => {
        loadMaintenanceLog();
      }, 3000);
    } finally {
      setSaving(false);
      setUploadStep('');
    }
  };

  /**
   * Сохранение данных технического освидетельствования в журнал
   */
  const handleInspectionSave = async (data: TechnicalInspectionData) => {
    if (!equipment) return;

    setSaving(true);
    setSavingProgress(0);
    setError(null);

    try {
      // Шаг 1: Подготовка данных (20%)
      setSavingProgress(20);

      // Вычисляем дату следующего освидетельствования (текущая дата + 1 год)
      const inspectionDate = new Date(data.inspectionDate);
      const nextInspectionDate = new Date(inspectionDate);
      nextInspectionDate.setFullYear(nextInspectionDate.getFullYear() + 1);

      // Форматируем дату в формат YYYY-MM-DD
      const nextInspectionDateStr = nextInspectionDate.toISOString().split('T')[0];

      // Формируем описание для записи в журнал
      const membersList = data.commissionMembers
        .filter(m => m.name.trim() !== '')
        .map(m => `${m.position ? m.position + ', ' : ''}${m.name}`)
        .join('; ');

      const description = `Техническое освидетельствование №${data.actNumber}.
Организация: ${data.organization || 'не указана'}.
Количество котлов: ${data.boilersCount || 'не указано'}.
Предохранительные устройства: ${data.safetyDeviceType || 'не указаны'}.
Объект: ${data.facilityName || ''}${data.facilityAddress ? ', ' + data.facilityAddress : ''}.
Комиссия: ${data.commissionChairmanPosition ? data.commissionChairmanPosition + ', ' : ''}${data.commissionChairman}${membersList ? '; ' + membersList : ''}.
Заключение: ${data.conclusion === 'suitable' ? 'Годен к эксплуатации' : 'Не годен к эксплуатации'}.
Следующее освидетельствование: ${nextInspectionDateStr}.
${data.notes ? `Примечания: ${data.notes}` : ''}`;

      // Создаем запись в журнале
      const entryData: MaintenanceEntryInput = {
        date: data.inspectionDate,
        type: 'Техническое освидетельствование',
        description: description,
        performedBy: data.commissionChairman,
        status: 'completed'
      };

      // Шаг 2: Сохранение записи в журнал (40%)
      setSavingProgress(40);
      await addMaintenanceEntry(equipmentId, entryData, maintenanceSheetId);

      // Шаг 3: Обновление даты следующего испытания (70%)
      setSavingProgress(70);

      // Обновляем дату следующего испытания в характеристиках оборудования
      // Автоматически устанавливаем дату следующего освидетельствования (текущая дата + 1 год)
      try {
        await updateEquipment(equipmentId, {
          specs: {
            ...equipment.specs,
            nextTestDate: nextInspectionDateStr
          }
        });
        console.log('✅ Дата следующего испытания обновлена:', nextInspectionDateStr);
      } catch (updateError) {
        console.warn('⚠️ Не удалось обновить дату следующего испытания:', updateError);
      }

      // Шаг 4: Обновление журнала (90%)
      setSavingProgress(90);
      await loadMaintenanceLog();

      // Шаг 5: Завершение (100%)
      setSavingProgress(100);

      // Успешное сохранение - закрываем форму
      setShowInspectionForm(false);

      // Показываем уведомление об успехе
      showSuccess('✅ Акт технического освидетельствования успешно сохранен в журнал!');
    } catch (err: any) {
      console.error('Ошибка сохранения освидетельствования:', err);
      setError(`Не удалось сохранить освидетельствование: ${err.message || 'Неизвестная ошибка'}`);
      setSavingProgress(0);
    } finally {
      setSaving(false);
      // Сбрасываем прогресс через небольшую задержку для визуального эффекта
      setTimeout(() => {
        setSavingProgress(0);
      }, 500);
    }
  };

  /**
   * Открытие модального окна настроек экспорта PDF акта освидетельствования
   */
  const handleGenerateInspectionPDF = (data: TechnicalInspectionData) => {
    if (!equipment) return;
    setInspectionData(data);
    setShowInspectionExportSettings(true);
  };

  /**
   * Экспорт PDF акта освидетельствования с настройками
   */
  const handleExportInspectionWithSettings = async (settings: InspectionExportSettings) => {
    if (!equipment || !inspectionData) return;

    setShowInspectionExportSettings(false);
    setShowInspectionPDF(true);

    // Задержка для рендеринга компонента (увеличена для надежности)
    setTimeout(async () => {
      try {
        console.log('Начинаем экспорт акта освидетельствования...');
        const filename = `Акт_освидетельствования_${equipment.name.replace(/[^a-zA-Z0-9]/g, '_')}_${inspectionData.actNumber.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
        await exportToPDF('technical-inspection-pdf', filename, settings);
        console.log('Экспорт успешно завершен');
        setShowInspectionPDF(false);
        setInspectionData(null);
      } catch (error) {
        console.error('Ошибка генерации PDF:', error);
        alert(`Ошибка при генерации PDF: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}\n\nПроверьте консоль браузера для деталей.`);
        setShowInspectionPDF(false);
        setInspectionData(null);
      }
    }, 1000);
  };

  /**
   * Удаление записи из журнала
   */
  const handleDelete = async (entryId: string) => {
    if (!window.confirm('Вы уверены, что хотите удалить эту запись?')) {
      return;
    }

    setDeleting(entryId);
    setError(null);

    try {
      await deleteMaintenanceEntry(entryId);
      // Удаляем запись из списка
      setEntries(entries.filter(entry => entry.id !== entryId));
    } catch (err: any) {
      console.error('Ошибка удаления записи:', err);
      setError(`Не удалось удалить запись: ${err.message || 'Неизвестная ошибка'}`);
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="maintenance-log">
        <h2>Журнал обслуживания</h2>
        <div className="loading-message">Загрузка журнала обслуживания...</div>
      </div>
    );
  }

  return (
    <div className="maintenance-log">
      <h2>Журнал обслуживания</h2>

      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)} className="close-error">×</button>
        </div>
      )}

      {/* Кнопка для открытия формы технического освидетельствования (только для энергоисточников) */}
      {equipment?.type === 'energy_source' && (
        <div style={{ marginBottom: '20px', textAlign: 'center' }}>
          <button
            type="button"
            onClick={() => setShowInspectionForm(true)}
            className="inspection-form-button"
            style={{ 
              background: '#2196F3', 
              color: 'white', 
              border: 'none', 
              padding: '14px 28px', 
              borderRadius: '6px', 
              fontSize: '16px', 
              fontWeight: '600', 
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
              transition: 'background 0.3s'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = '#0b7dda'}
            onMouseOut={(e) => e.currentTarget.style.background = '#2196F3'}
          >
            📋 Техническое освидетельствование
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="maintenance-form">
        <div className="form-row">
          <div className="form-group">
            <label>Дата обслуживания:</label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              required
              disabled={saving}
            />
          </div>

          <div className="form-group">
            <label>Тип обслуживания:</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              required
              disabled={saving}
            >
              <option value="">Выберите тип</option>
              <option value="Техническое обслуживание">Техническое обслуживание</option>
              <option value="Ремонт">Ремонт</option>
              <option value="Осмотр">Осмотр</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Описание:</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={3}
            required
            disabled={saving}
            placeholder="Опишите выполненную работу..."
          />
        </div>

        <div className="form-group">
          <label>Выполнил:</label>
          <input
            type="text"
            value={formData.performedBy}
            onChange={(e) => setFormData({ ...formData, performedBy: e.target.value })}
            required
            disabled={saving}
            placeholder="ФИО исполнителя"
          />
        </div>

        <div className="form-group">
          <label>Документы (PDF, Word, Excel и др.):</label>
          <input
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.png,.jpg,.jpeg"
            onChange={(e) => setSelectedFiles(Array.from(e.target.files || []))}
            disabled={saving || uploadingFiles}
          />
          {selectedFiles.length > 0 && (
            <div className="selected-files-preview">
              {selectedFiles.map((f, i) => (
                <span key={i} className="selected-file-chip">
                  {f.name} ({(f.size / 1024).toFixed(0)} KB)
                  <button type="button" onClick={() => setSelectedFiles(files => files.filter((_, idx) => idx !== i))}>×</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {(saving || uploadingFiles) && (
          <div className="upload-progress-container">
            <div className="upload-progress-text">{uploadStep}</div>
            <div className="upload-progress-bar">
              <div
                className="upload-progress-fill"
                style={{
                  width: uploadTotalFiles > 0
                    ? `${(uploadFileIndex / (uploadTotalFiles + 1)) * 100}%`
                    : '100%',
                  animationDuration: uploadTotalFiles > 0 ? 'none' : undefined,
                }}
              />
            </div>
          </div>
        )}

        <button type="submit" className="submit-button" disabled={saving || uploadingFiles}>
          {uploadingFiles ? 'Загрузка файлов...' : saving ? 'Сохранение...' : 'Добавить запись'}
        </button>
      </form>

      {/* Форма технического освидетельствования */}
      {showInspectionForm && equipment && (
        <div className="inspection-form-overlay">
          <div className="inspection-form-container">
            <TechnicalInspectionForm
              equipment={equipment}
              onSave={handleInspectionSave}
              onCancel={() => setShowInspectionForm(false)}
              onGeneratePDF={handleGenerateInspectionPDF}
              saving={saving}
              savingProgress={savingProgress}
            />
          </div>
        </div>
      )}

      {/* Модальное окно настроек экспорта акта освидетельствования */}
      {showInspectionExportSettings && inspectionData && (
        <InspectionExportSettingsModal
          isOpen={showInspectionExportSettings}
          onClose={() => {
            setShowInspectionExportSettings(false);
            setInspectionData(null);
          }}
          onExport={handleExportInspectionWithSettings}
          actNumber={inspectionData.actNumber}
        />
      )}

      {/* PDF акта освидетельствования (скрытый, для генерации) */}
      {showInspectionPDF && equipment && inspectionData && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          visibility: 'hidden',
          opacity: 0,
          pointerEvents: 'none',
          zIndex: -1,
          overflow: 'auto'
        }}>
          <TechnicalInspectionPDF
            equipment={equipment}
            inspectionData={inspectionData}
          />
        </div>
      )}

      <div className="entries-list">
        <h3>История обслуживания ({entries.length})</h3>
        {entries.length === 0 ? (
          <p className="no-entries">Записи отсутствуют. Добавьте первую запись о обслуживании.</p>
        ) : (
          <div className="entries">
            {entries.map(entry => (
              <div key={entry.id} className="entry">
                <div className="entry-header">
                  <span className="entry-date">{formatDate(entry.date)}</span>
                  <span className="entry-type">{entry.type}</span>
                  {entry.status === 'planned' && (
                    <span className="entry-status-planned">Запланировано</span>
                  )}
                  <button
                    className="delete-button"
                    onClick={() => handleDelete(entry.id)}
                    disabled={deleting === entry.id}
                    title="Удалить запись"
                  >
                    {deleting === entry.id ? '...' : '×'}
                  </button>
                </div>
                <div className="entry-description">{entry.description}</div>
                <div className="entry-footer">
                  Выполнил: {entry.performedBy}
                </div>
                {entry.files && entry.files.length > 0 && (
                  <div className="entry-files">
                    <span className="entry-files-label">Документы:</span>
                    {entry.files.map(file => (
                      <a
                        key={file.id}
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="entry-file-link"
                      >
                        {file.name}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MaintenanceLog;
