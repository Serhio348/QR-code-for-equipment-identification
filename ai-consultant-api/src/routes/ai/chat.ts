/**
 * chat.ts
 *
 * Маршрут (route) для чат-эндпоинта AI-консультанта.
 */
import { Router, Response } from 'express';
import { ProviderFactory, type ChatMessage, type ToolDefinition, type EquipmentContext, type WaterDashboardContext } from '../../services/ai/index.js';
import { tools } from '../../tools/index.js';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth.js';
import rateLimit from 'express-rate-limit';
import {
    getOrCreateSession,
    saveMessages,
    loadRecentHistory,
    updateSessionTitle,
} from '../../services/ai/chatMemoryService.js';
import { loadFactsForPrompt } from '../../services/ai/agentMemoryService.js';

const router = Router();
const MAX_MESSAGES = 50;
const MAX_MESSAGE_LENGTH = 32_000;

const chatRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please slow down' },
});

router.options('/', (_req, res) => {
    res.status(200).end();
});

interface ChatRequestBody {
    messages: ChatMessage[];
    equipmentContext?: EquipmentContext;
    waterContext?: WaterDashboardContext;
}

router.post('/', chatRateLimit, authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { messages, equipmentContext, waterContext } = req.body as ChatRequestBody;

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            res.status(400).json({ error: 'Messages array is required' });
            return;
        }
        if (messages.length > MAX_MESSAGES) {
            res.status(400).json({ error: `Too many messages: max ${MAX_MESSAGES} allowed` });
            return;
        }

        for (const msg of messages) {
            if (!msg.role || !msg.content) {
                res.status(400).json({ error: 'Invalid message format' });
                return;
            }
            if (msg.role !== 'user' && msg.role !== 'assistant') {
                res.status(400).json({ error: 'Invalid message role' });
                return;
            }
            if (typeof msg.content !== 'string' && !Array.isArray(msg.content)) {
                res.status(400).json({ error: 'Invalid content type' });
                return;
            }
            if (typeof msg.content === 'string' && msg.content.length > MAX_MESSAGE_LENGTH) {
                res.status(400).json({ error: `Message too long: max ${MAX_MESSAGE_LENGTH} characters` });
                return;
            }
        }

        const userId = req.user?.id || '';
        const backgroundHistory = await loadRecentHistory(userId, 10).catch(() => [] as ChatMessage[]);
        const messagesWithHistory: ChatMessage[] = backgroundHistory.length > 0
            ? [...backgroundHistory, ...messages]
            : messages;

        const hasImages = messagesWithHistory.some(m => Array.isArray(m.content) && m.content.some(b => (b as any).type === 'image'));
        // Если пользователь прикрепил фото — выбираем провайдера с поддержкой мультимодальности.
        // Иначе DeepSeek не сможет вызвать tools для загрузки (он не "видит" вложения).
        const provider = await ProviderFactory.create(hasImages ? 'claude' : undefined);
        const factsPrompt = await loadFactsForPrompt().catch(() => '');

        const response = await provider.chat(
            messagesWithHistory,
            tools as ToolDefinition[],
            userId,
            equipmentContext,
            waterContext,
            factsPrompt ? { factsPrompt } : undefined
        );

        const lastUserMessage = messages[messages.length - 1];
        const sessionId = await getOrCreateSession(userId, equipmentContext?.id);

        if (typeof lastUserMessage.content === 'string') {
            updateSessionTitle(sessionId, lastUserMessage.content).catch(() => {});
        }

        saveMessages(
            sessionId,
            userId,
            lastUserMessage,
            response.message,
            response.toolsUsed || []
        ).catch(err => console.error('Ошибка сохранения в память:', err));

        res.json({
            success: true,
            data: response,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({
            success: false,
            error: message,
        });
    }
});

router.get('/history', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
    res.json({
        success: true,
        data: { messages: [] },
    });
});

export default router;
