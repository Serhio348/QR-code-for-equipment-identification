import { describe, expect, it } from 'vitest';
import { historyForApi } from './chatHistoryPayload';

const image = (data: string) => ({ type: 'image', source: { data } });

describe('historyForApi', () => {
  it('keeps only the newest photo bytes and leaves older photos as text', () => {
    const payload = historyForApi([
      {
        role: 'user',
        content: [{ type: 'text', text: 'первое' }, image('old-bytes')],
      },
      { role: 'assistant', content: 'ответ' },
      {
        role: 'user',
        content: [{ type: 'text', text: 'второе' }, image('new-bytes')],
      },
    ], 50);

    expect(payload[0].content).toBe('первое');
    expect(JSON.stringify(payload[0])).not.toContain('old-bytes');
    expect(payload[2].content).toEqual([
      { type: 'text', text: 'второе' },
      image('new-bytes'),
    ]);
  });

  it('drops photo bytes from history when the new message has none', () => {
    const payload = historyForApi([
      { role: 'user', content: [image('old-bytes')] },
      { role: 'user', content: 'только текст' },
    ], 50);

    expect(payload[0].content).toBe('');
    expect(payload[1].content).toBe('только текст');
  });
});
