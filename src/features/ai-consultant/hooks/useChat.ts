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
import {
  ChatMessage,
  streamChatMessage,
  uploadPhotoToDriveFolder,
  TextContentBlock,
  ImageContentBlock,
  EquipmentContext,
  WaterDashboardContext,
} from '../services/consultantApi';
import type { ChatInputMessage } from '../components/ChatInput';
import { historyForApi } from '../services/chatHistoryPayload';
import { photoUploadKey, planFolderUpload, uploadNewPhotos } from '../services/photoUploadIntent';
import { logUserActivity } from '../../user-activity/services/activityLogsApi';

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
  /** Название текущего инструмента или null */
  activeToolName: string | null;
  /** Отправить новое сообщение (с текстом и/или фото) */
  sendMessage: (message: ChatInputMessage) => Promise<void>;
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
 * Преобразует ChatInputMessage (с фото) в формат Anthropic API.
 * Создает мультимодальный content: [текст, изображение1, изображение2, ...]
 */
const createMultimodalContent = (
  message: ChatInputMessage
): string | Array<TextContentBlock | ImageContentBlock> => {
  // Если нет фото — возвращаем простой текст
  if (!message.photos || message.photos.length === 0) {
    return message.text;
  }

  // Если есть фото — создаём массив content блоков
  const content: Array<TextContentBlock | ImageContentBlock> = [];

  // Добавляем текстовый блок (даже если текст пустой)
  if (message.text) {
    content.push({
      type: 'text',
      text: message.text,
    });
  }

  // Добавляем каждое фото как image блок
  message.photos.forEach(photo => {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: photo.mimeType,
        data: photo.data,
      },
    });
  });

  return content;
};

function fileUrlFromUpload(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as { fileUrl?: unknown; file_url?: unknown };
  const url = record.fileUrl ?? record.file_url;
  return typeof url === 'string' && url.startsWith('http') ? url : null;
}

/**
 * Создание сообщения с метаданными.
 */
