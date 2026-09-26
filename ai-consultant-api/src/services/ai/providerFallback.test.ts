import { describe, expect, it, vi } from 'vitest';
import { GeminiProvider } from './providers/GeminiProvider.js';
import { isProviderFallbackError, runWithProviderFallback } from './providerFallback.js';
import { getToolContext, runWithToolContext } from './toolContext.js';

function statusError(status: number): Error {
    const error = new Error(`status ${status}`);
    return Object.assign(error, { status });
}

describe('isProviderFallbackError', () => {
    it('accepts an invalid key, rate limit, and server errors', () => {
        expect(isProviderFallbackError(statusError(401))).toBe(true);
        expect(isProviderFallbackError(statusError(403))).toBe(true);
        expect(isProviderFallbackError(statusError(429))).toBe(true);
        expect(isProviderFallbackError(statusError(500))).toBe(true);
        expect(isProviderFallbackError(statusError(503))).toBe(true);
        expect(isProviderFallbackError(statusError(400))).toBe(false);
        expect(isProviderFallbackError(new Error('broken'))).toBe(false);
    });
});

describe('runWithProviderFallback', () => {
    it('uses the next provider after 429 or 5xx before any output', async () => {
        const seen: string[] = [];
        const result = await runWithProviderFallback(
            [{ name: 'Claude' }, { name: 'DeepSeek' }],
            async (provider) => {
                seen.push(provider.name);
                if (provider.name === 'Claude') throw statusError(429);
                return 'ok';
            },
        );
        expect(result).toBe('ok');
        expect(seen).toEqual(['Claude', 'DeepSeek']);

        await expect(runWithProviderFallback(
            [{ name: 'Claude' }, { name: 'Gemini' }],
            async (provider) => {
                if (provider.name === 'Claude') throw statusError(502);
                return 'next';
            },
        )).resolves.toBe('next');
    });

    it('does not repeat a provider after a tool or the first token', async () => {
        const second = vi.fn(async () => 'should-not-run');
        await expect(runWithProviderFallback(
            [{ name: 'Claude' }, { name: 'Gemini' }],
            async (provider, markOutputStarted) => {
                if (provider.name === 'Gemini') return second();
                markOutputStarted();
                throw statusError(429);
            },
        )).rejects.toThrow(/429/);
        expect(second).not.toHaveBeenCalled();
    });

    it('does not hide a request that every provider would reject', async () => {
        await expect(runWithProviderFallback(
            [{ name: 'Claude' }, { name: 'Gemini' }],
            async () => {
                throw statusError(400);
            },
        )).rejects.toThrow(/400/);
    });
});

describe('GeminiProvider.isAvailable', () => {
    it('does not spend a generateContent call when the key is present', async () => {
        const provider = new GeminiProvider('test-key');
        const client = (provider as unknown as { client: { getGenerativeModel: () => void } }).client;
        const spy = vi.spyOn(client, 'getGenerativeModel');
        await expect(provider.isAvailable()).resolves.toBe(true);
        expect(spy).not.toHaveBeenCalled();
    });
});

describe('tool context fallback lock', () => {
    it('survives the provider wrapping the call in another context', async () => {
        let locked = false;
        await runWithToolContext(
            { userId: 'user-1', lockProviderFallback: () => { locked = true; } },
            () => runWithToolContext({ userId: 'user-1' }, async () => {
                getToolContext()?.lockProviderFallback?.();
            }),
        );
        expect(locked).toBe(true);
    });
});
