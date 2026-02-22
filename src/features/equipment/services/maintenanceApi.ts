/**
 * API для работы с журналом обслуживания оборудования
 * 
 * Функции для получения, добавления, обновления и удаления записей
 * в журнале обслуживания через Google Apps Script API
 */

import { MaintenanceEntry, MaintenanceEntryInput, MaintenanceFile } from '../types/equipment';
import { logUserActivity } from '../../user-activity/services/activityLogsApi';

/**
 * Получить журнал обслуживания для оборудования
 * 
 * Загружает все записи журнала обслуживания для указанного оборудования
 * из таблицы "Журнал обслуживания" в Google Sheets.
 * Если указан maintenanceSheetId, загружает общий журнал для нескольких единиц оборудования.
 * 
 * @param {string} equipmentId - ID оборудования
 * @param {string} [maintenanceSheetId] - Опциональный ID общего журнала обслуживания (для нескольких единиц оборудования)
 * @returns {Promise<MaintenanceEntry[]>} Массив записей журнала обслуживания
 * 
 * @throws {Error} Если не удалось загрузить журнал
 * 
 * @example
 * // Обычный журнал для одного оборудования
 * const log = await getMaintenanceLog('equipment-123');
 * 
 * // Общий журнал для нескольких единиц оборудования
 * const sharedLog = await getMaintenanceLog('equipment-123', 'shared-sheet-id');
 */
export async function getMaintenanceLog(
  equipmentId: string,
  maintenanceSheetId?: string
): Promise<MaintenanceEntry[]> {
  if (!equipmentId) {
    throw new Error('ID оборудования не указан');
  }

  if (!AI_API_URL) {
    throw new Error('VITE_AI_CONSULTANT_API_URL не настроен.');
  }

  console.log('📋 getMaintenanceLog через прокси:', { equipmentId, maintenanceSheetId });

  const url = new URL(`${AI_API_URL}/api/equipment/maintenance/log`);
  url.searchParams.append('equipmentId', equipmentId);
  if (maintenanceSheetId) {
    url.searchParams.append('maintenanceSheetId', maintenanceSheetId);
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Ошибка загрузки журнала:', response.status, errorText);
    throw new Error(`Ошибка загрузки журнала: ${response.status}`);
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error || 'Не удалось загрузить журнал');
  }

  const log = result.data || [];
  console.log(`✅ Загружен журнал: ${log.length} записей для equipmentId="${equipmentId}"`);
  return log;
}

/**
 * Добавить запись в журнал обслуживания
 * 
 * Создает новую запись в журнале обслуживания для указанного оборудования.
 * Если указан maintenanceSheetId, добавляет запись в общий журнал для нескольких единиц оборудования.
 * 
 * @param {string} equipmentId - ID оборудования
 * @param {MaintenanceEntryInput} entry - Данные новой записи
 * @param {string} [maintenanceSheetId] - Опциональный ID общего журнала обслуживания
 * @returns {Promise<MaintenanceEntry>} Созданная запись
 * 
 * @throws {Error} Если не удалось добавить запись
 * 
 * @example
 * const newEntry = await addMaintenanceEntry('equipment-123', {
 *   date: '2024-01-15',
 *   type: 'Промывка',
 *   description: 'Проведена промывка фильтра',
 *   performedBy: 'Иванов И.И.',
 *   status: 'completed'
 * });
 */
export async function addMaintenanceEntry(
  equipmentId: string,
  entry: MaintenanceEntryInput,
  maintenanceSheetId?: string
): Promise<MaintenanceEntry> {
  if (!equipmentId) {
    throw new Error('ID оборудования не указан');
  }

  if (!entry.date || !entry.type || !entry.description || !entry.performedBy) {
    throw new Error('Не все обязательные поля заполнены');
  }

  if (!AI_API_URL) {
    throw new Error('VITE_AI_CONSULTANT_API_URL не настроен.');
  }

  console.log('📤 Добавление записи через прокси:', { equipmentId, type: entry.type });

  const body: Record<string, unknown> = { equipmentId, ...entry };
  if (maintenanceSheetId) body.maintenanceSheetId = maintenanceSheetId;

  const response = await fetch(`${AI_API_URL}/api/equipment/maintenance/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Ошибка добавления записи:', response.status, errorText);
    throw new Error(`Ошибка добавления записи: ${response.status}`);
  }

  const result = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || 'Не удалось добавить запись');
  }

  const newEntry = result.data as MaintenanceEntry;
  console.log('✅ Запись добавлена:', newEntry.id);

  // Логируем добавление записи ТО
  logUserActivity(
    'maintenance_add',
    `Добавлена запись ТО: ${newEntry.type} (${newEntry.date})`,
    {
      entityType: 'maintenance_entry',
      entityId: newEntry.id,
      metadata: { equipmentId, type: newEntry.type, performedBy: newEntry.performedBy },
    }
  );

  return newEntry;
}

/**
 * Обновить запись в журнале обслуживания
 * 
 * Обновляет существующую запись в журнале обслуживания
 * 
 * @param {string} entryId - ID записи
 * @param {Partial<MaintenanceEntryInput>} entry - Новые данные записи (можно указать только изменяемые поля)
 * @returns {Promise<MaintenanceEntry>} Обновленная запись
 * 
 * @throws {Error} Если не удалось обновить запись
 * 
 * @example
 * const updated = await updateMaintenanceEntry('entry-123', {
 *   description: 'Обновленное описание',
 *   status: 'completed'
 * });
 */
export async function updateMaintenanceEntry(
  entryId: string,
  entry: Partial<MaintenanceEntryInput>
): Promise<MaintenanceEntry> {
  if (!entryId) {
    throw new Error('ID записи не указан');
  }

  if (!AI_API_URL) {
    throw new Error('VITE_AI_CONSULTANT_API_URL не настроен.');
  }

  console.log('📤 Обновление записи через прокси:', { entryId });

  const response = await fetch(`${AI_API_URL}/api/equipment/maintenance/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entryId, ...entry }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Ошибка обновления записи:', response.status, errorText);
    throw new Error(`Ошибка обновления записи: ${response.status}`);
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error || 'Не удалось обновить запись');
  }

  console.log('✅ Запись обновлена:', entryId);

  logUserActivity(
    'maintenance_update',
    `Обновлена запись ТО (ID: ${entryId.substring(0, 8)}...)`,
    {
      entityType: 'maintenance_entry',
      entityId: entryId,
      metadata: { updatedFields: Object.keys(entry) },
    }
  );

  return result.data;
}

