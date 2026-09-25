/**
 * equipment.auth.test.ts
 *
 * SEC-01: маршруты журнала ТО и файлов требуют auth до вызова GAS.
 */

import express, { type Express } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

vi.mock('../../services/equipment/index.js', () => ({
  gasClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('../../middleware/auth.js', async () => {
  const actual = await vi.importActual<typeof import('../../middleware/auth.js')>(
    '../../middleware/auth.js',
  );
  return {
    ...actual,
    authMiddleware: vi.fn(async (req, res, next) => {
      const header = req.headers.authorization;
      if (!header || !String(header).startsWith('Bearer ')) {
        res.status(401).json({ error: 'Отсутствует токен авторизации' });
        return;
      }
      const token = String(header).substring(7);
      if (token !== 'valid-token') {
        res.status(401).json({ error: 'Недействительный токен авторизации' });
        return;
      }
      req.user = { id: 'user-1', email: 'user@example.com' };
      next();
    }),
  };
});

import { gasClient } from '../../services/equipment/index.js';
import equipmentRouter from './equipment.js';

const gasGet = vi.mocked(gasClient.get);
const gasPost = vi.mocked(gasClient.post);

async function listen(app: Express): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

describe('equipment routes auth (SEC-01)', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    gasGet.mockReset();
    gasPost.mockReset();
    gasGet.mockResolvedValue([]);
    gasPost.mockResolvedValue({ id: 'entry-1' });

    const app = express();
    app.use(express.json({ limit: '1mb' }));
    app.use('/api/equipment', equipmentRouter);
    ({ server, baseUrl } = await listen(app));
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it.each([
    ['GET', '/api/equipment/maintenance/log?equipmentId=eq-1'],
    ['POST', '/api/equipment/maintenance/add'],
    ['POST', '/api/equipment/maintenance/update'],
    ['POST', '/api/equipment/maintenance/delete'],
    ['POST', '/api/equipment/upload-file'],
    ['POST', '/api/equipment/attach-files'],
  ] as const)('rejects anonymous %s %s before GAS', async (method, path) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
      body: method === 'POST' ? JSON.stringify({}) : undefined,
    });

    expect(response.status).toBe(401);
    expect(gasGet).not.toHaveBeenCalled();
    expect(gasPost).not.toHaveBeenCalled();
  });

  it('rejects invalid token before GAS', async () => {
    const response = await fetch(
      `${baseUrl}/api/equipment/maintenance/log?equipmentId=eq-1`,
      { headers: { Authorization: 'Bearer bad-token' } },
    );

    expect(response.status).toBe(401);
    expect(gasGet).not.toHaveBeenCalled();
  });

  it('allows authenticated user to read maintenance log', async () => {
    gasGet.mockResolvedValue([{ id: 'e1', type: 'ТО' }]);

    const response = await fetch(
      `${baseUrl}/api/equipment/maintenance/log?equipmentId=eq-1`,
      { headers: { Authorization: 'Bearer valid-token' } },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ success: true, data: [{ id: 'e1', type: 'ТО' }] });
    expect(gasGet).toHaveBeenCalledWith(
      'getMaintenanceLog',
      expect.objectContaining({ equipmentId: 'eq-1' }),
    );
  });

  it('allows authenticated user to add maintenance entry', async () => {
    gasPost.mockResolvedValue({
      id: 'entry-1',
      date: '2026-09-25',
      type: 'Промывка',
      description: 'ok',
      performedBy: 'Иванов',
    });

    const response = await fetch(`${baseUrl}/api/equipment/maintenance/add`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        equipmentId: 'eq-1',
        date: '2026-09-25',
        type: 'Промывка',
        description: 'ok',
        performedBy: 'Иванов',
      }),
    });

    expect(response.status).toBe(200);
    expect(gasPost).toHaveBeenCalledWith(
      'addMaintenanceEntry',
      expect.objectContaining({ equipmentId: 'eq-1' }),
    );
  });
});
