/**
 * registry.ts
 *
 * Список бланков. Новый бланк добавляется сюда и своим FormDefinition.
 */

import type { FormDefinition } from './types.js';

export interface TriggerMatch {
  form: FormDefinition;
  remainder: string;
}

export interface FormRegistry {
  byId: (id: string) => FormDefinition | undefined;
  match: (text: string) => TriggerMatch | null;
}

export function createFormRegistry(forms: FormDefinition[]): FormRegistry {
  return {
    byId(id: string): FormDefinition | undefined {
      return forms.find((form) => form.id === id);
    },
    match(text: string): TriggerMatch | null {
      let best: { form: FormDefinition; remainder: string; specificity: number } | null = null;
      for (const form of forms) {
        const matched = form.matchTrigger(text);
        if (!matched) continue;
        if (!best || matched.specificity > best.specificity) {
          best = { form, remainder: matched.remainder, specificity: matched.specificity };
        }
      }
      return best ? { form: best.form, remainder: best.remainder } : null;
    },
  };
}
