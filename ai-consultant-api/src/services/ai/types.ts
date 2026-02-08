/**
 * Общие типы для всех AI провайдеров
 */

// Блок текста в мультимодальном сообщении
export interface TextContentBlock {
  type: 'text';
  text: string;
}

// Блок изображения в мультимодальном сообщении
export interface ImageContentBlock {
  type: 'image';
  source: {
    type: 'base64';
    media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
    data: string; // Base64 без префикса
  };
}

// Сообщение в чате
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string | Array<TextContentBlock | ImageContentBlock>;
}

// Запрос к AI
export interface ChatRequest {
  messages: ChatMessage[];
  userId: string;
}

// Ответ от AI
export interface ChatResponse {
  message: string;
  toolsUsed?: string[];
  provider?: string; // Какой провайдер использовался
  tokensUsed?: {     // Статистика токенов
    input: number;
    output: number;
  };
}

// Определение tool (инструмента)
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

// Вызов tool от AI
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

// Результат выполнения tool
export interface ToolResult {
  id: string;
  result: unknown;
  isError?: boolean;
}
