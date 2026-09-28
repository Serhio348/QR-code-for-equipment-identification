/**
 * trustProxy.test.ts
 *
 * Railway присылает X-Forwarded-For. Без доверенного прокси лимит считает всех
 * посетителей одним адресом — адресом самого Railway.
 */

import type { AddressInfo } from 'node:net';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { describe, expect, it } from 'vitest';

async function clientIp(trustProxy: number | false): Promise<string> {
    const app = express();
    app.set('trust proxy', trustProxy);
    app.use(rateLimit({
        windowMs: 60_000,
        max: 30,
        standardHeaders: true,
        legacyHeaders: false,
    }));
    app.post('/api/chat/stream', (req, res) => {
        res.status(200).json({ ip: req.ip });
    });

    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;
    try {
        const response = await fetch(`http://127.0.0.1:${port}/api/chat/stream`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Forwarded-For': '203.0.113.5',
            },
            body: JSON.stringify({ messages: [{ role: 'user', content: 'ping' }] }),
        });
        const body = await response.json() as { ip?: string };
        return body.ip ?? '';
    } finally {
        await new Promise<void>((resolve, reject) => {
            server.close(error => error ? reject(error) : resolve());
        });
    }
}

describe('rate limit behind Railway', () => {
    it('keeps the proxy address when trust proxy is off', async () => {
        await expect(clientIp(false)).resolves.not.toBe('203.0.113.5');
    });

    it('uses the visitor address when one proxy is trusted', async () => {
        await expect(clientIp(1)).resolves.toBe('203.0.113.5');
    });
});
