/**
 * toolContext.ts
 *
 * AsyncLocalStorage-контекст для вызовов tools внутри agentic loop.
 *
 * Структура / что умеет:
 * 1. runWithToolContext — привязывает userId/equipmentId/appAccess к запросу
 * 2. getToolContext — читает контекст из текущего async-стека
 * 3. lockProviderFallback — вложенный вызов сохраняет запрет смены провайдера
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { UserAppAccess } from './userAppAccessService.js';

export interface ToolContext {
  userId: string;
  equipmentId?: string;
  /** SEC-05: права на разделы; нужны для фильтрации tools. */
  appAccess?: UserAppAccess;
  /** После старта инструмента запасной провайдер уже нельзя вызывать. */
  lockProviderFallback?: () => void;
}

const storage = new AsyncLocalStorage<ToolContext>();

/**
 * Запускает fn в контексте. Сохраняет appAccess родителя, если новый контекст его не задал.
 */
export function runWithToolContext<T>(
  context: ToolContext,
  fn: () => Promise<T>,
): Promise<T> {
  const parent = storage.getStore();
  const merged: ToolContext = {
    ...context,
    appAccess: context.appAccess ?? parent?.appAccess,
    lockProviderFallback: context.lockProviderFallback ?? parent?.lockProviderFallback,
  };
  return storage.run(merged, fn);
}

export function getToolContext(): ToolContext | undefined {
  return storage.getStore();
}
