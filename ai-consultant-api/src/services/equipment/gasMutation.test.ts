import { describe, expect, it } from 'vitest';
import { gasAttemptsForMethod, runIdempotentWrite } from './gasMutation.js';

describe('GAS mutation idempotency', () => {
    it('does not retry a POST and does not create a second record when the response is lost', () => {
        expect(gasAttemptsForMethod('POST', 3)).toBe(0);
        expect(gasAttemptsForMethod('GET', 3)).toBe(3);

        const store = new Map<string, { id: string }>();
        let writes = 0;
        const write = () => {
            writes += 1;
            return { id: 'equipment-1' };
        };

        const first = runIdempotentWrite(
            { get: (id) => store.get(id), set: (id, value) => { store.set(id, value); } },
            'op-1',
            write,
        );
        expect(first.repeated).toBe(false);

        const recovered = runIdempotentWrite(
            { get: (id) => store.get(id), set: (id, value) => { store.set(id, value); } },
            'op-1',
            write,
        );
        expect(recovered).toEqual({ repeated: true, value: { id: 'equipment-1' } });
        expect(writes).toBe(1);
    });
});
