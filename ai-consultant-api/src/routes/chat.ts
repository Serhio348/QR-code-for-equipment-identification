/**
 * chat.ts
 *
 * Маршрут (route) для чат-эндпоинта AI-консультанта.
 *
 * Обрабатывает POST /api/chat — единственный эндпоинт, через который
 * фронтенд общается с AI (Claude, Gemini, или другой провайдер).
 * Принимает историю переписки и возвращает ответ AI.
 *
 * Цепочка обработки запроса:
 * ┌─────────────────────────────────────────────────────────────┐
 * │  Фронтенд (React)                                          │
 * │  POST /api/chat { messages: [...] }                         │
 * │  Authorization: Bearer <JWT token>                          │
 * │       ↓                                                     │
 * │  authMiddleware — проверка JWT через Supabase               │
 * │       ↓                                                     │
 * │  chat.ts (этот файл) — валидация messages                   │
 * │       ↓                                                     │
 * │  ProviderFactory.create() — выбор AI провайдера             │
 * │       ↓                                                     │
 * │  provider.chat() — агентный цикл с tool calling             │
 * │       ↓                                                     │
 * │  Ответ: { success: true, data: { message, toolsUsed } }    │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Файл экспортирует:
 * - default router — Express Router, подключается в index.ts
 */

// ============================================
// Импорты
// ============================================

// Express Router — для определения маршрутов отдельно от app
// Response — тип для типизации res параметра
import { Router, Response } from 'express';

// ProviderFactory — фабрика для создания AI провайдера (Claude, Gemini, OpenAI)
// ChatMessage — тип сообщения { role: 'user' | 'assistant', content: string }
// ToolDefinition — универсальный формат определения tool
// EquipmentContext — контекст оборудования для поиска в конкретной папке
import { ProviderFactory, type ChatMessage, type ToolDefinition, type EquipmentContext, type WaterDashboardContext } from '../services/ai/index.js';

// tools — определения всех доступных инструментов для AI
import { tools } from '../tools/index.js';

// authMiddleware — middleware для проверки JWT токена Supabase
// AuthenticatedRequest — расширенный Request с полем req.user
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';

// rate limiting — ограничение частоты запросов на пользователя
import rateLimit from 'express-rate-limit';

// chatMemoryService — сохранение и загрузка истории чата между сессиями
import {
    getOrCreateSession,
    saveMessages,
    loadRecentHistory,
    updateSessionTitle,
} from '../services/chatMemoryService.js';

// agentMemoryService — долговременная память: факты, тарифы, контакты
import { loadFactsForPrompt } from '../services/agentMemoryService.js';

// ============================================
// Инициализация роутера
// ============================================

// Создаём отдельный Router для чат-эндпоинтов.
// Подключается в index.ts: app.use('/api/chat', chatRouter)
// Все маршруты здесь будут относительно /api/chat
const router = Router();

// ============================================
// Лимиты
// ============================================

// Максимальное количество сообщений в одном запросе
const MAX_MESSAGES = 50;
// Максимальная длина одного сообщения в символах (~25k токенов)
const MAX_MESSAGE_LENGTH = 32_000;

// Rate limiter: не более 30 запросов в минуту на IP
// Защита от случайных циклов на фронтенде и злоупотреблений
const chatRateLimit = rateLimit({
    windowMs: 60 * 1000, // 1 минута
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please slow down' },
});

// ============================================
// CORS preflight для этого роута
// ============================================
// Явно обрабатываем OPTIONS запрос для preflight
router.options('/', (req, res) => {
    console.log('OPTIONS /api/chat - preflight request');
    res.status(200).end();
});

// ============================================
// Типы
// ============================================

/**
 * Тело POST запроса от фронтенда.
 *
 * Фронтенд отправляет всю историю переписки при каждом сообщении,
 * чтобы Claude имел полный контекст разговора.
 *
 * @example
 * {
 *   "messages": [
 *     { "role": "user", "content": "Найди фильтр ФО-0,8" },
 *     { "role": "assistant", "content": "Найден фильтр: ФО-0,8-1,5..." },
 *     { "role": "user", "content": "Покажи журнал обслуживания" }
 *   ],
 *   "equipmentContext": {
 *     "id": "eq123",
 *     "name": "Фильтр ФО-0,8",
 *     "type": "Фильтр обезжелезивания",
 *     "googleDriveUrl": "https://drive.google.com/..."
 *   }
 * }
 */
interface ChatRequestBody {
    messages: ChatMessage[];
    equipmentContext?: EquipmentContext;
    waterContext?: WaterDashboardContext;
}

// ============================================
// POST /api/chat
// ============================================

/**
 * Обработка сообщения чата.
 *
 * Маршрут защищён authMiddleware — только авторизованные пользователи
 * могут отправлять сообщения. Неавторизованные получат 401.
 *
 * Этапы обработки:
 * 1. authMiddleware проверяет JWT → добавляет req.user
 * 2. Валидация тела запроса (messages обязателен, формат проверяется)
 * 3. processChatMessage отправляет в Claude → агентный цикл → ответ
 * 4. Возврат ответа в формате { success: true, data: { message, toolsUsed } }
 *
 * Коды ответов:
 * - 200: успешный ответ от Claude
 * - 400: невалидный запрос (нет messages, неверный формат)
 * - 401: нет/невалидный JWT токен (от authMiddleware)
 * - 500: ошибка Claude API или внутренняя ошибка
 */
