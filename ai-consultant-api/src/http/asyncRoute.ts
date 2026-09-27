/**
 * asyncRoute.ts
 *
 * Express 4 не передаёт отклонённый promise в error handler.
 * Патч слоя ставится до импорта маршрутов.
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Layer = require('express/lib/router/layer.js') as {
  prototype: {
    handle_request: (req: unknown, res: unknown, next: (err?: unknown) => void) => void;
  };
};

const handleRequest = Layer.prototype.handle_request;

Layer.prototype.handle_request = function patched(req, res, next) {
  const fn = (this as { handle?: (...args: unknown[]) => unknown }).handle;
  if (!fn || fn.length > 3) {
    handleRequest.call(this, req, res, next);
    return;
  }

  try {
    const result = fn(req, res, next);
    if (result instanceof Promise) {
      result.catch(next);
      return;
    }
  } catch (error) {
    next(error);
    return;
  }
};
