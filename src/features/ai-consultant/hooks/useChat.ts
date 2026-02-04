/**
 * useChat.ts
 *
 * React-хук для управления состоянием чата с AI-консультантом.
 *
 * Возможности:
 * - Хранение истории сообщений с уникальными ID и timestamp
 * - Оптимистичное обновление UI (сообщение появляется до ответа сервера)
 * - Отмена запросов при размонтировании (AbortController)
 * - Retry механизм для неудачных запросов
 * - Ограничение длины истории при отправке на сервер (экономия токенов)
 * - Debug-логирование (длительность, использованные tools)
 *
 * Поток данных:
 * ┌──────────────┐    sendMessage(text)    ┌──────────────────┐
 * │  ChatInput   │ ──────────────────────▶ │    useChat()     │
 * │  (компонент) │                         │                  │
 * └──────────────┘                         │  1. Создать msg  │
 *                                          │     с id + ts    │
 * ┌──────────────┐    messages, isLoading   │  2. POST /api/   │
 * │  ChatWidget  │ ◀────────────────────── │     chat         │
 * │  (компонент) │                         │  3. Добавить     │
 * └──────────────┘                         │     ответ Claude │
 *                                          └────────┬─────────┘
 *                                                   │
 *                                          ┌────────▼─────────┐
 *                                          │ consultantApi.ts  │
 *                                          │ sendChatMessage() │
 *                                          └──────────────────┘
 */

// ============================================
// Импорты
// ============================================

import { useState, useCallback, useEffect, useRef } from 'react';
import { ChatMessage, sendChatMessage } from '../services/consultantApi';

// ============================================
// Константы
// ============================================

// Максимальное количество сообщений, отправляемых на сервер.
// Ограничивает расход токенов Claude API.
// В UI пользователь видит всю историю, но на сервер уходят только последние N
const MAX_HISTORY_FOR_API = 50;

// ============================================
// Типы
// ============================================

/**
 * Расширенное сообщение с уникальным ID и временной меткой.
 * Наследует ChatMessage (role, content) и добавляет:
 * - id — для корректного React key (избегаем key={content})
 * - timestamp — время создания сообщения
 */
export interface ChatMessageWithMeta extends ChatMessage {
  id: string;
  timestamp: number;
}

/**
 * Возвращаемый интерфейс хука useChat.
 */
export interface UseChatReturn {
  /** Массив сообщений с ID и timestamp */
  messages: ChatMessageWithMeta[];
  /** true пока ждём ответ от сервера */
  isLoading: boolean;
  /** Текст ошибки или null */
  error: string | null;
  /** true если есть неудачное сообщение, которое можно повторить */
  canRetry: boolean;
  /** Отправить новое сообщение */
  sendMessage: (text: string) => Promise<void>;
  /** Повторить последнее неудачное сообщение */
  retryLastMessage: () => Promise<void>;
  /** Очистить историю чата */
  clearMessages: () => void;
  /** Сбросить ошибку */
  clearError: () => void;
}

// ============================================
// Утилиты
// ============================================

/**
 * Генерация уникального ID для сообщения.
 * Формат: timestamp-random (например: "1706000000000-k7x2m9q3f")
 */
