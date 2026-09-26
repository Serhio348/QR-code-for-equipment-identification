/**
 * sseChatEvents.ts
 *
 * Разбор SSE. Оборванный поток и повреждённое событие не выглядят как успешный ответ.
 */

export interface SseEvent {
  type: string;
}

export interface SseRead {
  events: SseEvent[];
  rest: string;
  protocolError: string | null;
}

export function readSseBuffer(buffer: string, final: boolean): SseRead {
  const pieces = buffer.split('\n\n');
  const rest = final ? '' : (pieces.pop() ?? '');
  const events: SseEvent[] = [];
  let sawTerminal = false;

  for (const piece of pieces) {
    const line = piece.trim();
    if (!line) continue;
    if (!line.startsWith('data: ')) continue;
    try {
      const event = JSON.parse(line.slice(6)) as SseEvent;
      if (!event || typeof event.type !== 'string') {
        return { events, rest: '', protocolError: 'Повреждённое событие потока' };
      }
      events.push(event);
      if (event.type === 'done' || event.type === 'error') sawTerminal = true;
    } catch {
      return { events, rest: '', protocolError: 'Повреждённое событие потока' };
    }
  }

  if (final && !sawTerminal) {
    return { events, rest, protocolError: 'Ответ оборвался' };
  }
  return { events, rest, protocolError: null };
}
