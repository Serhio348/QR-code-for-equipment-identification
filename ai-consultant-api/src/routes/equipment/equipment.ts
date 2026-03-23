/**
 * equipment.ts
 *
 * Прокси-маршруты для операций с оборудованием через GAS.
 */
import { Router, Request, Response } from 'express';
import { gasClient } from '../../services/equipment/index.js';

const router = Router();

router.get('/maintenance/log', async (req: Request, res: Response) => {
  try {
    const { equipmentId, maintenanceSheetId } = req.query;
    if (!equipmentId || typeof equipmentId !== 'string') {
      res.status(400).json({ success: false, error: 'Обязательный параметр: equipmentId' });
      return;
    }
    const params: Record<string, string | undefined> = { equipmentId };
    if (maintenanceSheetId && typeof maintenanceSheetId === 'string') {
      params.maintenanceSheetId = maintenanceSheetId;
    }
    const result = await gasClient.get<unknown[]>('getMaintenanceLog', params);
    res.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
    res.status(500).json({ success: false, error: message });
  }
});

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
    const data: Record<string, unknown> = { equipmentId, date, type, description, performedBy };
    if (status) data.status = status;
    if (maintenanceSheetId) data.maintenanceSheetId = maintenanceSheetId;
    const result = await gasClient.post<Record<string, unknown>>('addMaintenanceEntry', data);
    res.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
    res.status(500).json({ success: false, error: message });
  }
});

router.post('/maintenance/update', async (req: Request, res: Response) => {
  try {
    const { entryId, ...fields } = req.body;
    if (!entryId) {
      res.status(400).json({ success: false, error: 'Обязательное поле: entryId' });
      return;
    }
    const result = await gasClient.post<Record<string, unknown>>('updateMaintenanceEntry', {
      entryId,
      ...fields,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
    res.status(500).json({ success: false, error: message });
  }
});

router.post('/maintenance/delete', async (req: Request, res: Response) => {
  try {
    const { entryId } = req.body;
    if (!entryId) {
      res.status(400).json({ success: false, error: 'Обязательное поле: entryId' });
      return;
    }
    const result = await gasClient.post<Record<string, unknown>>('deleteMaintenanceEntry', { entryId });
    res.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
    res.status(500).json({ success: false, error: message });
  }
});

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
    res.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
    res.status(500).json({ success: false, error: message });
  }
});

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
    const result = await gasClient.post<Record<string, unknown>>('attachFilesToEntry', {
      entryId,
      files: typeof files === 'string' ? files : JSON.stringify(files),
    });
    res.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
