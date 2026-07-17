/**
 * beliot.ts
 *
 * Административные маршруты реестра и сканирования Beliot.
 *
 * Структура / что умеет:
 * 1. GET /devices — список реестра
 * 2. POST /scan и GET /scan/status — обнаружение устройств
 * 3. PATCH/POST tracking — одиночное и массовое управление отслеживанием
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authMiddleware, type AuthenticatedRequest } from '../../middleware/auth.js';
import { adminMiddleware } from '../../middleware/admin.js';
import {
  getLastBeliotScan,
  isBeliotScanInProgress,
  listBeliotDevices,
  scanBeliotDevices,
  updateDeviceConfiguration,
  updateTrackingStatus,
} from '../../services/water/beliot/beliotRegistryService.js';
import type { BeliotTrackingStatus } from '../../services/water/beliot/beliotTypes.js';

// ============================================
// Настройка и валидация
// ============================================

const router = Router();
const TRACKING_STATUSES = new Set<BeliotTrackingStatus>([
  'discovered',
  'tracked',
  'ignored',
  'retired',
]);

router.use(authMiddleware, adminMiddleware);
router.use(rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
}));

function parseTrackingStatus(value: unknown): BeliotTrackingStatus | null {
  return typeof value === 'string' && TRACKING_STATUSES.has(value as BeliotTrackingStatus)
    ? value as BeliotTrackingStatus
    : null;
}

function isDeviceId(value: string): boolean {
  return /^\d+$/.test(value);
}

function fromClientTrackingStatus(value: unknown): BeliotTrackingStatus | null {
  if (value === 'pending') return 'discovered';
  return parseTrackingStatus(value);
}

function toClientScan(scan: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!scan) return null;
  return {
    id: scan.id ?? null,
    status: scan.status ?? 'idle',
    startedAt: scan.started_at ?? null,
    finishedAt: scan.finished_at ?? null,
    discoveredCount: scan.found_count ?? 0,
    updatedCount: scan.updated_count ?? 0,
    error: scan.error ?? null,
  };
}

// ============================================
// Маршруты
// ============================================

router.get('/devices', async (req: AuthenticatedRequest, res) => {
  try {
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(req.query.pageSize ?? '50'), 10) || 50));
    const requestedStatus = typeof req.query.status === 'string'
      ? fromClientTrackingStatus(req.query.status)
      : null;
    const data = await listBeliotDevices({
      page,
      pageSize,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      trackingStatus: requestedStatus
        ?? (typeof req.query.trackingStatus === 'string' ? req.query.trackingStatus : undefined),
      providerStatus: typeof req.query.providerStatus === 'string' ? req.query.providerStatus : undefined,
    });
    const lastScan = await getLastBeliotScan();
    res.json({
      devices: data.devices.map(device => ({
        id: device.device_id,
        provider: 'Beliot',
        providerDeviceId: device.device_id,
        providerStatus: device.provider_status,
        serialNumber: device.serial_number ?? device.provider_serial_number,
        name: device.override_name ?? device.provider_name,
        trackingStatus: device.tracking_status,
        user: {
          id: device.device_id,
          name: device.object_name ?? device.override_name,
          group: device.device_group ?? device.bootstrap_group_name,
          role: device.device_role,
        },
        lastReading: device.last_reading_at && device.last_reading_value !== null
          ? { value: device.last_reading_value, unit: 'м³', recordedAt: device.last_reading_at }
          : null,
      })),
      summary: {
        total: data.summary.total,
        discovered: data.summary.discovered,
        tracked: data.summary.tracked,
        ignored: data.summary.ignored,
        retired: data.summary.retired,
        missing: data.summary.missing,
      },
      lastScan: toClientScan(lastScan),
      pagination: {
        page: data.page,
        pageSize: data.pageSize,
        total: data.total,
        totalPages: Math.max(1, Math.ceil(data.total / data.pageSize)),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: message });
  }
});

router.post('/scan', async (req: AuthenticatedRequest, res) => {
  if (isBeliotScanInProgress()) {
    res.status(409).json({ success: false, error: 'Сканирование уже выполняется' });
    return;
  }
  try {
    const data = await scanBeliotDevices(req.user!.id, req.user!.email);
    res.json({
      scan: {
        id: data.scanId,
        status: 'completed',
        startedAt: data.scannedAt,
        finishedAt: data.scannedAt,
        discoveredCount: data.found,
        updatedCount: data.updated,
        error: null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === 'SCAN_ALREADY_RUNNING' ? 409 : 502;
    res.status(status).json({ error: message });
  }
});

router.get('/scan/status', async (_req: AuthenticatedRequest, res) => {
  try {
    const lastScan = await getLastBeliotScan();
    res.json({
      scan: isBeliotScanInProgress()
        ? {
          ...(toClientScan(lastScan) ?? {}),
          status: 'running',
        }
        : toClientScan(lastScan) ?? {
          id: null,
          status: 'idle',
          startedAt: null,
          finishedAt: null,
          discoveredCount: 0,
          updatedCount: 0,
          error: null,
        },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: message });
  }
});

router.patch('/devices/:deviceId/tracking', async (req: AuthenticatedRequest, res) => {
  const deviceId = req.params.deviceId;
  const status = fromClientTrackingStatus(req.body?.trackingStatus ?? req.body?.status);
  if (!isDeviceId(deviceId) || !status) {
    res.status(400).json({ success: false, error: 'Некорректный deviceId или status' });
    return;
  }
  try {
    const updated = await updateTrackingStatus([deviceId], status, req.user!.id, req.user!.email);
    res.json({ updatedCount: updated, devices: [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(400).json({ success: false, error: message });
  }
});

router.patch('/devices/:deviceId/config', async (req: AuthenticatedRequest, res) => {
  const deviceId = req.params.deviceId;
  const role = req.body?.role;
  if (
    !isDeviceId(deviceId)
    || ![undefined, null, 'source', 'production', 'domestic'].includes(role)
  ) {
    res.status(400).json({ error: 'Некорректный deviceId или role' });
    return;
  }
  try {
    await updateDeviceConfiguration(deviceId, {
      name: typeof req.body?.name === 'string' ? req.body.name : undefined,
      group: typeof req.body?.group === 'string' ? req.body.group : undefined,
      role,
    }, req.user!.email);
    res.json({ updated: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(400).json({ error: message });
  }
});

router.post('/devices/bulk-tracking', async (req: AuthenticatedRequest, res) => {
  const rawIds: unknown = req.body?.deviceIds;
  const status = fromClientTrackingStatus(req.body?.trackingStatus ?? req.body?.status);
  if (
    !Array.isArray(rawIds)
    || rawIds.length === 0
    || rawIds.length > 100
    || !rawIds.every(value => typeof value === 'string' && isDeviceId(value))
    || !status
  ) {
    res.status(400).json({ success: false, error: 'Нужны 1–100 корректных deviceIds и status' });
    return;
  }
  try {
    const updated = await updateTrackingStatus(rawIds, status, req.user!.id, req.user!.email);
    res.json({ updatedCount: updated, devices: [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(400).json({ success: false, error: message });
  }
});

export default router;
