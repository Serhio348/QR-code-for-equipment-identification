/**
 * StatusMessages.tsx
 * 
 * НАЗНАЧЕНИЕ:
 * Компонент для отображения сообщений о состоянии операций.
 * Показывает индикаторы сохранения, успеха и ошибок.
 * 
 * АРХИТЕКТУРА:
 * - Индикатор сохранения (saving)
 * - Сообщение об успехе (success)
 * - Сообщение об ошибке (error)
 */

import React from 'react';
import './StatusMessages.css';

interface StatusMessagesProps {
  saving: boolean;
  success: boolean;
  error: string | null;
  loading: boolean;
}

/**
 * Компонент StatusMessages
 * 
 * ЛОГИКА:
 * - Отображает индикатор сохранения, если saving = true
 * - Отображает сообщение об успехе, если success = true
 * - Отображает сообщение об ошибке, если error не null и не идет загрузка
 */
export const StatusMessages: React.FC<StatusMessagesProps> = ({
  saving,
  success,
  error,
  loading
}) => {
  return (
    <>
      {saving && (
        <div className="saving-message">
          <span className="saving-spinner">⏳</span> Сохранение данных...
        </div>
      )}
      
      {success && (
        <div className="success-message">
          <span className="success-icon">✓</span> Данные успешно сохранены
        </div>
      )}
      
      {error && !loading && (
        <div className="error-message">
          <span className="error-icon">⚠</span> {error}
        </div>
      )}
    </>
  );
};

export default StatusMessages;

