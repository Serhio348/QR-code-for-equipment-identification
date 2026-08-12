/**
 * toolContext.ts
 *
 * AsyncLocalStorage-контекст для вызовов tools внутри agentic loop.
 *
 * Структура / что умеет:
 * 1. runWithToolContext — привязывает userId/equipmentId к текущему запросу
 * 2. getToolContext — читает контекст из текущего async-стека
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export interface ToolContext {
  userId: string;
  equipmentId?: string;
}

const storage = new AsyncLocalStorage<ToolContext>();

export function runWithToolContext<T>(
  context: ToolContext,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(context, fn);
}

export function getToolContext(): ToolContext | undefined {
  return storage.getStore();
}
