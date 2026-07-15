import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Equipment } from '../../types/equipment';
import { ROUTES } from '../../../../shared/utils/routes';
import './EquipmentPageHeader.css';

interface EquipmentLocationState {
  returnTo?: string;
}

interface EquipmentPageHeaderProps {
  equipment: Equipment | null;
  loading?: boolean;
  isAdmin?: boolean;
  onOpenMaintenanceLog?: () => void;
  onOpenDocumentation?: () => void;
  onEditEquipment?: () => void;
  onDeleteEquipment?: () => void;
  onExportPDF?: () => void;
  documentationAvailable?: boolean;
  deleting?: boolean;
}

export const EquipmentPageHeader: React.FC<EquipmentPageHeaderProps> = ({
  equipment,
  loading = false,
  isAdmin = false,
  onOpenMaintenanceLog,
  onOpenDocumentation,
  onEditEquipment,
  onDeleteEquipment,
  onExportPDF,
  documentationAvailable = false,
  deleting = false
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const title = loading ? 'Загрузка...' : (equipment?.name || '');

  const handleBackToList = (): void => {
    const state = location.state as EquipmentLocationState | null;
    const returnTo = state?.returnTo;
    if (returnTo && returnTo.startsWith(ROUTES.EQUIPMENT)) {
      navigate(returnTo);
      return;
    }
    navigate(ROUTES.EQUIPMENT);
  };

  const handleMenuToggle = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const handleActionClick = (callback?: () => void) => {
    if (callback) {
      callback();
      setIsMenuOpen(false);
    }
  };

  return (
    <div className="page-header">
      <button
        className="header-back-button"
        onClick={handleBackToList}
        title="Назад к списку оборудования"
        disabled={loading}
        type="button"
      >
        ← Назад
      </button>
      <h1>{title}</h1>
      
      {/* Кнопка меню для мобильных */}
      <button 
        className="mobile-menu-toggle"
        onClick={handleMenuToggle}
        aria-label="Открыть меню"
      >
        ☰ Меню
      </button>

      {/* Выпадающее меню для мобильных */}
      {isMenuOpen && (
        <>
          <div className="mobile-menu-overlay" onClick={() => setIsMenuOpen(false)} />
          <div className="mobile-menu">
            <div className="mobile-menu-header">
              <h3>Меню</h3>
              <button 
                className="mobile-menu-close"
                onClick={() => setIsMenuOpen(false)}
                aria-label="Закрыть меню"
              >
                ✕
              </button>
            </div>
            
            <div className="mobile-menu-content">
              <div className="mobile-menu-section">
                <h4>Действия</h4>
                <div className="mobile-menu-actions">
                  {onOpenDocumentation && documentationAvailable && (
                    <button
                      className="mobile-menu-button documentation-button"
                      onClick={() => handleActionClick(onOpenDocumentation)}
                      disabled={loading}
                    >
                      📁 Документация
                    </button>
                  )}
                  
                  {onOpenMaintenanceLog && (
                    <button
                      className="mobile-menu-button maintenance-button"
                      onClick={() => handleActionClick(onOpenMaintenanceLog)}
                      disabled={loading}
                    >
                      📋 Журнал обслуживания
                    </button>
                  )}
                  
                  {isAdmin && (
                    <>
                      {onExportPDF && (
                        <button
                          className="mobile-menu-button export-button"
                          onClick={() => handleActionClick(onExportPDF)}
                          disabled={loading}
                        >
                          📄 Экспорт в PDF
                        </button>
                      )}
                      
                      {onEditEquipment && (
                        <button
                          className="mobile-menu-button edit-button"
                          onClick={() => handleActionClick(onEditEquipment)}
                          disabled={loading}
                        >
                          ✏️ Редактировать
                        </button>
                      )}
                      
                      {onDeleteEquipment && (
                        <button
                          className="mobile-menu-button delete-button"
                          onClick={() => handleActionClick(onDeleteEquipment)}
                          disabled={deleting || loading}
                        >
                          {deleting ? '⏳ Удаление...' : '🗑️ Удалить'}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Десктопная версия */}
      <div className="desktop-actions">
        <div className="header-actions">
          {onOpenDocumentation && documentationAvailable && (
            <button
              className="header-button documentation-button"
              onClick={onOpenDocumentation}
              disabled={loading}
            >
              📁 Документация
            </button>
          )}
          
          {onOpenMaintenanceLog && (
            <button
              className="header-button maintenance-button"
              onClick={onOpenMaintenanceLog}
              disabled={loading}
            >
              📋 Журнал обслуживания
            </button>
          )}
          
          {isAdmin && (
            <>
              {onExportPDF && (
                <button
                  className="header-button export-button"
                  onClick={onExportPDF}
                  disabled={loading}
                >
                  📄 Экспорт в PDF
                </button>
              )}
              
              {onEditEquipment && (
                <button
                  className="header-button edit-button"
                  onClick={onEditEquipment}
                  disabled={loading}
                >
                  ✏️ Редактировать
                </button>
              )}
              
              {onDeleteEquipment && (
                <button
                  className="header-button delete-button"
                  onClick={onDeleteEquipment}
                  disabled={deleting || loading}
                >
                  {deleting ? '⏳ Удаление...' : '🗑️ Удалить'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default EquipmentPageHeader;

