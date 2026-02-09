/**
 * index.ts
 *
 * Точка входа (entry point) AI Consultant API сервера.
 *
 * Этот файл создаёт и настраивает Express-приложение,
 * подключает middleware и маршруты, запускает HTTP-сервер.
 *
 * Архитектура приложения:
 * ┌─────────────────────────────────────────────────────────────┐
 * │  index.ts (этот файл) — точка входа                        │
 * │       ↓                                                     │
 * │  validateConfig() — проверка .env переменных                │
 * │       ↓                                                     │
 * │  Middleware pipeline:                                       │
 * │  ┌───────────────────────────────────────────────────────┐  │
 * │  │  helmet()        — HTTP-заголовки безопасности        │  │
 * │  │  cors()          — Cross-Origin Resource Sharing      │  │
 * │  │  express.json()  — парсинг JSON body                  │  │
 * │  │  request logger  — логирование входящих запросов      │  │
 * │  └───────────────────────────────────────────────────────┘  │
 * │       ↓                                                     │
 * │  Маршруты:                                                  │
 * │  ┌───────────────────────────────────────────────────────┐  │
 * │  │  /health     → healthRouter  (GET — health-check)     │  │
 * │  │  /api/chat   → chatRouter    (POST — Claude AI чат)   │  │
 * │  └───────────────────────────────────────────────────────┘  │
 * │       ↓                                                     │
 * │  404 handler  — несуществующие маршруты                     │
 * │  Error handler — необработанные ошибки                      │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Порядок middleware ВАЖЕН:
 * Express обрабатывает middleware в порядке их регистрации (app.use).
 * Helmet и CORS должны быть ДО маршрутов, чтобы заголовки
 * безопасности добавлялись ко всем ответам.
 * 404 и Error handler должны быть ПОСЛЕ маршрутов,
 * чтобы перехватывать только необработанные запросы.
 */

// ============================================
// Импорты
// ============================================

// Express — HTTP-фреймворк для Node.js
import express from 'express';

// cors — middleware для настройки Cross-Origin Resource Sharing.
// Разрешает фронтенду (localhost:5173 или продакшн домен)
// отправлять запросы к API на другом порту/домене
import cors from 'cors';

// helmet — middleware безопасности.
// Устанавливает HTTP-заголовки: X-Content-Type-Options, X-Frame-Options,
// Strict-Transport-Security, Content-Security-Policy и другие.
// Защищает от XSS, clickjacking, MIME-sniffing атак
import helmet from 'helmet';

// config — объект с конфигурацией из .env (порт, ключи API, CORS origins)
// validateConfig — функция проверки обязательных переменных окружения
import { config, validateConfig } from './config/env.js';

// chatRouter — маршруты чата с Claude AI (POST /api/chat)
import chatRouter from './routes/chat.js';

// healthRouter — health-check эндпоинт (GET /health)
import healthRouter from './routes/health.js';

// ============================================
// Валидация конфигурации
// ============================================

// Проверяем, что все обязательные переменные окружения заданы в .env:
// - anthropicApiKey (Claude API)
// - supabaseUrl, supabaseServiceKey (аутентификация)
// - gasApiUrl (Google Apps Script API)
// Если чего-то не хватает — приложение упадёт с понятной ошибкой
// ДО запуска сервера, а не при первом запросе пользователя
validateConfig();

// ============================================
// Создание Express приложения
// ============================================

const app = express();

// ============================================
// Middleware
// ============================================

// --- Безопасность ---
// helmet() добавляет ~15 HTTP-заголовков безопасности.
// Подробнее: https://helmetjs.github.io/
app.use(helmet());

// --- CORS ---
// Разрешаем запросы только с доверенных origins (из .env ALLOWED_ORIGINS).
// credentials: true — разрешает отправку cookies и Authorization заголовков.
// Без CORS браузер заблокирует запросы фронтенда к API,
// если они на разных портах (5173 vs 3001)
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Разрешаем запросы без origin (например, Postman, curl)
    if (!origin) {
      return callback(null, true);
    }

    // Проверяем, есть ли origin в списке разрешённых
    if (config.allowedOrigins.includes(origin)) {
      console.log(`✅ CORS: Allowed origin: ${origin}`);
      callback(null, true);
    } else {
      console.warn(`❌ CORS: Blocked origin: ${origin}`);
      console.warn(`   Allowed origins: ${config.allowedOrigins.join(', ')}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Length', 'Content-Type'],
  maxAge: 86400, // 24 hours - кэширование preflight запросов
};

app.use(cors(corsOptions));

// Явная обработка OPTIONS запросов для CORS pre-flight
app.options('*', cors(corsOptions));

// --- Парсинг JSON ---
// Автоматически парсит тело запроса с Content-Type: application/json.
// limit: '1mb' — максимальный размер тела запроса.
// Защита от слишком больших запросов (по умолчанию Express разрешает 100kb)
app.use(express.json({ limit: '1mb' }));

// --- Логирование запросов ---
// Простой request logger — записывает каждый входящий запрос.
// Формат: "2025-01-15T10:30:00.000Z GET /health"
// В продакшне можно заменить на morgan или winston
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// ============================================
// Маршруты (Routes)
// ============================================

// Health-check — GET /health
// Публичный эндпоинт (без аутентификации) для мониторинга
app.use('/health', healthRouter);

// Чат с AI — POST /api/chat
// Защищён authMiddleware внутри chatRouter.
// Принимает историю сообщений, возвращает ответ Claude
app.use('/api/chat', chatRouter);

// ============================================
// Обработка 404 (Not Found)
// ============================================

// Этот middleware срабатывает, если ни один маршрут выше не обработал запрос.
// Например: GET /api/users → 404, потому что такого маршрута нет.
// Важно: регистрируется ПОСЛЕ всех маршрутов
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ============================================
// Обработка ошибок (Error Handler)
// ============================================

// Express Error Handler — перехватывает все необработанные ошибки.
// Сигнатура с 4 параметрами (err, req, res, next) — обязательна,
// именно по ней Express отличает error handler от обычного middleware.
//
// Срабатывает когда:
// - Middleware или route вызывает next(error)
// - В async route возникает необработанное исключение (Express 5+)
// - JSON body невалиден (SyntaxError от express.json())
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ============================================
// Запуск сервера
// ============================================

// app.listen() создаёт HTTP-сервер и начинает слушать указанный порт.
// Callback вызывается когда сервер готов принимать соединения
app.listen(config.port, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║   AI Consultant API Server                   ║
╠══════════════════════════════════════════════╣
║   Port: ${config.port.toString().padEnd(37)}║
║   Environment: ${config.nodeEnv.padEnd(30)}║
║   Allowed origins: ${config.allowedOrigins.length.toString().padEnd(25)}║
╚══════════════════════════════════════════════╝
  `);
});