const createMessage = (
  role: ChatMessage['role'],
  content: string | Array<TextContentBlock | ImageContentBlock>
): ChatMessageWithMeta => ({
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
 * @param equipmentContext - Контекст оборудования для поиска в конкретной папке
 * @example
 * const { messages, isLoading, error, canRetry, sendMessage, retryLastMessage } = useChat(equipmentContext);
 */
export function useChat(equipmentContext?: EquipmentContext | null, waterContext?: WaterDashboardContext | null): UseChatReturn {
  // --- Состояние ---
  const [messages, setMessages] = useState<ChatMessageWithMeta[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeToolName, setActiveToolName] = useState<string | null>(null);

  // Последнее неудачное сообщение — для retry механизма.
  const [lastFailed, setLastFailed] = useState<{
    message: ChatInputMessage;
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
    return historyForApi(
      msgs.map(({ role, content }) => ({ role, content })),
      MAX_HISTORY_FOR_API,
    );
  }, []);

  /**
   * Отправить сообщение в чат.
   *
   * Алгоритм:
   * 1. Валидация (пустые, повторные)
   * 2. Создать AbortController для возможности отмены
   * 3. Преобразовать сообщение с фото в мультимодальный формат
   * 4. Оптимистичное обновление UI
   * 5. Обрезать историю до MAX_HISTORY_FOR_API
   * 6. Отправить на сервер
   * 7. Успех → добавить ответ / Ошибка → откат + сохранить для retry
   */
  const sendMessage = useCallback(async (inputMessage: ChatInputMessage) => {
    // Валидация: нужен хотя бы текст или фото
    if ((!inputMessage.text.trim() && !inputMessage.photos?.length) || isLoading) {
      return;
    }

    // Сбрасываем ошибку и retry
    setError(null);
    setLastFailed(null);
    setIsLoading(true);

    // Создаём AbortController для этого запроса.
    // Отменяем предыдущий, если он ещё активен
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const uploadPlan = planFolderUpload({
      uploadConfirmed: inputMessage.uploadConfirmed === true,
      folderUrl: inputMessage.folderUrl,
      photoCount: inputMessage.photos?.length ?? 0,
    });
    if (uploadPlan.action === 'need-folder') {
      setError('Сначала выберите оборудование с папкой на Диске');
      setIsLoading(false);
      abortControllerRef.current = null;
      return;
    }
    if (uploadPlan.action === 'upload') {
      const photos = (inputMessage.photos ?? []).flatMap(photo => (
        photo.file ? [{ fileName: photo.fileName, size: photo.file.size, file: photo.file }] : []
      ));
      if (!inputMessage.alreadyUploaded?.length) {
        setMessages([...messages, createMessage('user', inputMessage.text || 'Запись фото в папку')]);
      }
      const batch = await uploadNewPhotos(photos, new Set(inputMessage.alreadyUploaded ?? []), async (photo) => {
        const response = await uploadPhotoToDriveFolder(
          uploadPlan.folderUrl,
          photo.file,
          { name: photo.fileName, description: inputMessage.text },
          controller.signal,
        );
        const fileUrl = fileUrlFromUpload(response.data);
        if (!fileUrl) throw new Error('Сервер не вернул ссылку на файл');
        return fileUrl;
      });
      const uploadedKeys = [
        ...(inputMessage.alreadyUploaded ?? []),
        ...batch.uploaded.map(item => photoUploadKey(item.photo)),
      ];
      if (batch.failed.length > 0) {
        const failedNames = batch.failed.map(photo => photo.fileName).join(', ');
        setError(`Часть фото уже в папке. Не записались: ${failedNames}. Повтор не отправит записанные файлы ещё раз.`);
        setLastFailed({
          message: { ...inputMessage, alreadyUploaded: uploadedKeys },
          messagesSnapshot: [],
        });
        setIsLoading(false);
        abortControllerRef.current = null;
        return;
      }
      const links = batch.uploaded.map(item => `- ${item.url}`).join('\n');
      setMessages(prev => [...prev, createMessage('assistant', `Фото записаны в папку:\n${uploadPlan.folderUrl}\n${links}`)]);
      setIsLoading(false);
      abortControllerRef.current = null;
      return;
    }

    let messageForAi: ChatInputMessage = inputMessage;

    const content = createMultimodalContent(messageForAi);

    // Оптимистичное обновление
    const userMessage2 = createMessage('user', content);
    const newMessages2 = [...messages, userMessage2];
    setMessages(newMessages2);

    // Debug: засекаем время начала запроса
    const startTime = Date.now();

    try {
      const apiMessages = trimForApi(newMessages2);

      // Создаём плейсхолдер для стримингового сообщения
      const streamingId = generateId();
      const streamingMsg: ChatMessageWithMeta = createMessage('assistant', '');
      streamingMsg.id = streamingId;
      setMessages([...newMessages2, streamingMsg]);

      let accText = '';
      let toolsUsed: string[] = [];

      for await (const event of streamChatMessage(
        apiMessages,
        controller.signal,
        equipmentContext || undefined,
        waterContext || undefined,
      )) {
        if (event.type === 'tool_call') {
          setActiveToolName(event.name);
        } else if (event.type === 'text_delta') {
          setActiveToolName(null);
          accText += event.delta;
          // Обновляем сообщение по мере прихода текста
          setMessages(prev => prev.map(m =>
            m.id === streamingId ? { ...m, content: accText } : m
          ));
        } else if (event.type === 'done') {
          toolsUsed = event.toolsUsed || [];
          setActiveToolName(null);
        } else if (event.type === 'error') {
          throw new Error(event.message);
        }
      }

      const duration = Date.now() - startTime;
      console.debug('[Chat stream]', {
        duration: `${duration}ms`,
        toolsUsed,
        responseLength: accText.length,
        hasContext: !!equipmentContext,
      });

      const messagePreview = typeof content === 'string'
        ? content.substring(0, 100)
        : 'Сообщение с изображением';
      logUserActivity(
        'chat_message',
        equipmentContext
          ? `Отправлено сообщение в AI-консультант (контекст: ${equipmentContext.name}): "${messagePreview}"`
          : `Отправлено сообщение в AI-консультант: "${messagePreview}"`,
        {
          entityType: 'chat',
          entityId: equipmentContext?.id,
          metadata: {
            hasPhotos: !!inputMessage.photos?.length,
            photoCount: inputMessage.photos?.length || 0,
            toolsUsed,
            duration,
            hasContext: !!equipmentContext,
            equipmentName: equipmentContext?.name,
            equipmentType: equipmentContext?.type,
          },
        }
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }

      const duration = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : 'Ошибка отправки';
      console.debug('[Chat] Error:', { duration: `${duration}ms`, error: errorMessage });

      setActiveToolName(null);
      setError(errorMessage);
      setLastFailed({ message: messageForAi, messagesSnapshot: trimForApi(newMessages2) });
      setMessages(messages);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [messages, isLoading, trimForApi, equipmentContext, waterContext]);

  /**
   * Повторить последнее неудачное сообщение.
   * Использует сохранённый снимок истории — не дублирует сообщение пользователя
   */
  const retryLastMessage = useCallback(async () => {
    if (!lastFailed || isLoading) return;
    if (lastFailed.message.uploadConfirmed) {
      const message = lastFailed.message;
      setLastFailed(null);
      await sendMessage(message);
      return;
    }

    setError(null);
    setIsLoading(true);

    // Создаём AbortController для retry запроса
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Преобразуем входное сообщение в формат Anthropic API
    const content = createMultimodalContent(lastFailed.message);

    // Восстанавливаем сообщение пользователя в UI (если было откачено)
    const userMessage = createMessage('user', content);
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);

    const startTime = Date.now();

    try {
      const streamingId = generateId();
      const streamingMsg = { ...createMessage('assistant', ''), id: streamingId };
      setMessages([...newMessages, streamingMsg]);

      let accText = '';

      for await (const event of streamChatMessage(
        lastFailed.messagesSnapshot,
        controller.signal,
        equipmentContext || undefined,
        waterContext || undefined,
      )) {
        if (event.type === 'tool_call') {
          setActiveToolName(event.name);
        } else if (event.type === 'text_delta') {
          setActiveToolName(null);
          accText += event.delta;
          setMessages(prev => prev.map(m =>
            m.id === streamingId ? { ...m, content: accText } : m
          ));
        } else if (event.type === 'done') {
          setActiveToolName(null);
          setLastFailed(null);
        } else if (event.type === 'error') {
          throw new Error(event.message);
        }
      }

      console.debug('[Chat] Retry succeeded:', { duration: `${Date.now() - startTime}ms` });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;

      setActiveToolName(null);
      setError(err instanceof Error ? err.message : 'Ошибка отправки');
      setMessages(messages);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [lastFailed, messages, isLoading, equipmentContext, waterContext, sendMessage]);

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
    activeToolName,
    sendMessage,
    retryLastMessage,
    clearMessages,
    clearError,
  };
}