const generateId = (): string =>
  `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

/**
 * Создание сообщения с метаданными.
 */
const createMessage = (role: ChatMessage['role'], content: string): ChatMessageWithMeta => ({
  id: generateId(),
  role,
  content,
  timestamp: Date.now(),
});

// ============================================
// Хук useChat
// ============================================

/**
 * Хук для управления чатом с AI-консультантом.
 *
 * @example
 * const { messages, isLoading, error, canRetry, sendMessage, retryLastMessage } = useChat();
 */
export function useChat(): UseChatReturn {
  // --- Состояние ---
  const [messages, setMessages] = useState<ChatMessageWithMeta[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Последнее неудачное сообщение — для retry механизма.
  // Хранит текст и историю на момент отправки
  const [lastFailed, setLastFailed] = useState<{
    text: string;
    messagesSnapshot: ChatMessage[];
  } | null>(null);

  // --- AbortController ---
  // useRef вместо useState — не нужен ре-рендер при смене контроллера.
  // Хранит текущий AbortController для отмены запроса при размонтировании
  const abortControllerRef = useRef<AbortController | null>(null);

  // Отмена текущего запроса при размонтировании компонента.
  // Предотвращает setState на размонтированном компоненте
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // --- Утилита: обрезка истории для API ---
  // Пользователь видит все сообщения, но на сервер уходят только последние N.
  // Экономит токены Claude API
  const trimForApi = useCallback((msgs: ChatMessageWithMeta[]): ChatMessage[] => {
    const trimmed = msgs.slice(-MAX_HISTORY_FOR_API);
    // Убираем метаданные (id, timestamp) — серверу они не нужны
    return trimmed.map(({ role, content }) => ({ role, content }));
  }, []);

  /**
   * Отправить сообщение в чат.
   *
   * Алгоритм:
   * 1. Валидация (пустые, повторные)
   * 2. Создать AbortController для возможности отмены
   * 3. Оптимистичное обновление UI
   * 4. Обрезать историю до MAX_HISTORY_FOR_API
   * 5. Отправить на сервер
   * 6. Успех → добавить ответ / Ошибка → откат + сохранить для retry
   */
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    // Сбрасываем ошибку и retry
    setError(null);
    setLastFailed(null);
    setIsLoading(true);

    // Создаём AbortController для этого запроса.
    // Отменяем предыдущий, если он ещё активен
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Оптимистичное обновление
    const userMessage = createMessage('user', text.trim());
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);

    // Debug: засекаем время начала запроса
    const startTime = Date.now();

    try {
      // Обрезаем историю перед отправкой на сервер
      const apiMessages = trimForApi(newMessages);
      const response = await sendChatMessage(apiMessages, controller.signal);
      const duration = Date.now() - startTime;

      if (response.success && response.data) {
        // Debug-лог успешного запроса
        console.debug('[Chat]', {
          duration: `${duration}ms`,
          toolsUsed: response.data.toolsUsed,
          responseLength: response.data.message.length,
        });

        const assistantMessage = createMessage('assistant', response.data.message);
        setMessages([...newMessages, assistantMessage]);
      } else {
        setError(response.error || 'Неизвестная ошибка');
        setLastFailed({ text, messagesSnapshot: apiMessages });
      }
    } catch (err) {
      // AbortError — запрос отменён при размонтировании, не показываем ошибку
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }

      const duration = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : 'Ошибка отправки';

      console.debug('[Chat] Error:', { duration: `${duration}ms`, error: errorMessage });

      setError(errorMessage);
      // Сохраняем для retry
      setLastFailed({ text, messagesSnapshot: trimForApi(newMessages) });
      // Откатываем оптимистичное обновление
      setMessages(messages);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [messages, isLoading, trimForApi]);

  /**
   * Повторить последнее неудачное сообщение.
   * Использует сохранённый снимок истории — не дублирует сообщение пользователя
   */
  const retryLastMessage = useCallback(async () => {
    if (!lastFailed || isLoading) return;

    setError(null);
    setIsLoading(true);

    // Создаём AbortController для retry запроса
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Восстанавливаем сообщение пользователя в UI (если было откачено)
    const userMessage = createMessage('user', lastFailed.text);
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);

    const startTime = Date.now();

    try {
      const response = await sendChatMessage(
        lastFailed.messagesSnapshot,
        controller.signal
      );
      const duration = Date.now() - startTime;

      if (response.success && response.data) {
        console.debug('[Chat] Retry succeeded:', { duration: `${duration}ms` });

        const assistantMessage = createMessage('assistant', response.data.message);
        setMessages([...newMessages, assistantMessage]);
        setLastFailed(null);
      } else {
        setError(response.error || 'Не удалось повторить запрос');
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;

      setError(err instanceof Error ? err.message : 'Ошибка отправки');
      setMessages(messages);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [lastFailed, messages, isLoading]);

  /**
   * Очистить историю чата.
   */
  const clearMessages = useCallback(() => {
    abortControllerRef.current?.abort();
    setMessages([]);
    setError(null);
    setLastFailed(null);
  }, []);

  /**
   * Сбросить ошибку без очистки истории.
   */
  const clearError = useCallback(() => setError(null), []);

  // ============================================
  // Возвращаемый интерфейс
  // ============================================

  return {
    messages,
    isLoading,
    error,
    canRetry: lastFailed !== null,
    sendMessage,
    retryLastMessage,
    clearMessages,
    clearError,
  };
}
