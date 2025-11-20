import React, { useState, useEffect } from 'react';
import './MaintenanceLog.css';

export interface MaintenanceEntry {
  id: string;
  date: string;
  type: string;
  description: string;
  performedBy: string;
}

const MaintenanceLog: React.FC = () => {
  const [entries, setEntries] = useState<MaintenanceEntry[]>(() => {
    const saved = localStorage.getItem('maintenanceEntries');
    return saved ? JSON.parse(saved) : [];
  });

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    type: '',
    description: '',
    performedBy: ''
  });

  useEffect(() => {
    localStorage.setItem('maintenanceEntries', JSON.stringify(entries));
  }, [entries]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newEntry: MaintenanceEntry = {
      id: Date.now().toString(),
      ...formData
    };
    setEntries([newEntry, ...entries]);
    setFormData({
      date: new Date().toISOString().split('T')[0],
      type: '',
      description: '',
      performedBy: ''
    });
  };

  const handleDelete = (id: string) => {
    setEntries(entries.filter(entry => entry.id !== id));
  };

  return (
    <div className="maintenance-log">
      <h2>Журнал обслуживания оборудования</h2>
      
      <form onSubmit={handleSubmit} className="maintenance-form">
        <div className="form-row">
          <div className="form-group">
            <label>Дата обслуживания:</label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              required
            />
          </div>
          
          <div className="form-group">
            <label>Тип обслуживания:</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              required
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
          />
        </div>
        
        <div className="form-group">
          <label>Выполнил:</label>
          <input
            type="text"
            value={formData.performedBy}
            onChange={(e) => setFormData({ ...formData, performedBy: e.target.value })}
            required
          />
        </div>
        
        <button type="submit" className="submit-button">Добавить запись</button>
      </form>
      
      <div className="entries-list">
        <h3>История обслуживания</h3>
        {entries.length === 0 ? (
          <p className="no-entries">Записи отсутствуют</p>
        ) : (
          <div className="entries">
            {entries.map(entry => (
              <div key={entry.id} className="entry">
                <div className="entry-header">
                  <span className="entry-date">{new Date(entry.date).toLocaleDateString('ru-RU')}</span>
                  <span className="entry-type">{entry.type}</span>
                  <button 
                    className="delete-button"
                    onClick={() => handleDelete(entry.id)}
                  >
                    ×
                  </button>
                </div>
                <div className="entry-description">{entry.description}</div>
                <div className="entry-footer">Выполнил: {entry.performedBy}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MaintenanceLog;

