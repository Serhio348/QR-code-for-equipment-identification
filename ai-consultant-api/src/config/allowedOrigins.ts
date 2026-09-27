/**
 * allowedOrigins.ts
 *
 * Разбирает ALLOWED_ORIGINS: без звёздочки, без пустых кусков, без хвостового слэша.
 * Локальный фронт по умолчанию слушает 3000, не 5173.
 */

const DEFAULT_DEV_ORIGINS = 'http://localhost:3000,http://127.0.0.1:3000';

export function parseAllowedOrigins(raw: string | undefined): string[] {
  const source = raw && raw.trim() ? raw : DEFAULT_DEV_ORIGINS;
  const origins = source
    .split(',')
    .map((item) => item.trim().replace(/\/$/, ''))
    .filter((item) => item.length > 0);

  if (origins.some((origin) => origin.includes('*'))) {
    throw new Error('ALLOWED_ORIGINS не принимает шаблон *');
  }

  return [...new Set(origins)];
}
