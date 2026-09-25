/**
 * equipment.auth.test.ts
 *
 * SEC-01 / SEC-02: auth на журнале; admin на мутациях оборудования до GAS.
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
      if (token === 'admin-token') {
        req.user = { id: 'admin-1', email: 'admin@example.com' };
        next();
        return;
      }
      if (token === 'valid-token') {
        req.user = { id: 'user-1', email: 'user@example.com' };
        next();
        return;
      }
      res.status(401).json({ error: 'Недействительный токен авторизации' });
    }),
  };
});

vi.mock('../../middleware/admin.js', () => ({
  adminMiddleware: vi.fn((req, res, next) => {
    if (req.user?.email === 'admin@example.com') {
      next();
      return;
    }
    res.status(403).json({ error: 'Недостаточно прав' });
  }),
  createAdminMiddleware: vi.fn(),
}));

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

describe('equipment routes auth (SEC-01 / SEC-02)', () => {
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
    ['POST', '/api/equipment/add'],
    ['POST', '/api/equipment/update'],
    ['POST', '/api/equipment/delete'],
    ['POST', '/api/equipment/create-folder'],
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

  it('allows authenticated user to read maintenance log', async () => {
    gasGet.mockResolvedValue([{ id: 'e1', type: 'ТО' }]);

    const response = await fetch(
      `${baseUrl}/api/equipment/maintenance/log?equipmentId=eq-1`,
      { headers: { Authorization: 'Bearer valid-token' } },
    );

    expect(response.status).toBe(200);
    expect(gasGet).toHaveBeenCalled();
  });

  it('forbids non-admin from adding equipment', async () => {
    const response = await fetch(`${baseUrl}/api/equipment/add`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Насос', type: 'pump' }),
    });

    expect(response.status).toBe(403);
    expect(gasPost).not.toHaveBeenCalled();
  });

  it('allows admin to add equipment via GAS proxy', async () => {
    gasPost.mockResolvedValue({ id: 'eq-new', name: 'Насос', type: 'pump' });

    const response = await fetch(`${baseUrl}/api/equipment/add`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer admin-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Насос', type: 'pump', status: 'active' }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(gasPost).toHaveBeenCalledWith(
      'add',
      expect.objectContaining({ name: 'Насос', type: 'pump' }),
    );
  });

  it('allows admin to update and delete equipment', async () => {
    gasPost.mockResolvedValueOnce({ id: 'eq-1', name: 'Updated' });
    gasPost.mockResolvedValueOnce({ success: true });

    const updateRes = await fetch(`${baseUrl}/api/equipment/update`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer admin-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: 'eq-1', name: 'Updated' }),
    });
    expect(updateRes.status).toBe(200);
    expect(gasPost).toHaveBeenCalledWith('update', expect.objectContaining({ id: 'eq-1' }));

    const deleteRes = await fetch(`${baseUrl}/api/equipment/delete`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer admin-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: 'eq-1' }),
    });
    expect(deleteRes.status).toBe(200);
    expect(gasPost).toHaveBeenCalledWith('delete', { id: 'eq-1' });
  });
});
