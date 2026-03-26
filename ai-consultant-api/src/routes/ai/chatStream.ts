/**
 * chatStream.ts
 *
 * SSE-эндпоинт для стриминга ответов AI-агента.
 */
import { Router, Response } from 'express';
import { ProviderFactory, type ChatMessage, type ToolDefinition, type EquipmentContext, type WaterDashboardContext } from '../../services/ai/index.js';
import { tools } from '../../tools/index.js';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth.js';
import { getOrCreateSession, saveMessages, updateSessionTitle } from '../../services/ai/chatMemoryService.js';
import { loadFactsForPrompt } from '../../services/ai/agentMemoryService.js';
import { StreamEvent } from '../../services/ai/types.js';
import rateLimit from 'express-rate-limit';

const router = Router();
const MAX_MESSAGES = 50;

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

interface StreamChatRequestBody {
    messages: ChatMessage[];
    equipmentContext?: EquipmentContext;
    waterContext?: WaterDashboardContext;
}

router.post('/', chatRateLimit, authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    const { messages, equipmentContext, waterContext } = req.body as StreamChatRequestBody;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: 'Messages array is required' });
        return;
    }
    if (messages.length > MAX_MESSAGES) {
        res.status(400).json({ error: `Too many messages: max ${MAX_MESSAGES}` });
        return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const userId = req.user?.id || '';
    const writeEvent = (event: StreamEvent): boolean => {
        if (res.writableEnded) return false;
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        return true;
    };

    let fullText = '';
    const toolsUsedList: string[] = [];

    try {
        const hasImages = messages.some(m => Array.isArray(m.content) && m.content.some(b => (b as any).type === 'image'));
        // При наличии вложенных фото предпочитаем мультимодальный провайдер, иначе DeepSeek не сможет загрузить фото.
        const provider = await ProviderFactory.create(hasImages ? 'claude' : undefined);
        const factsPrompt = await loadFactsForPrompt().catch(() => '');

        const onEvent = (event: StreamEvent): void => {
            if (event.type === 'text_delta') {
                fullText += event.delta;
            } else if (event.type === 'done') {
                toolsUsedList.push(...(event.toolsUsed || []));
            }
            writeEvent(event);
        };

        await provider.streamChat(
            messages,
            tools as ToolDefinition[],
            userId,
            onEvent,
            equipmentContext,
            waterContext,
            factsPrompt ? { factsPrompt } : undefined,
        );

        const lastUserMessage = messages[messages.length - 1];
        const sessionId = await getOrCreateSession(userId, equipmentContext?.id);

        if (typeof lastUserMessage.content === 'string') {
            updateSessionTitle(sessionId, lastUserMessage.content).catch(() => {});
        }

        saveMessages(sessionId, userId, lastUserMessage, fullText, toolsUsedList)
            .catch(err => console.error('[Stream] Ошибка сохранения в память:', err));
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        writeEvent({ type: 'error', message });
    } finally {
        if (!res.writableEnded) res.end();
    }
});

export default router;
