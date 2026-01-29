import React, { useEffect } from 'react';
import { Equipment } from '../types/equipment';
import MaintenanceLog from './MaintenanceLog';
import './MaintenanceLogModal.css';

interface MaintenanceLogModalProps {
  equipmentId: string;
  equipmentName?: string;
  maintenanceSheetId?: string;
  equipment?: Equipment;
  onClose: () => void;
}

const MaintenanceLogModal: React.FC<MaintenanceLogModalProps> = ({
  equipmentId,
  equipmentName,
  maintenanceSheetId,
  equipment,
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
          <MaintenanceLog 
            equipmentId={equipmentId} 
            maintenanceSheetId={maintenanceSheetId}
            equipment={equipment}
          />
        </div>
      </div>
    </div>
  );
};

export default MaintenanceLogModal;

