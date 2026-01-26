/**
 * API клиент для работы с базой данных оборудования
 * 
 * Предоставляет функции для взаимодействия с Google Apps Script API
 * Все функции возвращают промисы и обрабатывают ошибки
 * 
 * Этот файл является точкой входа и реэкспортирует все функции из модулей
 */

// Реэкспорт типов
export type { ApiResponse, DriveFolderResult, DriveFile } from '../../../services/api/types';

// Реэкспорт GET запросов
export {
  getAllEquipment,
  getEquipmentById,
  getEquipmentByType
} from './equipmentQueries';

// Реэкспорт POST запросов (мутации)
export {
  addEquipment,
  updateEquipment,
  deleteEquipment
} from './equipmentMutations';

// Реэкспорт Google Drive API
export {
  createDriveFolder,
  getFolderFiles
} from './driveApi';

// Реэкспорт API журнала обслуживания
export {
  getMaintenanceLog,
  addMaintenanceEntry,
  updateMaintenanceEntry,
  deleteMaintenanceEntry
} from './maintenanceApi';