router.post('/', chatRateLimit, authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { messages, equipmentContext, waterContext } = req.body as ChatRequestBody;

        // ----------------------------------------
        // Валидация: messages обязателен и не пуст
        // ----------------------------------------
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            res.status(400).json({ error: 'Messages array is required' });
            return;
        }

        // ----------------------------------------
        // Лимит: не более MAX_MESSAGES сообщений за раз
        // ----------------------------------------
        if (messages.length > MAX_MESSAGES) {
            res.status(400).json({ error: `Too many messages: max ${MAX_MESSAGES} allowed` });
            return;
        }

        // ----------------------------------------
        // Валидация: формат каждого сообщения
        // ----------------------------------------
        // Проверяем, что каждое сообщение имеет role и content.
        // role может быть только 'user' или 'assistant'.
        // content может быть:
        //   - string (простое текстовое сообщение)
        //   - Array<TextBlock | ImageBlock> (мультимодальное сообщение с фото)
        for (const msg of messages) {
            if (!msg.role || !msg.content) {
                res.status(400).json({ error: 'Invalid message format' });
                return;
            }
            if (msg.role !== 'user' && msg.role !== 'assistant') {
                res.status(400).json({ error: 'Invalid message role' });
                return;
            }
            // Проверяем тип content: должен быть string или array
            if (typeof msg.content !== 'string' && !Array.isArray(msg.content)) {
                res.status(400).json({ error: 'Invalid content type' });
                return;
            }
            // Лимит длины текстового сообщения
            if (typeof msg.content === 'string' && msg.content.length > MAX_MESSAGE_LENGTH) {
                res.status(400).json({ error: `Message too long: max ${MAX_MESSAGE_LENGTH} characters` });
                return;
            }
        }

        // Логируем запрос (email пользователя + количество сообщений + контекст)
        // Полезно для отладки и мониторинга использования
        console.log(
            `Chat request from user ${req.user?.email}, messages: ${messages.length}`,
            equipmentContext ? `context: ${equipmentContext.name} (${equipmentContext.id})` : 'no context'
        );

        const userId = req.user?.id || '';

        // ----------------------------------------
        // Фоновая история: загружаем последние сообщения для контекста AI
        // ----------------------------------------
        // Пользователь видит пустой чат, но агент помнит предыдущий разговор.
        // Загружаем последние 10 сообщений из прошлой сессии и добавляем
        // их в начало messages — AI получает контекст, фронтенд его не видит.
        const backgroundHistory = await loadRecentHistory(userId, 10).catch(() => [] as ChatMessage[]);
        const messagesWithHistory: ChatMessage[] = backgroundHistory.length > 0
            ? [...backgroundHistory, ...messages]
            : messages;

        // ----------------------------------------
        // Обработка через AI Provider (Claude, Gemini, или другой)
        // ----------------------------------------
        // ProviderFactory создаёт провайдер на основе конфигурации (AI_PROVIDER)
        // с автоматическим fallback на доступные провайдеры.
        // Провайдер запускает агентный цикл с tool calling.
        const provider = await ProviderFactory.create();

        // Загружаем долговременную память агента (факты, тарифы, контакты)
        const factsPrompt = await loadFactsForPrompt().catch(() => '');

        const response = await provider.chat(
            messagesWithHistory,
            tools as ToolDefinition[],
            userId,
            equipmentContext,
            waterContext,
            factsPrompt ? { factsPrompt } : undefined
        );

        // ----------------------------------------
        // Память: сохраняем новый обмен сообщениями в БД
        // ----------------------------------------
        // Сохраняем только ПОСЛЕДНЕЕ сообщение пользователя (не всю историю) —
        // предыдущие уже были сохранены в прошлых запросах.
        const lastUserMessage = messages[messages.length - 1];

        // Запускаем сохранение параллельно с отправкой ответа (не блокируем)
        const sessionId = await getOrCreateSession(userId, equipmentContext?.id);

        // Обновляем заголовок сессии если это первое сообщение
        if (typeof lastUserMessage.content === 'string') {
            updateSessionTitle(sessionId, lastUserMessage.content).catch(() => {});
        }

        // Сохраняем пару: сообщение пользователя + ответ агента
        saveMessages(
            sessionId,
            userId,
            lastUserMessage,
            response.message,
            response.toolsUsed || []
        ).catch(err => console.error('Ошибка сохранения в память:', err));

        // Успешный ответ — оборачиваем в { success, data }
        // для единообразия с остальными API ответами
        res.json({
            success: true,
            data: response,
        });

    } catch (error) {
        // ----------------------------------------
        // Обработка ошибок
        // ----------------------------------------
        // Возможные ошибки:
        // - Claude API: rate limit (429), auth error (401), server error (500)
        // - GAS API: таймаут, 5xx, бизнес-ошибки
        // - Внутренние: превышен maxAgentIterations
        console.error('Chat error:', error);

        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({
            success: false,
            error: message,
        });
    }
});

// ============================================
// GET /api/chat/history
// ============================================

/**
 * Загрузить историю чата для отображения в интерфейсе.
 *
 * Фронтенд вызывает этот эндпоинт при открытии чата,
 * чтобы показать пользователю прошлые сообщения.
 *
 * Отличие от логики выше (в POST):
 *   POST — загружает историю для контекста AI (тихо, без UI)
 *   GET  — загружает историю для отображения пользователю
 *
 * Query параметры:
 *   limit — сколько сообщений вернуть (по умолчанию 20, макс 100)
 *
 * Ответ: { success: true, data: { messages: ChatMessage[] } }
 */
router.get('/history', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    // История не отображается в UI — чат всегда начинается пустым.
    // История загружается фоново в POST /api/chat для контекста AI.
    res.json({
        success: true,
        data: { messages: [] },
    });
});

// ============================================
// Экспорт
// ============================================

// Экспортируем router как default.
// В index.ts подключается: app.use('/api/chat', chatRouter)
export default router;
