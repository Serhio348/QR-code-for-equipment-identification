#!/usr/bin/env node
/**
 * index.ts
 *
 * Точка входа MCP сервера.
 * Запускает сервер и обрабатывает сигналы завершения.
 */

import { createServer } from './server.js';
import { config, validateConfig } from './config/env.js';

/**
 * Главная функция запуска сервера.
 */
async function main(): Promise<void> {
  try {
    // Валидируем конфигурацию
    validateConfig();

    // Создаём и запускаем сервер
    const server = createServer();

    // Запускаем сервер через stdio (стандартный способ для MCP)
    await server.start();

    if (config.debug) {
      console.error('✅ MCP сервер запущен');
    }

  } catch (error) {
    console.error('❌ Ошибка запуска MCP сервера:', error);
    process.exit(1);
  }
}

// Обработка сигналов завершения
process.on('SIGINT', () => {
  console.error('Получен SIGINT, завершение...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('Получен SIGTERM, завершение...');
  process.exit(0);
});

// Запуск
main();
