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