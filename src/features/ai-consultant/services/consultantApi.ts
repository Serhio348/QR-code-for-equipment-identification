import { supabase } from '../../../shared/config/supabase';

// URL API (из переменных окружения)
const API_URL = import.meta.env.VITE_AI_CONSULTANT_API_URL || '';

/**
 * Блок текста в мультимодальном сообщении.
 */
export interface TextContentBlock {
  type: 'text';
  text: string;
}

/**
 * Блок изображения в мультимодальном сообщении.
 */
export interface ImageContentBlock {
  type: 'image';
  source: {
    type: 'base64';
    media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
    data: string;
  };
}

/**
 * Сообщение в чате.
 * Поддерживает простой текст или мультимодальный контент (текст + изображения).
 */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string | Array<TextContentBlock | ImageContentBlock>;
}

/**
 * Контекст оборудования для AI-консультанта.
 * Позволяет AI искать файлы только в папке конкретного оборудования.
 */
export interface EquipmentContext {
  id: string;
  name: string;
  type: string;
  googleDriveUrl?: string;
}

/**
 * Контекст дашборда воды — текущие KPI, передаётся в системный промпт AI.
 */
export interface WaterDashboardContext {
  monthLabel: string;
  sourceMonth: number;
  productionMonth: number;
  domesticMonth: number;
  lossesMonth: number;
  lossesPct: number;
  filterLoss: number;
  osmosisLoss: number;
  activeAlerts: number;
}

export interface ChatResponse {
  success: boolean;
  data?: {
    message: string;
    toolsUsed?: string[];
  };
  error?: string;
}

export interface HistoryResponse {
  success: boolean;
  data?: {
    messages: ChatMessage[];
  };
  error?: string;
}

/**
 * Отправить сообщение в AI-консультант
 * @param messages - История сообщений
 * @param signal - AbortSignal для отмены запроса
 * @param equipmentContext - Контекст оборудования (для поиска в конкретной папке)
 */
export async function sendChatMessage(
  messages: ChatMessage[],
  signal?: AbortSignal,
  equipmentContext?: EquipmentContext,
  waterContext?: WaterDashboardContext
): Promise<ChatResponse> {
  // Получаем текущий токен сессии
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Не авторизован');
  }

  const response = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      messages,
      equipmentContext,
      waterContext,
    }),
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  return await response.json();
}

// ============================================
// Стриминг
// ============================================

export type StreamEvent =
  | { type: 'tool_call'; name: string }
  | { type: 'text_delta'; delta: string }
  | { type: 'done'; toolsUsed: string[]; provider?: string }
  | { type: 'error'; message: string };

/**
 * Стриминг ответа AI через SSE.
 * Возвращает AsyncGenerator событий: tool_call, text_delta, done, error.
 */
export async function* streamChatMessage(
  messages: ChatMessage[],
  signal?: AbortSignal,
  equipmentContext?: EquipmentContext,
  waterContext?: WaterDashboardContext,
): AsyncGenerator<StreamEvent> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Не авторизован');

  const response = await fetch(`${API_URL}/api/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ messages, equipmentContext, waterContext }),
    signal,
  });

  if (!response.ok || !response.body) {
    const errData = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(errData.error || `HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';

    for (const part of parts) {
      const line = part.trim();
      if (line.startsWith('data: ')) {
        try {
          yield JSON.parse(line.slice(6)) as StreamEvent;
        } catch {
          // пропускаем невалидный JSON
        }
      }
    }
  }
}

/**
 * Загрузить историю чата из прошлых сессий.
 * Вызывается при открытии чата — показывает прошлые сообщения.
 *
 * @param limit - сколько сообщений загрузить (по умолчанию 20)
 */
export async function fetchChatHistory(limit = 20): Promise<ChatMessage[]> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) return [];

  const response = await fetch(`${API_URL}/api/chat/history?limit=${limit}`, {
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
    },
  });

  if (!response.ok) return [];

  const data: HistoryResponse = await response.json();
  return data.data?.messages || [];
}