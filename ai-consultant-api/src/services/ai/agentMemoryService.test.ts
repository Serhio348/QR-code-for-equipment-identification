/**
 * agentMemoryService.test.ts
 *
 * SEC-06: форматирование shared/personal для промпта.
 */

import { describe, expect, it } from 'vitest';
import { formatFactsForPrompt, type MemoryFact } from './agentMemoryService.js';

describe('formatFactsForPrompt (SEC-06)', () => {
  it('returns empty string for no facts', () => {
    expect(formatFactsForPrompt([])).toBe('');
  });

  it('separates shared and personal sections', () => {
    const facts: MemoryFact[] = [
      {
        category: 'tariff',
        key: 'tariff_water',
        value: 'Тариф воды 1.8',
        scope: 'shared',
      },
      {
        category: 'preference',
        key: 'style',
        value: 'Писать кратко',
        scope: 'personal',
        user_id: 'u1',
      },
    ];

    const prompt = formatFactsForPrompt(facts);
    expect(prompt).toContain('Общие справочные факты');
    expect(prompt).toContain('Тариф воды 1.8');
    expect(prompt).toContain('Личные предпочтения');
    expect(prompt).toContain('Писать кратко');
  });
});
