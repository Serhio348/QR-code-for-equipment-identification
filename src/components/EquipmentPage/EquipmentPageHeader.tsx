/**
 * EquipmentPageHeader.tsx
 * 
 * НАЗНАЧЕНИЕ:
 * Компонент заголовка страницы оборудования.
 * Содержит название оборудования и кнопки действий.
 * 
 * АРХИТЕКТУРА:
 * - Отображает название оборудования
 * - Кнопки "Редактировать" и "Удалить"
 * - Обрабатывает удаление оборудования
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Equipment } from '../../types/equipment';
import { getEquipmentEditUrl } from '../../utils/routes';
import './EquipmentPageHeader.css';

interface EquipmentPageHeaderProps {
  equipment: Equipment | null;
  onDelete: () => void;
  deleting: boolean;
  onOpenMaintenanceLog?: () => void;
}

/**
 * Компонент EquipmentPageHeader
 * 
 * ЛОГИКА:
 * - Отображает название оборудования или заглушку
 * - Кнопка "Редактировать" открывает форму редактирования
 * - Кнопка "Удалить" вызывает onDelete с подтверждением
 */
export const EquipmentPageHeader: React.FC<EquipmentPageHeaderProps> = ({
  equipment,
  onDelete,
  deleting,
  onOpenMaintenanceLog
}) => {
  const navigate = useNavigate();

  return (
    <div className="page-header">
      <h1>{equipment?.name || 'Оборудование'}</h1>
      
      {equipment && (
        <div className="header-actions">
          <button
            className="header-button maintenance-button"
            onClick={onOpenMaintenanceLog}
            type="button"
          >
            Журнал обслуживания
          </button>
          <button
            className="header-button edit-button"
            onClick={() => navigate(getEquipmentEditUrl(equipment.id))}
          >
            Редактировать
          </button>
          <button
            className="header-button delete-button"
            onClick={onDelete}
            disabled={deleting}
          >
            {deleting ? 'Удаление...' : '🗑️ Удалить'}
          </button>
        </div>
      )}
    </div>
  );
};

export default EquipmentPageHeader;

