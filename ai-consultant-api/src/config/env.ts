import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Сервер
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Anthropic Claude API
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  claudeModel: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',

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
  gasApiTimeout: parseInt(process.env.GAS_API_TIMEOUT || '10000', 10),

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
    'anthropicApiKey',
    'supabaseUrl',
    'supabaseServiceKey',
    'gasApiUrl',
  ];

  const missing = required.filter(key => !config[key as keyof typeof config]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}