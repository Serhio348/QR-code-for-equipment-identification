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

// chatMemoryService — сохранение и загрузка истории чата между сессиями
import {
    getOrCreateSession,
    saveMessages,
    loadRecentHistory,
    updateSessionTitle,
} from '../services/chatMemoryService.js';

// ============================================
// Инициализация роутера
// ============================================

// Создаём отдельный Router для чат-эндпоинтов.
// Подключается в index.ts: app.use('/api/chat', chatRouter)
// Все маршруты здесь будут относительно /api/chat
const router = Router();

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
router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
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
        }

        // Логируем запрос (email пользователя + количество сообщений + контекст)
        // Полезно для отладки и мониторинга использования
        console.log(
            `Chat request from user ${req.user?.email}, messages: ${messages.length}`,
            equipmentContext ? `context: ${equipmentContext.name} (${equipmentContext.id})` : 'no context'
        );

        const userId = req.user?.id || '';

        // ----------------------------------------
        // Память: загружаем историю прошлых сессий
        // ----------------------------------------
        // Загружаем последние 20 сообщений из БД и добавляем их В НАЧАЛО
        // текущего массива messages. Так агент видит прошлые разговоры
        // как будто они произошли в этой же сессии.
        //
        // Пример итогового массива для AI:
        //   [история из БД...] + [текущие сообщения из фронтенда]
        //
        // Фронтенд присылает только сообщения ТЕКУЩЕЙ сессии (с момента открытия чата).
        // Мы добавляем к ним историю ПРОШЛЫХ сессий из БД.
        const history = await loadRecentHistory(userId);

        // Объединяем: история (старые) + текущие сообщения (новые)
        // Дедупликация не нужна — фронтенд не хранит историю между перезагрузками
        const messagesWithHistory: ChatMessage[] = [...history, ...messages];

        // ----------------------------------------
        // Обработка через AI Provider (Claude, Gemini, или другой)
        // ----------------------------------------
        // ProviderFactory создаёт провайдер на основе конфигурации (AI_PROVIDER)
        // с автоматическим fallback на доступные провайдеры.
        // Провайдер запускает агентный цикл с tool calling.
        const provider = await ProviderFactory.create();

        const response = await provider.chat(
            messagesWithHistory,
            tools as ToolDefinition[], // Type assertion для совместимости Anthropic.Tool с ToolDefinition
            userId,
            equipmentContext,
            waterContext
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
    try {
        const userId = req.user?.id || '';
        const limit = Math.min(Number(req.query.limit) || 20, 100);

        const messages = await loadRecentHistory(userId, limit);

        res.json({
            success: true,
            data: { messages },
        });
    } catch (error) {
        console.error('Ошибка загрузки истории:', error);
        res.status(500).json({ success: false, error: 'Не удалось загрузить историю' });
    }
});

// ============================================
// Экспорт
// ============================================

// Экспортируем router как default.
// В index.ts подключается: app.use('/api/chat', chatRouter)
export default router;
