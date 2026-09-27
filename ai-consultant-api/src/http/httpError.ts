/**
 * httpError.ts
 *
 * Клиенту уходит статус и короткое сообщение. Текст 500 наружу не отдаётся.
 */

interface ErrorWithStatus {
  status?: number;
  statusCode?: number;
  type?: string;
  code?: string;
}

export function publicHttpError(err: unknown): { status: number; error: string } {
  const typed = (err ?? {}) as ErrorWithStatus;
  const status = typed.status ?? typed.statusCode ?? 500;

  if (status === 413 || typed.type === 'entity.too.large' || typed.code === 'LIMIT_FILE_SIZE') {
    return { status: 413, error: 'Тело запроса слишком большое' };
  }

  if (typed.type === 'entity.parse.failed' || (err instanceof SyntaxError && status === 400)) {
    return { status: 400, error: 'Некорректный JSON' };
  }

  if (status >= 400 && status < 500) {
    const message = err instanceof Error && err.message ? err.message : 'Некорректный запрос';
    return { status, error: message };
  }

  return { status: 500, error: 'Internal server error' };
}
