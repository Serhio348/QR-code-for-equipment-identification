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
import { ProviderFactory, type ChatMessage, type ToolDefinition, type EquipmentContext } from '../services/ai/index.js';

// tools — определения всех доступных инструментов для AI
import { tools } from '../tools/index.js';

// authMiddleware — middleware для проверки JWT токена Supabase
// AuthenticatedRequest — расширенный Request с полем req.user
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';

// ============================================
// Инициализация роутера
// ============================================

// Создаём отдельный Router для чат-эндпоинтов.
// Подключается в index.ts: app.use('/api/chat', chatRouter)
// Все маршруты здесь будут относительно /api/chat
const router = Router();

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
}

// ============================================
// OPTIONS /api/chat - CORS pre-flight
// ============================================

/**
 * Обработка CORS pre-flight запроса.
 * Браузер отправляет OPTIONS перед POST с Authorization заголовком.
 */
router.options('/', (_req, res) => {
    res.status(200).end();
});

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
        const { messages, equipmentContext } = req.body as ChatRequestBody;

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

        // ----------------------------------------
        // Обработка через AI Provider (Claude, Gemini, или другой)
        // ----------------------------------------
        // ProviderFactory создаёт провайдер на основе конфигурации (AI_PROVIDER)
        // с автоматическим fallback на доступные провайдеры.
        // Провайдер запускает агентный цикл с tool calling.
        const provider = await ProviderFactory.create();

        const response = await provider.chat(
            messages,
            tools as ToolDefinition[], // Type assertion для совместимости Anthropic.Tool с ToolDefinition
            req.user?.id || '',
            equipmentContext
        );

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
// Экспорт
// ============================================

// Экспортируем router как default.
// В index.ts подключается: app.use('/api/chat', chatRouter)
export default router;