/**
 * Удалить запись из журнала обслуживания
 * 
 * Удаляет запись из журнала обслуживания по ID
 * 
 * @param {string} entryId - ID записи
 * @returns {Promise<{ success: boolean; message: string }>} Результат удаления
 * 
 * @throws {Error} Если не удалось удалить запись
 * 
 * @example
 * await deleteMaintenanceEntry('entry-123');
 */
export async function deleteMaintenanceEntry(
  entryId: string
): Promise<{ success: boolean; message: string }> {
  if (!entryId) {
    throw new Error('ID записи не указан');
  }

  if (!AI_API_URL) {
    throw new Error('VITE_AI_CONSULTANT_API_URL не настроен.');
  }

  console.log('🗑️ Удаление записи через прокси:', { entryId });

  const response = await fetch(`${AI_API_URL}/api/equipment/maintenance/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entryId }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Ошибка удаления записи:', response.status, errorText);
    throw new Error(`Ошибка удаления записи: ${response.status}`);
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error || 'Не удалось удалить запись');
  }

  console.log('✅ Запись удалена:', entryId);

  logUserActivity(
    'maintenance_delete',
    `Удалена запись ТО (ID: ${entryId.substring(0, 8)}...)`,
    {
      entityType: 'maintenance_entry',
      entityId: entryId,
    }
  );

  return { success: true, message: 'Запись удалена' };
}

/**
 * Конвертировать File в Base64 строку (без data:...;base64, префикса)
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * URL бэкенда ai-consultant-api (прокси для загрузки файлов).
 *
 * Загрузка файлов идёт через бэкенд, а не напрямую на GAS,
 * потому что GAS не поддерживает CORS preflight (OPTIONS-запросы).
 * Бэкенд проксирует запрос к GAS на стороне сервера.
 */
const AI_API_URL = import.meta.env.VITE_AI_CONSULTANT_API_URL || '';

/**
 * Загрузить документ обслуживания в Google Drive
 *
 * Файл отправляется через прокси-бэкенд (ai-consultant-api),
 * который пересылает его в Google Apps Script без CORS-ограничений.
 *
 * @param equipmentId - ID оборудования
 * @param entryId - ID записи журнала
 * @param file - File объект для загрузки
 * @param date - Дата обслуживания (YYYY-MM-DD)
 * @returns Метаданные загруженного файла
 */
export async function uploadMaintenanceFile(
  equipmentId: string,
  entryId: string,
  file: File,
  date: string
): Promise<MaintenanceFile> {
  if (!AI_API_URL) {
    throw new Error('VITE_AI_CONSULTANT_API_URL не настроен. Загрузка файлов невозможна.');
  }

  const base64 = await fileToBase64(file);

  console.log('📤 Загрузка файла через прокси:', {
    equipmentId,
    entryId,
    fileName: file.name,
    mimeType: file.type,
    proxyUrl: `${AI_API_URL}/api/equipment/upload-file`,
  });

  const response = await fetch(`${AI_API_URL}/api/equipment/upload-file`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      equipmentId,
      entryId,
      fileBase64: base64,
      mimeType: file.type || 'application/octet-stream',
      originalFileName: file.name,
      date,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Ошибка загрузки файла:', response.status, errorText);
    throw new Error(`Ошибка загрузки файла: ${response.status}`);
  }

  const result = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || 'Не удалось загрузить файл');
  }

  console.log('✅ Файл загружен:', result.data.fileName);

  return {
    id: result.data.fileId,
    name: result.data.fileName,
    url: result.data.fileUrl,
    mimeType: result.data.mimeType,
    size: result.data.size,
  };
}

/**
 * Прикрепить файлы к записи журнала обслуживания
 *
 * Отправляется через прокси-бэкенд (ai-consultant-api),
 * чтобы обойти CORS-ограничения GAS.
 *
 * @param entryId - ID записи
 * @param files - Массив метаданных файлов
 * @returns Обновлённая запись
 */
export async function attachFilesToEntry(
  entryId: string,
  files: MaintenanceFile[]
): Promise<MaintenanceEntry> {
  if (!AI_API_URL) {
    throw new Error('VITE_AI_CONSULTANT_API_URL не настроен.');
  }

  console.log('📎 Прикрепление файлов через прокси:', { entryId, filesCount: files.length });

  const response = await fetch(`${AI_API_URL}/api/equipment/attach-files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entryId, files }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Ошибка прикрепления файлов:', response.status, errorText);
    throw new Error(`Ошибка прикрепления файлов: ${response.status}`);
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error || 'Не удалось прикрепить файлы к записи');
  }

  console.log('✅ Файлы прикреплены к записи:', entryId);

  return result.data;
}

