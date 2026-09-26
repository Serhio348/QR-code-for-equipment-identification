/**
 * jsonBodyLimit.ts
 *
 * Лимит JSON: чат 16 МБ (одно фото 10 МБ после Base64), загрузка файла ТО 40 МБ, остальное 5 МБ.
 */

export const DEFAULT_JSON_LIMIT = '5mb';
export const CHAT_JSON_LIMIT = '16mb';
export const MAINTENANCE_UPLOAD_JSON_LIMIT = '40mb';

export function jsonBodyLimit(method: string, path: string): string {
  if (method !== 'POST') return DEFAULT_JSON_LIMIT;
  if (path === '/api/equipment/upload-file') return MAINTENANCE_UPLOAD_JSON_LIMIT;
  if (path === '/api/chat' || path === '/api/chat/stream') return CHAT_JSON_LIMIT;
  return DEFAULT_JSON_LIMIT;
}
