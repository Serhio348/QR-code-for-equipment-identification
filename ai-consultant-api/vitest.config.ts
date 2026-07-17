/**
 * vitest.config.ts
 *
 * Изолированная конфигурация тестов backend.
 *
 * Структура / что умеет:
 * 1. test — запускает backend-тесты в окружении Node.js
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts'],
    },
});
