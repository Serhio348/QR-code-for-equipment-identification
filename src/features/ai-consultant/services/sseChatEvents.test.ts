import { describe, expect, it } from 'vitest';
import { readSseBuffer } from './sseChatEvents';

describe('readSseBuffer', () => {
  it('joins an event split across chunks', () => {
    const partial = readSseBuffer('data: {"type":"text_delta","delta":"пр"}', false);
    expect(partial.events).toEqual([]);
    const complete = readSseBuffer(`${partial.rest}\n\ndata: {"type":"done","toolsUsed":[]}\n\n`, true);
    expect(complete.events.map(event => event.type)).toEqual(['text_delta', 'done']);
    expect(complete.protocolError).toBeNull();
  });

  it('reports a damaged event and an unexpected end', () => {
    expect(readSseBuffer('data: {bad}\n\n', true).protocolError).toBe('Повреждённое событие потока');
    expect(readSseBuffer('data: {"type":"text_delta","delta":"a"}\n\n', true).protocolError).toBe('Ответ оборвался');
  });
});
