import express from 'express';
import { describe, expect, it } from 'vitest';
import { publicHttpError } from './httpError.js';
import './asyncRoute.js';

describe('publicHttpError', () => {
  it('maps bad JSON and oversized bodies and hides 500 details', () => {
    const badJson = new SyntaxError('Unexpected token');
    (badJson as SyntaxError & { status: number; type: string }).status = 400;
    (badJson as SyntaxError & { type: string }).type = 'entity.parse.failed';
    expect(publicHttpError(badJson)).toEqual({ status: 400, error: 'Некорректный JSON' });

    expect(publicHttpError({ status: 413, type: 'entity.too.large' })).toEqual({
      status: 413,
      error: 'Тело запроса слишком большое',
    });
    expect(publicHttpError({ code: 'LIMIT_FILE_SIZE' }).status).toBe(413);
    expect(publicHttpError(new Error('secret connection string'))).toEqual({
      status: 500,
      error: 'Internal server error',
    });
  });
});

describe('async route failures', () => {
  it('reaches the error handler instead of hanging', async () => {
    const app = express();
    app.get('/boom', async () => {
      throw new Error('database password');
    });
    app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const body = publicHttpError(err);
      res.status(body.status).json({ error: body.error });
    });

    const server = app.listen(0);
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('no port');
      const response = await fetch(`http://127.0.0.1:${address.port}/boom`);
      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({ error: 'Internal server error' });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
