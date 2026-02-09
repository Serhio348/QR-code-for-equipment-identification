import React, { useEffect } from 'react';
import DriveFilesList from '../../equipment/components/DriveFilesList';
import { logUserActivity } from '@/features/user-activity/services/activityLogsApi';
import './DocumentationModal.css';

interface DocumentationModalProps {
  folderUrl: string;
  equipmentName?: string;
  onClose: () => void;
}

const DocumentationModal: React.FC<DocumentationModalProps> = ({
  folderUrl,
  equipmentName,
  onClose
}) => {
  // Логирование открытия окна документации
  useEffect(() => {
    logUserActivity(
      'documentation_open',
      `Открытие окна документации${equipmentName ? `: "${equipmentName}"` : ''}`,
      {
        entityType: 'other',
        metadata: {
          folderUrl,
          equipmentName: equipmentName || undefined,
        },
      }
    ).catch(() => {});
  }, [folderUrl, equipmentName]);

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
    <div className="documentation-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="documentation-modal" onClick={stopPropagation}>
        <div className="documentation-modal__header">
          <h2>
            Документация{equipmentName ? ` — ${equipmentName}` : ''}
          </h2>
          <button
            className="documentation-modal__close"
            onClick={onClose}
            aria-label="Закрыть окно документации"
            type="button"
          >
            ×
          </button>
        </div>
        <div className="documentation-modal__content">
          <DriveFilesList folderUrl={folderUrl} equipmentName={equipmentName || ''} />
        </div>
      </div>
    </div>
  );
};

export default DocumentationModal;

