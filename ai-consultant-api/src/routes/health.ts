/**
 * health.ts
 *
 * Маршрут (route) для health-check эндпоинта.
 *
 * Health-check — стандартный паттерн для мониторинга доступности сервиса.
 * Используется балансировщиками нагрузки, системами мониторинга (Uptime Robot,
 * Prometheus) и CI/CD пайплайнами для проверки, что сервер запущен и отвечает.
 *
 * Эндпоинт:
 *   GET /health → 200 { status, timestamp, version }
 *
 * Особенности:
 * - НЕ требует аутентификации (authMiddleware не подключён)
 * - Минимальная нагрузка — нет обращений к БД или внешним API
 * - Возвращает версию из package.json (npm_package_version)
 *
 * Файл экспортирует:
 * - default router — Express Router, подключается в index.ts
 */

// ============================================
// Импорты
// ============================================

// Router — для определения маршрутов отдельно от app
// Request, Response — типы Express для типизации параметров обработчика
import { Router, Request, Response } from 'express';

// ============================================
// Инициализация роутера
// ============================================

// Создаём отдельный Router для health-check.
// Подключается в index.ts: app.use('/health', healthRouter)
const router = Router();

// ============================================
// GET /health
// ============================================

/**
 * Health-check эндпоинт.
 *
 * Возвращает JSON с информацией о состоянии сервиса:
 * - status: 'ok' — сервер работает и принимает запросы
 * - timestamp: текущее время в ISO 8601 (для проверки синхронизации часов)
 * - version: версия приложения из package.json
 *
 * @example
 * GET /health
 * Response: {
 *   "status": "ok",
 *   "timestamp": "2025-06-15T10:30:00.000Z",
 *   "version": "1.0.0"
 * }
 */
router.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
  });
});

// ============================================
// Экспорт
// ============================================

// Экспортируем router как default.
// В index.ts подключается: app.use('/health', healthRouter)
export default router;
