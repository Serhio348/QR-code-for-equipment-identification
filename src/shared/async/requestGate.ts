/**
 * requestGate.ts
 *
 * Поколение запроса. В состояние попадает только ответ последнего вызова.
 *
 * Структура / что умеет:
 * 1. createRequestGate — begin выдаёт номер, isCurrent сверяет его с последним
 * 2. useRequestGate — один счётчик на время жизни компонента
 *
 * Пример:
 * запрос A начался, затем B; A завершился позже → isCurrent(A) === false
 */

import { useRef } from 'react';

export interface RequestGate {
  begin(): number;
  isCurrent(token: number): boolean;
}

export function createRequestGate(): RequestGate {
  let current = 0;
  return {
    begin(): number {
      current += 1;
      return current;
    },
    isCurrent(token: number): boolean {
      return token === current;
    },
  };
}

export function useRequestGate(): RequestGate {
  const ref = useRef<RequestGate | null>(null);
  if (ref.current === null) {
    ref.current = createRequestGate();
  }
  return ref.current;
}
