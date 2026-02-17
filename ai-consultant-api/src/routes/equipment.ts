/**
 * equipment.ts
 *
 * Прокси-маршруты для операций с оборудованием через GAS.
 *
 * Фронтенд не может напрямую делать POST к Google Apps Script
 * из-за CORS (GAS не обрабатывает preflight OPTIONS).
 * Этот роутер проксирует запросы через Node.js бэкенд,
 * где CORS уже настроен.
 *
 * Эндпоинты:
 * - POST /api/equipment/maintenance/add      → GAS addMaintenanceEntry
 * - POST /api/equipment/maintenance/update   → GAS updateMaintenanceEntry
 * - POST /api/equipment/maintenance/delete   → GAS deleteMaintenanceEntry
 * - POST /api/equipment/upload-file          → GAS uploadMaintenanceDocument
 * - POST /api/equipment/attach-files         → GAS attachFilesToEntry
 */

import { Router, Request, Response } from 'express';
import { gasClient } from '../services/gasClient.js';

const router = Router();

// ============================================================================
// ЖУРНАЛ ОБСЛУЖИВАНИЯ: get / add / update / delete
// ============================================================================

/**
 * GET /api/equipment/maintenance/log
 *
 * Получить журнал обслуживания для оборудования.
 * Проксирует GET-запрос к GAS action=getMaintenanceLog.
 *
 * Query params:
 * - equipmentId: string (обязательный)
 * - maintenanceSheetId?: string (опциональный)
 */
router.get('/maintenance/log', async (req: Request, res: Response) => {
  try {
    const { equipmentId, maintenanceSheetId } = req.query;

    if (!equipmentId || typeof equipmentId !== 'string') {
      res.status(400).json({ success: false, error: 'Обязательный параметр: equipmentId' });
      return;
    }

    console.log(`[Equipment] maintenance/log: equipmentId=${equipmentId}`);

    const params: Record<string, string | undefined> = { equipmentId };
    if (maintenanceSheetId && typeof maintenanceSheetId === 'string') {
      params.maintenanceSheetId = maintenanceSheetId;
    }

    const result = await gasClient.get<unknown[]>('getMaintenanceLog', params);

    console.log(`[Equipment] maintenance/log success: ${result?.length || 0} entries`);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[Equipment] maintenance/log error:', error);
    const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/equipment/maintenance/add
 *
 * Добавить запись в журнал обслуживания.
 *
 * Body:
 * - equipmentId: string
 * - date: string (YYYY-MM-DD)
 * - type: string
 * - description: string
 * - performedBy: string
 * - status?: string
 * - maintenanceSheetId?: string
 */
router.post('/maintenance/add', async (req: Request, res: Response) => {
  try {
    const { equipmentId, date, type, description, performedBy, status, maintenanceSheetId } = req.body;

    if (!equipmentId || !date || !type || !description || !performedBy) {
      res.status(400).json({
        success: false,
        error: 'Обязательные поля: equipmentId, date, type, description, performedBy',
      });
      return;
    }

    console.log(`[Equipment] maintenance/add: equipmentId=${equipmentId}, type=${type}`);

    const data: Record<string, unknown> = { equipmentId, date, type, description, performedBy };
    if (status) data.status = status;
    if (maintenanceSheetId) data.maintenanceSheetId = maintenanceSheetId;

    const result = await gasClient.post<Record<string, unknown>>('addMaintenanceEntry', data);

    console.log(`[Equipment] maintenance/add success`);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[Equipment] maintenance/add error:', error);
    const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/equipment/maintenance/update
 *
 * Обновить запись в журнале обслуживания.
 *
 * Body:
 * - entryId: string
 * - (любые поля для обновления: date, type, description, performedBy, status)
 */
router.post('/maintenance/update', async (req: Request, res: Response) => {
  try {
    const { entryId, ...fields } = req.body;

    if (!entryId) {
      res.status(400).json({ success: false, error: 'Обязательное поле: entryId' });
      return;
    }

    console.log(`[Equipment] maintenance/update: entryId=${entryId}`);

    const result = await gasClient.post<Record<string, unknown>>('updateMaintenanceEntry', {
      entryId,
      ...fields,
    });

    console.log(`[Equipment] maintenance/update success`);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[Equipment] maintenance/update error:', error);
    const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/equipment/maintenance/delete
 *
 * Удалить запись из журнала обслуживания.
 *
 * Body:
 * - entryId: string
 */
router.post('/maintenance/delete', async (req: Request, res: Response) => {
  try {
    const { entryId } = req.body;

    if (!entryId) {
      res.status(400).json({ success: false, error: 'Обязательное поле: entryId' });
      return;
    }

    console.log(`[Equipment] maintenance/delete: entryId=${entryId}`);

    const result = await gasClient.post<Record<string, unknown>>('deleteMaintenanceEntry', { entryId });

    console.log(`[Equipment] maintenance/delete success`);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[Equipment] maintenance/delete error:', error);
    const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
    res.status(500).json({ success: false, error: message });
  }
});

// ============================================================================
// ФАЙЛЫ: upload / attach
// ============================================================================

/**
 * POST /api/equipment/upload-file
 *
 * Загружает файл обслуживания в Google Drive через GAS.
 * Принимает Base64-кодированный файл и метаданные.
 *
 * Body:
 * - equipmentId: string
 * - entryId: string
 * - fileBase64: string (Base64 без префикса data:...)
 * - mimeType: string
 * - originalFileName: string
 * - date: string (YYYY-MM-DD)
 */
router.post('/upload-file', async (req: Request, res: Response) => {
  try {
    const { equipmentId, entryId, fileBase64, mimeType, originalFileName, date } = req.body;

    if (!equipmentId || !entryId || !fileBase64) {
      res.status(400).json({
        success: false,
        error: 'Обязательные поля: equipmentId, entryId, fileBase64',
      });
      return;
    }

    console.log(`[Equipment] upload-file: equipmentId=${equipmentId}, entryId=${entryId}, fileName=${originalFileName}`);

    const result = await gasClient.post<{
      success: boolean;
      fileId: string;
      fileUrl: string;
      fileName: string;
      mimeType: string;
      size: number;
    }>('uploadMaintenanceDocument', {
      equipmentId,
      entryId,
      fileBase64,
      mimeType: mimeType || 'application/octet-stream',
      originalFileName: originalFileName || 'document',
      date: date || new Date().toISOString().split('T')[0],
    });

    console.log(`[Equipment] upload-file success: fileId=${result.fileId}`);

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[Equipment] upload-file error:', error);
    const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/equipment/attach-files
 *
 * Привязывает загруженные файлы к записи журнала обслуживания.
 *
 * Body:
 * - entryId: string
 * - files: string (JSON массив файлов) или MaintenanceFile[]
 */
router.post('/attach-files', async (req: Request, res: Response) => {
  try {
    const { entryId, files } = req.body;

    if (!entryId || !files) {
      res.status(400).json({
        success: false,
        error: 'Обязательные поля: entryId, files',
      });
      return;
    }

    console.log(`[Equipment] attach-files: entryId=${entryId}`);

    const result = await gasClient.post<Record<string, unknown>>('attachFilesToEntry', {
      entryId,
      files: typeof files === 'string' ? files : JSON.stringify(files),
    });

    console.log(`[Equipment] attach-files success`);

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[Equipment] attach-files error:', error);
    const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
