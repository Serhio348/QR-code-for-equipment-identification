/**
 * Страница просмотра конкретного оборудования
 * Отображает табличку оборудования с возможностью редактирования дат
 */

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import EquipmentPlate from '../components/EquipmentPlate';
import MaintenanceLogModal from '../components/MaintenanceLogModal';
import DocumentationModal from '../components/DocumentationModal';
import EquipmentPageHeader from '../components/EquipmentPage/EquipmentPageHeader';
import EquipmentSidebar from '../components/EquipmentPage/EquipmentSidebar';
import StatusMessages from '../components/EquipmentPage/StatusMessages';
import { filterSpecs, FilterSpecs } from '../types/equipment';
import { deleteEquipment } from '../services/equipmentApi';
import { useEquipmentData, clearEquipmentCache } from '../hooks/useEquipmentData';
import { useEquipmentDates } from '../hooks/useEquipmentDates';
import { exportToPDF } from '../utils/pdfExport';
import { ROUTES } from '../utils/routes';
import './EquipmentPage.css';

const EquipmentPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  // Используем хук для загрузки данных (с кешированием)
  const { data: equipmentData, loading, error: loadError } = useEquipmentData(id && id !== 'new' ? id : undefined);
  
  // Преобразуем данные в один объект (если это одно оборудование)
  const currentEquipment = equipmentData && !Array.isArray(equipmentData) ? equipmentData : null;
  
  // Используем хук для управления датами
  const {
    commissioningDate,
    lastMaintenanceDate,
    setCommissioningDate,
    setLastMaintenanceDate,
    saveDates,
    saving: datesSaving,
    success: datesSuccess,
    error: datesError
  } = useEquipmentDates({ equipment: currentEquipment });
  
  // Локальные состояния для операций удаления
  const [deleting, setDeleting] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isMaintenanceLogOpen, setMaintenanceLogOpen] = useState(false);
  const [isDocumentationOpen, setDocumentationOpen] = useState(false);
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  
  // Объединяем ошибки загрузки, сохранения дат и удаления
  const error = loadError || datesError || deleteError;
  const saving = datesSaving;
  const saveSuccess = datesSuccess;

  useEffect(() => {
    if (!currentEquipment && isMaintenanceLogOpen) {
      setMaintenanceLogOpen(false);
    }
    if (!currentEquipment && isDocumentationOpen) {
      setDocumentationOpen(false);
    }
  }, [currentEquipment, isMaintenanceLogOpen, isDocumentationOpen]);

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
   * Экспорт таблички в PDF
   */
  const handleExportPDF = async () => {
    try {
      await exportToPDF('equipment-plate', `${currentEquipment?.name || 'Оборудование'}-табличка.pdf`);
    } catch (error) {
      alert('Ошибка при экспорте в PDF. Попробуйте еще раз.');
      console.error(error);
    }
  };

  return (
    <div className="equipment-page">
      <EquipmentPageHeader
        equipment={currentEquipment}
        loading={loading}
        onToggleSidebar={() => setSidebarOpen(!isSidebarOpen)}
      />

      <EquipmentSidebar
        equipment={currentEquipment}
        onDelete={handleDelete}
        deleting={deleting}
        onOpenMaintenanceLog={
          currentEquipment ? () => {
            setMaintenanceLogOpen(true);
            setSidebarOpen(false); // Закрываем панель на мобильных после открытия модального окна
          } : undefined
        }
        onOpenDocumentation={
          currentEquipment?.googleDriveUrl ? () => {
            setDocumentationOpen(true);
            setSidebarOpen(false); // Закрываем панель на мобильных после открытия модального окна
          } : undefined
        }
        documentationAvailable={!!currentEquipment?.googleDriveUrl}
        loading={loading}
        commissioningDate={commissioningDate}
        lastMaintenanceDate={lastMaintenanceDate}
        onCommissioningDateChange={setCommissioningDate}
        onLastMaintenanceDateChange={setLastMaintenanceDate}
        onSaveDates={saveDates}
        savingDates={saving}
        onExportPDF={handleExportPDF}
        isOpen={isSidebarOpen}
        onToggle={() => setSidebarOpen(!isSidebarOpen)}
      />

      <div className="plate-container">
        <StatusMessages
          saving={saving}
          success={saveSuccess}
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
          </>
        )}
      </div>
    </div>
  );
};

export default EquipmentPage;

