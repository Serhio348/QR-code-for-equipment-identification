/**
 * Страница просмотра конкретного оборудования
 * Отображает табличку оборудования с возможностью редактирования дат
 */

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import EquipmentPlate from '../components/EquipmentPlate';
import MaintenanceLogModal from '../components/MaintenanceLogModal';
import DocumentationModal from '../components/DocumentationModal';
import PlateExportSettingsModal from '../components/PlateExportSettingsModal';
import EquipmentPageHeader from '../components/EquipmentPage/EquipmentPageHeader';
import StatusMessages from '../components/EquipmentPage/StatusMessages';
import { useAuth } from '../contexts/AuthContext';
import { getEquipmentEditUrl } from '../utils/routes';
import { filterSpecs, FilterSpecs } from '../types/equipment';
import { PlateExportSettings } from '../types/plateExport';
import { deleteEquipment } from '../services/equipmentApi';
import { useEquipmentData, clearEquipmentCache } from '../hooks/useEquipmentData';
import { useEquipmentDates } from '../hooks/useEquipmentDates';
import { exportToPDF } from '../utils/pdfExport';
import { ROUTES } from '../utils/routes';
import './EquipmentPage.css';

const EquipmentPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  
  // Используем хук для загрузки данных (с кешированием)
  const { data: equipmentData, loading, error: loadError } = useEquipmentData(id && id !== 'new' ? id : undefined);
  
  // Преобразуем данные в один объект (если это одно оборудование)
  const currentEquipment = equipmentData && !Array.isArray(equipmentData) ? equipmentData : null;
  
  // Используем хук для получения дат (только для отображения в карточке)
  const {
    commissioningDate,
    lastMaintenanceDate,
    error: datesError
  } = useEquipmentDates({ equipment: currentEquipment });
  
  // Локальные состояния для операций удаления
  const [deleting, setDeleting] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isMaintenanceLogOpen, setMaintenanceLogOpen] = useState(false);
  const [isDocumentationOpen, setDocumentationOpen] = useState(false);
  
  // Состояния для настроек экспорта
  const [isExportSettingsOpen, setIsExportSettingsOpen] = useState(false);
  
  // Объединяем ошибки загрузки и удаления
  const error = loadError || datesError || deleteError;

  useEffect(() => {
    if (!currentEquipment) {
      if (isMaintenanceLogOpen) {
        setMaintenanceLogOpen(false);
      }
      if (isDocumentationOpen) {
        setDocumentationOpen(false);
      }
      if (isExportSettingsOpen) {
        setIsExportSettingsOpen(false);
      }
    }
  }, [currentEquipment, isMaintenanceLogOpen, isDocumentationOpen, isExportSettingsOpen]);

  // Отладочное логирование для диагностики проблемы с характеристиками
  useEffect(() => {
    if (currentEquipment) {
      console.log('🔍 Отладочная информация об оборудовании:', {
        id: currentEquipment.id,
        name: currentEquipment.name,
        type: currentEquipment.type,
        specs: currentEquipment.specs,
        specsType: typeof currentEquipment.specs,
        specsKeys: currentEquipment.specs ? Object.keys(currentEquipment.specs) : [],
        specsStringified: JSON.stringify(currentEquipment.specs, null, 2)
      });
    }
  }, [currentEquipment]);

  /**
   * Удаление оборудования
   */
  const handleDelete = async () => {
    if (!currentEquipment) return;

    const confirmMessage = `Вы уверены, что хотите удалить оборудование "${currentEquipment.name}"?\n\nЭто действие удалит оборудование и папку в Google Drive. Это действие нельзя отменить.`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setDeleting(true);
    setDeleteError(null);

    try {
      await deleteEquipment(currentEquipment.id);
      // Очищаем кеш после удаления
      clearEquipmentCache(currentEquipment.id);
      // Перенаправляем на список после удаления
      setTimeout(() => {
        navigate(ROUTES.HOME);
      }, 1500);
    } catch (err: any) {
      console.error('Ошибка удаления:', err);
      setDeleteError(`Ошибка удаления: ${err.message || 'Не удалось удалить оборудование'}`);
    } finally {
      setDeleting(false);
    }
  };

  /**
   * Извлечение номера фильтра из названия
   */
  const getFilterNumber = (): number => {
    if (!currentEquipment) return 1;
    const match = currentEquipment.name.match(/№(\d+)/);
    return match ? parseInt(match[1]) : 1;
  };

  /**
   * Открытие модального окна настроек экспорта
   */
  const handleExportPDF = () => {
    setIsExportSettingsOpen(true);
  };

  /**
   * Экспорт таблички в PDF с настройками
   */
  const handleExportWithSettings = async (settings: PlateExportSettings) => {
    setIsExportSettingsOpen(false);
    
    // Небольшая задержка для закрытия модального окна
    setTimeout(async () => {
      try {
        const filename = `${currentEquipment?.name || 'Оборудование'}-табличка.pdf`;
        await exportToPDF('equipment-plate', filename, settings);
      } catch (error) {
        alert('Ошибка при экспорте в PDF. Попробуйте еще раз.');
        console.error(error);
      }
    }, 100);
  };

  return (
    <div className="equipment-page">
      <EquipmentPageHeader
        equipment={currentEquipment}
        loading={loading}
        isAdmin={isAdmin}
        onOpenMaintenanceLog={currentEquipment ? () => setMaintenanceLogOpen(true) : undefined}
        onOpenDocumentation={currentEquipment?.googleDriveUrl ? () => setDocumentationOpen(true) : undefined}
        onEditEquipment={currentEquipment ? () => navigate(getEquipmentEditUrl(currentEquipment.id)) : undefined}
        onDeleteEquipment={handleDelete}
        onExportPDF={handleExportPDF}
        documentationAvailable={!!currentEquipment?.googleDriveUrl}
        deleting={deleting}
      />

      <div className="plate-container">
        <StatusMessages
          saving={false}
          success={false}
          error={error}
          loading={loading}
        />
        
        {loading ? (
          <div className="loading-message">Загрузка данных оборудования...</div>
        ) : (
          <>
            <EquipmentPlate 
              specs={(currentEquipment?.specs as FilterSpecs) || filterSpecs} 
              equipmentName={currentEquipment?.name}
              filterNumber={getFilterNumber()}
              commissioningDate={commissioningDate}
              lastMaintenanceDate={lastMaintenanceDate}
              qrCodeUrl={currentEquipment?.qrCodeUrl}
            />
            
            {currentEquipment && isMaintenanceLogOpen && (
              <MaintenanceLogModal
                equipmentId={currentEquipment.id}
                equipmentName={currentEquipment.name}
                maintenanceSheetId={currentEquipment.maintenanceSheetId}
                onClose={() => setMaintenanceLogOpen(false)}
              />
            )}

            {currentEquipment?.googleDriveUrl && isDocumentationOpen && (
              <DocumentationModal
                folderUrl={currentEquipment.googleDriveUrl}
                equipmentName={currentEquipment.name}
                onClose={() => setDocumentationOpen(false)}
              />
            )}

            {currentEquipment && isExportSettingsOpen && (
              <PlateExportSettingsModal
                isOpen={isExportSettingsOpen}
                onClose={() => setIsExportSettingsOpen(false)}
                onExport={handleExportWithSettings}
                equipmentName={currentEquipment.name}
                specs={(currentEquipment.specs as FilterSpecs) || filterSpecs}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default EquipmentPage;

