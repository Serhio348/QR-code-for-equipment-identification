/**
 * API для работы с журналом обслуживания оборудования
 * 
 * Функции для получения, добавления, обновления и удаления записей
 * в журнале обслуживания через Google Apps Script API
 */

import { MaintenanceEntry, MaintenanceEntryInput, MaintenanceFile } from '../types/equipment';
import { logUserActivity } from '../../user-activity/services/activityLogsApi';
import { API_CONFIG } from '@/shared/config/api';
import { ApiResponse } from '@/shared/services/api/types';
import { MAX_MAINTENANCE_FILE_SIZE_BYTES } from '../constants/maintenanceFiles';

const maintenanceLogInFlight = new Map<string, Promise<MaintenanceEntry[]>>();
const maintenanceLogCache = new Map<string, { data: MaintenanceEntry[]; timestamp: number }>();
const MAINTENANCE_LOG_CACHE_TTL_MS = 60 * 1000;
const MAINTENANCE_LOG_TIMEOUT_MS = API_CONFIG.TIMEOUT;

/**
 * Для операций журнала обслуживания используем backend-proxy, чтобы избежать CORS на Google Apps Script.
 * Если VITE_AI_CONSULTANT_API_URL не задан, используем относительные пути (same-origin).
 */
const BACKEND_API_URL = import.meta.env.VITE_AI_CONSULTANT_API_URL || '';

function backendUrl(path: string): string {
  if (BACKEND_API_URL) return `${BACKEND_API_URL}${path}`;
  return path;
}

async function postToBackend<TResponse>(path: string, body: unknown): Promise<TResponse> {
  const response = await fetch(backendUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(MAINTENANCE_LOG_TIMEOUT_MS),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
  }

  const json = (await response.json().catch(() => null)) as { success?: boolean; data?: TResponse; error?: string } | null;
  if (!json) throw new Error('Не удалось прочитать ответ сервера');
  if (json.success === false) throw new Error(json.error || 'Ошибка сервера');
  if (json.data == null) throw new Error('Сервер не вернул data');
  return json.data;
}

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
  void maintenanceSheetId;

  if (!equipmentId) {
    throw new Error('ID оборудования не указан');
  }

  // Чтение журнала делаем только по equipmentId.
  // Это стабильнее и быстрее, пока на стороне GAS может оставаться медленная логика с maintenanceSheetId.
  const requestKey = equipmentId;
  const cached = maintenanceLogCache.get(requestKey);
  if (cached && Date.now() - cached.timestamp < MAINTENANCE_LOG_CACHE_TTL_MS) {
    return cached.data;
  }

  const existingRequest = maintenanceLogInFlight.get(requestKey);
  if (existingRequest) {
    return existingRequest;
  }

  const requestPromise = (async (): Promise<MaintenanceEntry[]> => {
    console.log('📋 getMaintenanceLog через backend proxy:', { equipmentId });

    try {
      const url = new URL(backendUrl('/api/equipment/maintenance/log'), window.location.origin);
      url.searchParams.set('equipmentId', equipmentId);

      const fetchLog = async (): Promise<MaintenanceEntry[]> => {
        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(MAINTENANCE_LOG_TIMEOUT_MS),
          cache: 'no-store',
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
        }

        const payload = (await response.json()) as ApiResponse<MaintenanceEntry[]>;
        if (!payload.success) {
          throw new Error(payload.error || 'Не удалось загрузить журнал');
        }

        return payload.data || [];
      };

      let log: MaintenanceEntry[];
      try {
        log = await fetchLog();
      } catch (firstError) {
        const message = firstError instanceof Error ? firstError.message : String(firstError);
        const isGatewayTimeout = message.includes('504') || message.includes('Gateway Timeout');
        if (!isGatewayTimeout) {
          throw firstError;
        }
        console.warn('⚠️ Журнал: повтор запроса после 504...', { equipmentId });
        await new Promise((resolve) => setTimeout(resolve, 1500));
        log = await fetchLog();
      }
      maintenanceLogCache.set(requestKey, { data: log, timestamp: Date.now() });
      console.log(`✅ Загружен журнал: ${log.length} записей для equipmentId="${equipmentId}"`);
      return log;
    } catch (error) {
      // Если есть старый кэш, возвращаем его вместо ошибки.
      const stale = maintenanceLogCache.get(requestKey);
      if (stale?.data) {
        console.warn('⚠️ Не удалось обновить журнал, возвращаем данные из кэша:', { equipmentId });
        return stale.data;
      }

      throw error;
    }
  })();

  maintenanceLogInFlight.set(requestKey, requestPromise);
  try {
    return await requestPromise;
  } finally {
    maintenanceLogInFlight.delete(requestKey);
  }
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

  console.log('📤 Добавление записи через backend proxy:', { equipmentId, type: entry.type });

  const body: Record<string, unknown> = { equipmentId, ...entry };
  if (maintenanceSheetId) body.maintenanceSheetId = maintenanceSheetId;

  const newEntry = await postToBackend<MaintenanceEntry>('/api/equipment/maintenance/add', body);
  if (!newEntry) throw new Error('Не удалось добавить запись');
  maintenanceLogCache.clear();
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

  console.log('📤 Обновление записи через backend proxy:', { entryId });
  const updated = await postToBackend<MaintenanceEntry>('/api/equipment/maintenance/update', { entryId, ...entry });

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

  maintenanceLogCache.clear();

  return updated;
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

  console.log('🗑️ Удаление записи через backend proxy:', { entryId });
  await postToBackend<Record<string, unknown>>('/api/equipment/maintenance/delete', { entryId });
  maintenanceLogCache.clear();

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
 * Загрузить документ обслуживания в Google Drive
 *
 * Файл отправляется напрямую в Google Apps Script API.
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
  if (file.size > MAX_MAINTENANCE_FILE_SIZE_BYTES) {
    throw new Error(
      `Размер файла «${file.name}» превышает ${MAX_MAINTENANCE_FILE_SIZE_BYTES / 1024 / 1024} МБ`
    );
  }

  const base64 = await fileToBase64(file);

  console.log('📤 Загрузка файла через backend proxy:', {
    equipmentId,
    entryId,
    fileName: file.name,
    mimeType: file.type,
  });

  const result = await postToBackend<{
    fileId: string;
    fileUrl: string;
    fileName: string;
    mimeType?: string;
    size?: number;
  }>('/api/equipment/upload-file', {
    equipmentId,
    entryId,
    fileBase64: base64,
    mimeType: file.type || 'application/octet-stream',
    originalFileName: file.name,
    date,
  });

  maintenanceLogCache.clear();

  console.log('✅ Файл загружен:', result.fileName);

  return {
    id: result.fileId,
    name: result.fileName,
    url: result.fileUrl,
    mimeType: result.mimeType,
    size: result.size,
  };
}

/**
 * Прикрепить файлы к записи журнала обслуживания
 *
 * Отправляется напрямую в Google Apps Script API.
 *
 * @param entryId - ID записи
 * @param files - Массив метаданных файлов
 * @returns Обновлённая запись
 */
export async function attachFilesToEntry(
  entryId: string,
  files: MaintenanceFile[]
): Promise<MaintenanceEntry> {
  console.log('📎 Прикрепление файлов через backend proxy:', { entryId, filesCount: files.length });
  const updated = await postToBackend<MaintenanceEntry>('/api/equipment/attach-files', { entryId, files });
  maintenanceLogCache.clear();

  console.log('✅ Файлы прикреплены к записи:', entryId);

  return updated;
}

