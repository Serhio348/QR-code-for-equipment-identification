/**
 * chatStream.ts
 *
 * SSE-эндпоинт для стриминга ответов AI-агента.
 *
 * POST /api/chat/stream — возвращает Server-Sent Events поток:
 *   data: {"type":"tool_call","name":"get_invoices"}
 *   data: {"type":"text_delta","delta":"Вот данные за февраль..."}
 *   data: {"type":"done","toolsUsed":["get_invoices"]}
 *   data: {"type":"error","message":"..."}
 *
 * Фронтенд читает поток через fetch + ReadableStream и обновляет
 * сообщение в UI по мере прихода text_delta событий.
 */

import { Router, Response } from 'express';
import { ProviderFactory, type ChatMessage, type ToolDefinition, type EquipmentContext, type WaterDashboardContext } from '../services/ai/index.js';
import { tools } from '../tools/index.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { getOrCreateSession, saveMessages, loadRecentHistory, updateSessionTitle } from '../services/chatMemoryService.js';
import { loadFactsForPrompt } from '../services/agentMemoryService.js';
import { StreamEvent } from '../services/ai/types.js';
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

router.options('/', (req, res) => {
    res.status(200).end();
});

interface StreamChatRequestBody {
    messages: ChatMessage[];
    equipmentContext?: EquipmentContext;
    waterContext?: WaterDashboardContext;
}

// ============================================
// POST /api/chat/stream
// ============================================

router.post('/', chatRateLimit, authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    const { messages, equipmentContext, waterContext } = req.body as StreamChatRequestBody;

    // Валидация
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: 'Messages array is required' });
        return;
    }
    if (messages.length > MAX_MESSAGES) {
        res.status(400).json({ error: `Too many messages: max ${MAX_MESSAGES}` });
        return;
    }

    // ----------------------------------------
    // SSE заголовки
    // ----------------------------------------
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // отключаем nginx буферизацию
    res.flushHeaders();

    const userId = req.user?.id || '';

    // Утилита: записать SSE событие
    const writeEvent = (event: StreamEvent): boolean => {
        if (res.writableEnded) return false;
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        return true;
    };

    // Накапливаем полный текст для сохранения в память
    let fullText = '';
    const toolsUsedList: string[] = [];

    try {
        console.log(
            `[Stream] Chat request from user ${req.user?.email}, messages: ${messages.length}`,
            equipmentContext ? `context: ${equipmentContext.name}` : 'no context'
        );

        // Фоновая история отключена — каждая сессия независима
        const messagesWithHistory: ChatMessage[] = messages;

        // Провайдер
        const provider = await ProviderFactory.create();
        const factsPrompt = await loadFactsForPrompt().catch(() => '');

        // Обёртка onEvent: накапливаем текст + пересылаем клиенту
        const onEvent = (event: StreamEvent): void => {
            if (event.type === 'text_delta') {
                fullText += event.delta;
                toolsUsedList; // reference to avoid lint
            } else if (event.type === 'done') {
                toolsUsedList.push(...(event.toolsUsed || []));
            }
            writeEvent(event);
        };

        await provider.streamChat(
            messagesWithHistory,
            tools as ToolDefinition[],
            userId,
            onEvent,
            equipmentContext,
            waterContext,
            factsPrompt ? { factsPrompt } : undefined,
        );

        // Сохраняем в память (не блокируем ответ)
        const lastUserMessage = messages[messages.length - 1];
        const sessionId = await getOrCreateSession(userId, equipmentContext?.id);

        if (typeof lastUserMessage.content === 'string') {
            updateSessionTitle(sessionId, lastUserMessage.content).catch(() => {});
        }

        saveMessages(
            sessionId,
            userId,
            lastUserMessage,
            fullText,
            toolsUsedList,
        ).catch(err => console.error('[Stream] Ошибка сохранения в память:', err));

    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[Stream] Error:', err);
        writeEvent({ type: 'error', message });
    } finally {
        if (!res.writableEnded) res.end();
    }
});

export default router;
