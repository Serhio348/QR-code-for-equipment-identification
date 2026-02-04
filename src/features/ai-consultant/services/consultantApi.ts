import { supabase } from '../../../shared/config/supabase';

// URL API (из переменных окружения)
const API_URL = import.meta.env.VITE_AI_CONSULTANT_API_URL || '';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  success: boolean;
  data?: {
    message: string;
    toolsUsed?: string[];
  };
  error?: string;
}

/**
 * Отправить сообщение в AI-консультант
 */
export async function sendChatMessage(
  messages: ChatMessage[],
  signal?: AbortSignal
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
    body: JSON.stringify({ messages }),
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  return await response.json();
}