/**
 * vitest.config.ts
 *
 * Изолированная конфигурация тестов backend.
 *
 * Структура / что умеет:
 * 1. test — запускает backend-тесты в окружении Node.js
 * 2. setupFiles — подставляет пустой адрес Supabase, если в CI нет .env
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        setupFiles: ['./vitest.setup.ts'],
        include: ['src/**/*.test.ts'],
    },
});
