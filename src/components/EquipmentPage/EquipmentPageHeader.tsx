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
import { Equipment } from '../../types/equipment';
import './EquipmentPageHeader.css';

interface EquipmentPageHeaderProps {
  equipment: Equipment | null;
  loading?: boolean;
  onToggleSidebar: () => void;
}

/**
 * Компонент EquipmentPageHeader
 * 
 * ЛОГИКА:
 * - Отображает название оборудования или заглушку
 * - Кнопка для открытия/закрытия боковой панели на мобильных устройствах
 */
export const EquipmentPageHeader: React.FC<EquipmentPageHeaderProps> = ({
  equipment,
  loading = false,
  onToggleSidebar
}) => {
  const title = loading ? 'Загрузка...' : (equipment?.name || '');

  return (
    <div className="page-header">
      <button 
        className="sidebar-toggle"
        onClick={onToggleSidebar}
        aria-label="Открыть панель управления"
      >
        ☰
      </button>
      <h1>{title}</h1>
    </div>
  );
};

export default EquipmentPageHeader;

