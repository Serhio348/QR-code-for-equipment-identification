/**
 * chatStream.ts
 *
 * SSE-эндпоинт для стриминга ответов AI-агента.
 */
import { Router, Response } from 'express';
import { ProviderFactory, type ChatMessage, type ToolDefinition, type EquipmentContext, type WaterDashboardContext } from '../../services/ai/index.js';
import { tools } from '../../tools/index.js';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth.js';
import { getOrCreateSession, saveMessages, updateSessionTitle, loadRecentHistory } from '../../services/ai/chatMemoryService.js';
import { mergeConversation, type ConversationMode } from '../../services/ai/conversationHistory.js';
import { validateChatMessages } from './chatRequestValidation.js';
import { loadFactsForPrompt } from '../../services/ai/agentMemoryService.js';
import { buildDriveFileContext } from '../../services/ai/driveFileContextService.js';
import { buildDocumentSessionPrompt } from '../../services/ai/documentSessionService.js';
import { StreamEvent } from '../../services/ai/types.js';
import { loadUserAppAccess } from '../../services/ai/userAppAccessService.js';
import { filterToolsByAccess, buildAppAccessPrompt } from '../../services/ai/toolAccessPolicy.js';
import { runWithToolContext } from '../../services/ai/toolContext.js';
import rateLimit from 'express-rate-limit';
import { config } from '../../config/env.js';

const router = Router();

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
    conversation?: ConversationMode;
}

router.post('/', chatRateLimit, authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    const { messages, equipmentContext, waterContext, conversation } = req.body as StreamChatRequestBody;

    const invalid = validateChatMessages(messages);
    if (invalid) {
        res.status(400).json({ error: invalid });
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
        const mode: ConversationMode = conversation === 'fresh' ? 'fresh' : 'continue';
        const backgroundHistory = mode === 'fresh'
            ? []
            : await loadRecentHistory(userId, 10).catch(() => [] as ChatMessage[]);
        const messagesWithHistory = mergeConversation(backgroundHistory, messages, mode);
        const hasImages = messagesWithHistory.some(m => Array.isArray(m.content) && m.content.some(b => (b as any).type === 'image'));
        // Если выбран DeepSeek — не переключаемся на Claude при фото:
        // вложения сериализуются как Base64 и DeepSeek сможет загрузить их через tools.
        const preferredProvider = hasImages && config.aiProvider !== 'deepseek' ? 'claude' : undefined;
        const provider = await ProviderFactory.create(preferredProvider);
        const appAccess = await loadUserAppAccess(userId);
        const allowedTools = filterToolsByAccess(tools as ToolDefinition[], appAccess);
        const accessPrompt = buildAppAccessPrompt(appAccess);
        const [factsPrompt, driveFileContext] = await Promise.all([
            loadFactsForPrompt(userId).catch(() => ''),
            buildDriveFileContext(messages, equipmentContext).catch(() => ''),
        ]);
        const documentSessionPrompt = buildDocumentSessionPrompt(userId);
        const promptContext = [accessPrompt, factsPrompt, driveFileContext, documentSessionPrompt]
            .filter(Boolean)
            .join('\n');

        const onEvent = (event: StreamEvent): void => {
            if (event.type === 'text_delta') {
                fullText += event.delta;
            } else if (event.type === 'done') {
                toolsUsedList.push(...(event.toolsUsed || []));
            }
            writeEvent(event);
        };

        await runWithToolContext(
            { userId, equipmentId: equipmentContext?.id, appAccess },
            () => provider.streamChat(
                messagesWithHistory,
                allowedTools,
                userId,
                onEvent,
                equipmentContext,
                waterContext,
                promptContext ? { factsPrompt: promptContext } : undefined,
            ),
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
