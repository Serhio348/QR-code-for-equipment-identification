import { describe, expect, it } from 'vitest';
import { throwIfAborted } from './abortSignal.js';

describe('throwIfAborted', () => {
    it('stops the next step after the client disconnects', () => {
        const signal = new AbortController();
        expect(() => throwIfAborted(signal.signal)).not.toThrow();
        signal.abort();
        expect(() => throwIfAborted(signal.signal)).toThrow(/уже выполнилась/);
    });
});
