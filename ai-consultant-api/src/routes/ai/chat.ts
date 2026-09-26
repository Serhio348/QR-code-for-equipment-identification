/**
 * chat.ts
 *
 * Маршрут (route) для чат-эндпоинта AI-консультанта.
 */
import { Router, Response } from 'express';
import { type ChatMessage, type ToolDefinition, type EquipmentContext, type WaterDashboardContext } from '../../services/ai/index.js';
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
import { buildDriveFileContext } from '../../services/ai/driveFileContextService.js';
import { buildDocumentSessionPrompt } from '../../services/ai/documentSessionService.js';
import { loadUserAppAccess } from '../../services/ai/userAppAccessService.js';
import { filterToolsByAccess, buildAppAccessPrompt } from '../../services/ai/toolAccessPolicy.js';
import { runWithToolContext } from '../../services/ai/toolContext.js';
import { mergeConversation, type ConversationMode } from '../../services/ai/conversationHistory.js';
import { validateChatMessages } from './chatRequestValidation.js';
import { config } from '../../config/env.js';
import { createFallbackProviders, runWithProviderFallback } from '../../services/ai/providerFallback.js';

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

interface ChatRequestBody {
    messages: ChatMessage[];
    equipmentContext?: EquipmentContext;
    waterContext?: WaterDashboardContext;
    conversation?: ConversationMode;
}

router.post('/', chatRateLimit, authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { messages, equipmentContext, waterContext, conversation } = req.body as ChatRequestBody;

        const invalid = validateChatMessages(messages);
        if (invalid) {
            res.status(400).json({ error: invalid });
            return;
        }

        const userId = req.user?.id || '';
        const mode: ConversationMode = conversation === 'fresh' ? 'fresh' : 'continue';
        const backgroundHistory = mode === 'fresh'
            ? []
            : await loadRecentHistory(userId, 10).catch(() => [] as ChatMessage[]);
        const messagesWithHistory = mergeConversation(backgroundHistory, messages, mode);

        const hasImages = messagesWithHistory.some(m => Array.isArray(m.content) && m.content.some(b => (b as any).type === 'image'));
        // Если пользователь работает только с DeepSeek — НЕ форсим Claude на фото.
        // DeepSeek не анализирует изображения, но мы сериализуем вложения как Base64 в тексте,
        // чтобы он мог загрузить их через tools.
        const preferredProvider = hasImages && config.aiProvider !== 'deepseek' ? 'claude' : undefined;
        const providers = createFallbackProviders(preferredProvider);
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

        const response = await runWithProviderFallback(providers, (provider, markOutputStarted) => (
            runWithToolContext(
                {
                    userId,
                    equipmentId: equipmentContext?.id,
                    appAccess,
                    lockProviderFallback: markOutputStarted,
                },
                () => provider.chat(
                    messagesWithHistory,
                    allowedTools,
                    userId,
                    equipmentContext,
                    waterContext,
                    promptContext ? { factsPrompt: promptContext } : undefined
                ),
            )
        ));

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

router.get('/history', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.id || '';
    const messages = userId ? await loadRecentHistory(userId, 20).catch(() => []) : [];
    res.json({
        success: true,
        data: { messages },
    });
});

export default router;
