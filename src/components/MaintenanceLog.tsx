/**
 * Компонент журнала обслуживания оборудования
 * 
 * Отображает и позволяет управлять записями журнала обслуживания
 * для конкретного оборудования через API
 */

import React, { useState, useEffect } from 'react';
import { MaintenanceEntry, MaintenanceEntryInput } from '../types/equipment';
import { 
  getMaintenanceLog, 
  addMaintenanceEntry, 
  deleteMaintenanceEntry 
} from '../services/equipmentApi';
import { formatDate } from '../utils/dateFormatting';
import './MaintenanceLog.css';

interface MaintenanceLogProps {
  /** ID оборудования, для которого отображается журнал */
  equipmentId: string;
}

const MaintenanceLog: React.FC<MaintenanceLogProps> = ({ equipmentId }) => {
  const [entries, setEntries] = useState<MaintenanceEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [formData, setFormData] = useState<MaintenanceEntryInput>({
    date: new Date().toISOString().split('T')[0],
    type: '',
    description: '',
    performedBy: '',
    status: 'completed'
  });

  /**
   * Загрузка журнала обслуживания при монтировании компонента
   */
  useEffect(() => {
    loadMaintenanceLog();
  }, [equipmentId]);

  /**
   * Загрузить журнал обслуживания с сервера
   */
  const loadMaintenanceLog = async () => {
    if (!equipmentId) return;

    setLoading(true);
    setError(null);

    try {
      const log = await getMaintenanceLog(equipmentId);
      setEntries(log);
    } catch (err: any) {
      console.error('Ошибка загрузки журнала:', err);
      setError(`Не удалось загрузить журнал обслуживания: ${err.message || 'Неизвестная ошибка'}`);
    } finally {
      setLoading(false);
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

    try {
      const newEntry = await addMaintenanceEntry(equipmentId, formData);
      // Добавляем новую запись в начало списка
      setEntries([newEntry, ...entries]);
      // Очищаем форму
      setFormData({
        date: new Date().toISOString().split('T')[0],
        type: '',
        description: '',
        performedBy: '',
        status: 'completed'
      });
    } catch (err: any) {
      console.error('Ошибка добавления записи:', err);
      const errorMessage = err.message || 'Неизвестная ошибка';
      
      // Если ошибка говорит о том, что запись может быть добавлена, перезагружаем журнал
      if (errorMessage.includes('может быть добавлена') || errorMessage.includes('не удалось подтвердить')) {
        setError('Запись может быть добавлена. Обновляю журнал...');
        // Перезагружаем журнал через небольшую задержку
        setTimeout(() => {
          loadMaintenanceLog();
        }, 2000);
      } else {
        setError(`Не удалось добавить запись: ${errorMessage}`);
      }
    } finally {
      setSaving(false);
    }
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
              <option value="Промывка">Промывка</option>
              <option value="Замена засыпки">Замена засыпки</option>
              <option value="Проверка">Проверка</option>
              <option value="Ремонт">Ремонт</option>
              <option value="Другое">Другое</option>
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

        <button type="submit" className="submit-button" disabled={saving}>
          {saving ? 'Добавление...' : 'Добавить запись'}
        </button>
      </form>

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
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MaintenanceLog;
