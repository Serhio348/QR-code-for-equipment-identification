/**
 * gasClient.ts
 *
 * HTTP-клиент для взаимодействия с Google Apps Script (GAS) Web App.
 */
import { config } from '../../config/env.js';

interface GasResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
}

class GasClient {
    private baseUrl: string;
    private timeout: number;
    private retryCount: number;

    constructor() {
        this.baseUrl = config.gasApiUrl;
        this.timeout = config.gasApiTimeout;
        this.retryCount = config.gasApiRetryCount;
        if (this.baseUrl) new URL(this.baseUrl);
    }

    private async fetchWithRetry<T>(url: string, options: RequestInit, action: string): Promise<T> {
        const baseDelay = 1000;
        for (let attempt = 0; attempt <= this.retryCount; attempt++) {
            try {
                let response = await fetch(url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(this.timeout) });
                if (response.status >= 300 && response.status < 400) {
                    const redirectUrl = response.headers.get('location');
                    if (redirectUrl) {
                        response = await fetch(redirectUrl, { method: 'GET', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(this.timeout) });
                    }
                }
                if (!response.ok && response.status >= 500 && attempt < this.retryCount) {
                    const delay = baseDelay * Math.pow(2, attempt);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                if (!response.ok) throw new Error(`GAS API ${action}: HTTP ${response.status} ${response.statusText}`);
                const json = await response.json() as GasResponse<T>;
                if (!json.success) throw new Error(json.error || `GAS API ${action}: unknown error`);
                return json.data as T;
            } catch (error) {
                if (error instanceof DOMException && error.name === 'TimeoutError') {
                    throw new Error(`GAS API ${action}: timeout after ${this.timeout}ms`);
                }
                if (attempt === this.retryCount) throw error;
                const delay = baseDelay * Math.pow(2, attempt);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        throw new Error(`GAS API ${action}: max retries exceeded`);
    }

    async get<T>(action: string, params?: Record<string, string | undefined>): Promise<T> {
        const url = new URL(this.baseUrl);
        url.searchParams.append('action', action);
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined) url.searchParams.append(key, value);
            });
        }
        return this.fetchWithRetry<T>(url.toString(), { method: 'GET', headers: { Accept: 'application/json' } }, action);
    }

    async post<T>(action: string, data: Record<string, unknown>): Promise<T> {
        return this.fetchWithRetry<T>(this.baseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ action, ...data }),
        }, action);
    }
}

export const gasClient = new GasClient();
