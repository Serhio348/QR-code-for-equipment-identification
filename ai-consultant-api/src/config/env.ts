import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Сервер
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // AI Provider Configuration
  aiProvider: process.env.AI_PROVIDER || 'gemini', // 'claude' | 'gemini' | 'openai'

  // Anthropic Claude API
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  claudeModel: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',

  // Google Gemini API
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',

  // Supabase (для проверки токенов)
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY || '',

  // GAS API (для работы с оборудованием)
  gasApiUrl: process.env.GAS_API_URL || '',


  // CORS
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(','),

  // Rate limiting
  rateLimitWindowMs: 60 * 1000, // 1 минута
  rateLimitMaxRequests: 30, // 30 запросов в минуту
  
  // Таймауты API
  apiTimeout: parseInt(process.env.API_TIMEOUT || '30000', 10),
  gasApiTimeout: parseInt(process.env.GAS_API_TIMEOUT || '30000', 10),

  // Retry при 5xx ошибках GAS (exponential backoff)
  gasApiRetryCount: parseInt(process.env.GAS_API_RETRY_COUNT || '3', 10),

  // Кэширование
  cacheTTL: parseInt(process.env.CACHE_TTL || '300', 10),
  
  // Безопасность
  corsCredentials: process.env.CORS_CREDENTIALS === 'true',
  sessionSecret: process.env.SESSION_SECRET || 'default-secret-change-in-prod',

  // Безопасность циклов
  maxAgentIterations: parseInt(process.env.MAX_AGENT_ITERATIONS || '15', 15),
};

// Проверка обязательных переменных
export function validateConfig(): void {
  const required = [
    'supabaseUrl',
    'supabaseServiceKey',
    'gasApiUrl',
  ];

  const missing = required.filter(key => !config[key as keyof typeof config]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Проверка наличия хотя бы одного AI провайдера
  const hasAnyProvider = config.anthropicApiKey || config.geminiApiKey;
  if (!hasAnyProvider) {
    throw new Error('At least one AI provider API key must be configured (ANTHROPIC_API_KEY or GEMINI_API_KEY)');
  }
}