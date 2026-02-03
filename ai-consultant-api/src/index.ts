import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config, validateConfig } from './config/env.js';
import { authMiddleware, AuthenticatedRequest } from './middleware/auth.js';
import { processChatMessage } from './services/anthropic.js';
import { validateToolRegistration } from './tools/index.js';

// Проверка обязательных переменных окружения
validateConfig();

// Проверка что все tools корректно зарегистрированы
validateToolRegistration();

const app = express();

// Middleware
app.use(helmet());
app.use(cors({
    origin: config.allowedOrigins,
    credentials: config.corsCredentials,
}));
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Chat endpoint
app.post('/api/chat', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
        const { messages } = req.body;

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            res.status(400).json({ error: 'Массив messages обязателен' });
            return;
        }

        const response = await processChatMessage({
            messages,
            userId: req.user!.id,
        });

        res.json(response);
    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Внутренняя ошибка сервера',
        });
    }
});

// Запуск сервера
app.listen(config.port, () => {
    console.log(`AI Consultant API running on port ${config.port}`);
    console.log(`Environment: ${config.nodeEnv}`);
});
