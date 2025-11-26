/**
 * DateEditor.tsx
 * 
 * НАЗНАЧЕНИЕ:
 * Компонент для редактирования дат оборудования.
 * Позволяет изменять дату ввода в эксплуатацию и дату последнего обслуживания.
 * 
 * АРХИТЕКТУРА:
 * - Два поля для дат (commissioningDate, lastMaintenanceDate)
 * - Кнопка сохранения дат
 * - Обработка состояния сохранения
 */

import React from 'react';
import './DateEditor.css';

interface DateEditorProps {
  commissioningDate: string;
  lastMaintenanceDate: string;
  onCommissioningDateChange: (date: string) => void;
  onLastMaintenanceDateChange: (date: string) => void;
  onSave: () => void;
  saving: boolean;
}

/**
 * Компонент DateEditor
 * 
 * ЛОГИКА:
 * - Отображает два поля для ввода дат
 * - При изменении даты обновляет локальное состояние
 * - При нажатии "Сохранить" вызывает onSave
 * - Блокирует поля во время сохранения
 */
export const DateEditor: React.FC<DateEditorProps> = ({
  commissioningDate,
  lastMaintenanceDate,
  onCommissioningDateChange,
  onLastMaintenanceDateChange,
  onSave,
  saving
}) => {
  return (
    <div className="date-editor">
      <div className="date-editor-fields">
        <label>
          Дата ввода в эксплуатацию:
          <input
            type="date"
            value={commissioningDate}
            onChange={(e) => {
              // input type="date" всегда возвращает YYYY-MM-DD
              onCommissioningDateChange(e.target.value || '');
            }}
            className="date-input"
            disabled={saving}
          />
        </label>
        
        <label>
          Дата последнего обслуживания:
          <input
            type="date"
            value={lastMaintenanceDate}
            onChange={(e) => {
              // input type="date" всегда возвращает YYYY-MM-DD
              onLastMaintenanceDateChange(e.target.value || '');
            }}
            className="date-input"
            disabled={saving}
          />
        </label>
        
        <button 
          onClick={onSave} 
          className="save-button"
          disabled={saving}
        >
          {saving ? 'Сохранение...' : '💾 Сохранить даты'}
        </button>
      </div>
    </div>
  );
};

export default DateEditor;

