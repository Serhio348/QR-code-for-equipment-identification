/**
 * accessSessionCache.ts
 *
 * Права разделов на время открытой вкладки браузера.
 * Повторный переход не ждёт сеть: данные по-прежнему закрыты RLS.
 *
 * 1. readAccessSession — undefined, пока права ещё не загружали
 * 2. writeAccessSession — запоминает ответ getUserAccess
 * 3. clearAccessSession — сброс при выходе и смене пользователя
 */

import type { UserAppAccess } from '../types/access';

let cachedEmail: string | null = null;
let cachedAccess: UserAppAccess | null | undefined;

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/** undefined — в этой сессии права ещё не читали. null — профиля нет. */
export function readAccessSession(email: string): UserAppAccess | null | undefined {
  if (cachedEmail !== normalizeEmail(email)) return undefined;
  return cachedAccess;
}

export function writeAccessSession(email: string, access: UserAppAccess | null): void {
  cachedEmail = normalizeEmail(email);
  cachedAccess = access;
}

export function clearAccessSession(): void {
  cachedEmail = null;
  cachedAccess = undefined;
}
