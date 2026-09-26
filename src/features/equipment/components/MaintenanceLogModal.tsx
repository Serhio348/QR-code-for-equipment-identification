import React, { useEffect, useState, useCallback } from 'react';
import { Equipment } from '../types/equipment';
import MaintenanceLog from './MaintenanceLog';
import { logUserActivity } from '@/features/user-activity/services/activityLogsApi';
import { useDialogA11y } from '@/features/common/hooks/useDialogA11y';
import { leaveDecision } from '@/features/common/services/leaveDecision';
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
  const [activity, setActivity] = useState({ dirty: false, saving: false });
  const requestClose = useCallback(() => {
    const decision = leaveDecision(activity);
    if (decision === 'block') {
      window.alert('Дождитесь окончания сохранения.');
      return;
    }
    if (decision === 'confirm' && !window.confirm('Есть несохранённый ввод. Закрыть журнал?')) return;
    onClose();
  }, [activity, onClose]);
  const { dialogRef, titleId } = useDialogA11y(true, requestClose);
  // Логирование открытия журнала обслуживания
  useEffect(() => {
    logUserActivity(
      'maintenance_log_open',
      `Открытие журнала обслуживания${equipmentName ? `: "${equipmentName}"` : ''}`,
      {
        entityType: 'equipment',
        entityId: equipmentId,
        metadata: {
          equipmentName: equipmentName || undefined,
          hasMaintenanceSheet: !!maintenanceSheetId,
        },
      }
    ).catch(() => {});
  }, [equipmentId, equipmentName, maintenanceSheetId]);

  const stopPropagation = (event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  return (
    <div
      className="maintenance-modal-overlay"
      onClick={requestClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      ref={dialogRef}
      tabIndex={-1}
    >
      <div className="maintenance-modal" onClick={stopPropagation}>
        <div className="maintenance-modal__header">
          <h2 id={titleId}>
            Журнал обслуживания{equipmentName ? ` — ${equipmentName}` : ''}
          </h2>
          <button
            className="maintenance-modal__close"
            onClick={requestClose}
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
            onActivityChange={setActivity}
          />
        </div>
      </div>
    </div>
  );
};

export default MaintenanceLogModal;

