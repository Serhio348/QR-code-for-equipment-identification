/**
 * EquipmentSidebar.tsx
 * 
 * НАЗНАЧЕНИЕ:
 * Боковая админ-панель для страницы оборудования.
 * Содержит все кнопки действий и управление датами.
 * 
 * АРХИТЕКТУРА:
 * - Фиксированная боковая панель слева
 * - Кнопки действий (Документация, Журнал, Редактировать, Удалить)
 * - Управление датами
 * - Кнопка экспорта в PDF
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Equipment } from '../../types/equipment';
import { getEquipmentEditUrl } from '../../utils/routes';
import DateEditor from './DateEditor';
import './EquipmentSidebar.css';

interface EquipmentSidebarProps {
  equipment: Equipment | null;
  onDelete: () => void;
  deleting: boolean;
  onOpenMaintenanceLog?: () => void;
  onOpenDocumentation?: () => void;
  documentationAvailable?: boolean;
  loading?: boolean;
  // Пропсы для дат
  commissioningDate: string;
  lastMaintenanceDate: string;
  onCommissioningDateChange: (date: string) => void;
  onLastMaintenanceDateChange: (date: string) => void;
  onSaveDates: () => void;
  savingDates: boolean;
  onExportPDF: () => void;
  // Состояние открытия/закрытия на мобильных
  isOpen: boolean;
  onToggle: () => void;
}

/**
 * Компонент EquipmentSidebar
 * 
 * ЛОГИКА:
 * - Отображает боковую панель с кнопками действий
 * - Управление датами ввода в эксплуатацию и последнего обслуживания
 * - Кнопка "Сохранить даты" сохраняет изменения
 * - Кнопка "Экспорт в PDF" экспортирует табличку
 * - Кнопки действий (Документация, Журнал, Редактировать, Удалить)
 */
export const EquipmentSidebar: React.FC<EquipmentSidebarProps> = ({
  equipment,
  onDelete,
  deleting,
  onOpenMaintenanceLog,
  onOpenDocumentation,
  documentationAvailable = true,
  loading = false,
  commissioningDate,
  lastMaintenanceDate,
  onCommissioningDateChange,
  onLastMaintenanceDateChange,
  onSaveDates,
  savingDates,
  onExportPDF,
  isOpen,
  onToggle
}) => {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  return (
    <>
      {/* Overlay для мобильных устройств */}
      {isOpen && <div className="sidebar-overlay" onClick={onToggle} />}
      
      {/* Боковая панель */}
      <aside className={`equipment-sidebar ${isOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-header">
          <h2>Панель управления</h2>
          <button className="sidebar-close" onClick={onToggle} aria-label="Закрыть панель">
            ✕
          </button>
        </div>

        <div className="sidebar-content">
          {/* Блок с датами - только для администраторов */}
          {isAdmin && (
            <div className="sidebar-section">
              <h3 className="sidebar-section-title">Даты</h3>
              <DateEditor
                commissioningDate={commissioningDate}
                lastMaintenanceDate={lastMaintenanceDate}
                onCommissioningDateChange={onCommissioningDateChange}
                onLastMaintenanceDateChange={onLastMaintenanceDateChange}
                onSave={onSaveDates}
                saving={savingDates || loading}
              />
            </div>
          )}

          {/* Блок с кнопками действий */}
          {equipment && (
            <div className="sidebar-section">
              <h3 className="sidebar-section-title">Действия</h3>
              <div className="sidebar-actions">
                {/* Кнопки для всех пользователей */}
                <button
                  className="sidebar-button documentation-button"
                  onClick={onOpenDocumentation}
                  type="button"
                  disabled={!onOpenDocumentation || !documentationAvailable || loading}
                >
                  📁 Документация
                </button>
                <button
                  className="sidebar-button maintenance-button"
                  onClick={onOpenMaintenanceLog}
                  type="button"
                  disabled={loading}
                >
                  📋 Журнал обслуживания
                </button>
                
                {/* Кнопки только для администраторов */}
                {isAdmin && (
                  <>
                    <button
                      className="sidebar-button export-button"
                      onClick={onExportPDF}
                      type="button"
                      disabled={loading}
                    >
                      📄 Экспорт в PDF
                    </button>
                    <button
                      className="sidebar-button edit-button"
                      onClick={() => navigate(getEquipmentEditUrl(equipment.id))}
                      disabled={loading}
                    >
                      ✏️ Редактировать
                    </button>
                    <button
                      className="sidebar-button delete-button"
                      onClick={onDelete}
                      disabled={deleting || loading}
                    >
                      {deleting ? '⏳ Удаление...' : '🗑️ Удалить'}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};

export default EquipmentSidebar;

