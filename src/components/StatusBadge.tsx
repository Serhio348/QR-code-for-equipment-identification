/**
 * StatusBadge.tsx
 * 
 * НАЗНАЧЕНИЕ:
 * Компонент для отображения бейджа статуса оборудования.
 * Используется в списке оборудования и других местах для визуального отображения статуса.
 * 
 * АРХИТЕКТУРА:
 * - Переиспользуемый компонент для единообразного отображения статусов
 * - Поддерживает статусы: 'active', 'inactive'
 * - Автоматически применяет соответствующие CSS классы
 */

import React from 'react';
import { EquipmentStatus } from '../features/equipment/types/equipment';
import './StatusBadge.css';

interface StatusBadgeProps {
  status: EquipmentStatus | string;
  className?: string;
}

/**
 * Компонент StatusBadge
 * 
 * ЛОГИКА:
 * - Принимает status и возвращает соответствующий бейдж
 * - Применяет CSS классы для стилизации (status-active, status-inactive)
 * - Отображает локализованный текст статуса
 * 
 * ИСПОЛЬЗОВАНИЕ:
 * <StatusBadge status="active" />
 * <StatusBadge status="inactive" />
 */
export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  /**
   * Получить текст статуса для отображения
   */
  const getStatusText = (status: string): string => {
    switch (status) {
      case 'active':
        return 'Активен';
      case 'inactive':
        return 'Неактивен';
      default:
        return status; // Для неизвестных статусов возвращаем как есть
    }
  };

  /**
   * Получить CSS класс для статуса
   */
  const getStatusClass = (status: string): string => {
    switch (status) {
      case 'active':
        return 'status-active';
      case 'inactive':
        return 'status-inactive';
      default:
        return 'status-unknown';
    }
  };

  return (
    <span className={`status-badge ${getStatusClass(status)} ${className}`.trim()}>
      {getStatusText(status)}
    </span>
  );
};

export default StatusBadge;

