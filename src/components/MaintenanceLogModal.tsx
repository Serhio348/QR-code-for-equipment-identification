import React, { useEffect } from 'react';
import MaintenanceLog from './MaintenanceLog';
import './MaintenanceLogModal.css';

interface MaintenanceLogModalProps {
  equipmentId: string;
  equipmentName?: string;
  onClose: () => void;
}

const MaintenanceLogModal: React.FC<MaintenanceLogModalProps> = ({
  equipmentId,
  equipmentName,
  onClose
}) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const stopPropagation = (event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  return (
    <div className="maintenance-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="maintenance-modal" onClick={stopPropagation}>
        <div className="maintenance-modal__header">
          <h2>
            Журнал обслуживания{equipmentName ? ` — ${equipmentName}` : ''}
          </h2>
          <button
            className="maintenance-modal__close"
            onClick={onClose}
            aria-label="Закрыть журнал обслуживания"
            type="button"
          >
            ×
          </button>
        </div>
        <div className="maintenance-modal__content">
          <MaintenanceLog equipmentId={equipmentId} />
        </div>
      </div>
    </div>
  );
};

export default MaintenanceLogModal;

