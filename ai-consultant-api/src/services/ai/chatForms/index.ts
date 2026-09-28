/**
 * index.ts
 *
 * Единая точка входа бланков для chat и chat/stream.
 * cancelChatForm снимает черновик, когда пользователь закрыл чат.
 */

import { createDraftStore } from './draftStore.js';
import { handleFormTurn } from './engine.js';
import { maintenanceForm } from './maintenance/form.js';
import { createFormRegistry } from './registry.js';
import { productionFormServices } from './services.js';
import type { FormEngineResult, FormHandleInput } from './types.js';
import { waterQualityForm } from './waterQuality/form.js';

const store = createDraftStore();
const registry = createFormRegistry([maintenanceForm, waterQualityForm]);

export async function handleChatForm(input: FormHandleInput): Promise<FormEngineResult> {
  return handleFormTurn(input, { store, registry, services: productionFormServices });
}

/** Закрытие чата снимает бланк. Следующая реплика снова идёт в обычный разговор. */
export function cancelChatForm(userId: string): void {
  if (!userId) return;
  store.delete(userId);
}

/** Текст пользовательской реплики. Файлы и картинки в бланк не попадают. */
export function textFromChatContent(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content
    .map((block) => {
      if (!block || typeof block !== 'object') return '';
      const record = block as { type?: unknown; text?: unknown };
      return record.type === 'text' && typeof record.text === 'string' ? record.text : '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();
}
