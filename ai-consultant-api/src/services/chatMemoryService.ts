/**
 * chatMemoryService.ts
 *
 * Сервис памяти агента — сохраняет и загружает историю чата из Supabase.
 *
 * Зачем нужен:
 *   Без этого сервиса каждый новый чат начинается с нуля.
 *   С ним агент помнит прошлые разговоры и может ссылаться на них.
 *
 * Что делает:
 *   1. getOrCreateSession()  — находит текущую сессию пользователя или создаёт новую
 *   2. saveMessages()        — сохраняет пару сообщений (пользователь + агент) в БД
 *   3. loadRecentHistory()   — загружает последние N сообщений для контекста агента
 *
 * Как хранятся фото:
 *   Фотографии НЕ сохраняются в БД (они весят 1-3 MB каждая).
 *   Вместо base64 записывается заглушка "[Фото прикреплено]".
 *   Текстовые ответы агента сохраняются полностью.
 *
 * Схема сессий:
 *   Одна сессия = один непрерывный разговор.
 *   Сессия считается "активной" если последнее сообщение было < 24 часов назад.
 *   Новая сессия создаётся автоматически если прошло > 24 часов.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from '../config/env.js';
import type { ChatMessage } from './ai/types.js';

// ============================================
// Supabase клиент (service_role — обходит RLS)
// ============================================
// service_role key позволяет писать/читать данные любого пользователя.
// Это безопасно т.к. сервис работает только на бэкенде.
const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

// ============================================
// Константы
// ============================================

/** Сколько последних сообщений загружать как контекст для агента */
const HISTORY_LIMIT = 20;

/** Через сколько часов неактивности начинать новую сессию */
const SESSION_TIMEOUT_HOURS = 24;

// ============================================
// Типы
// ============================================

interface ChatSession {
    id: string;
    user_id: string;
    title: string | null;
    equipment_id: string | null;
    created_at: string;
    updated_at: string;
}

interface ChatMessageRow {
    id: string;
    session_id: string;
    user_id: string;
    role: 'user' | 'assistant';
    content: string;
    tools_used: string[] | null;
    created_at: string;
}

// ============================================
// Основные функции
// ============================================

/**
 * Найти активную сессию пользователя или создать новую.
 *
 * Логика:
 *   1. Ищем последнюю сессию пользователя
 *   2. Если updated_at < 24 часов назад — используем её
 *   3. Иначе — создаём новую сессию
 *
 * @param userId       - ID пользователя (UUID из Supabase Auth)
 * @param equipmentId  - ID оборудования если чат открыт из карточки (опционально)
 * @returns            - ID сессии (UUID)
 */
export async function getOrCreateSession(
    userId: string,
    equipmentId?: string
): Promise<string> {
    // Ищем последнюю сессию пользователя
    const { data: sessions } = await supabase
        .from('chat_sessions')
        .select('id, updated_at, equipment_id')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(1);

    if (sessions && sessions.length > 0) {
        const lastSession = sessions[0];
        const lastActivity = new Date(lastSession.updated_at);
        const hoursSince = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60);

        // Сессия ещё активна — продолжаем её
        if (hoursSince < SESSION_TIMEOUT_HOURS) {
            return lastSession.id;
        }
    }

    // Создаём новую сессию
    const { data: newSession, error } = await supabase
        .from('chat_sessions')
        .insert({
            user_id: userId,
            equipment_id: equipmentId || null,
        })
        .select('id')
        .single();

    if (error || !newSession) {
        throw new Error(`Не удалось создать сессию: ${error?.message}`);
    }

    return newSession.id;
}

/**
 * Сохранить пару сообщений (пользователь + ответ агента) в БД.
 *
 * Важно: фотографии (base64) НЕ сохраняются — только текст.
 * Для мультимодальных сообщений извлекаем текст, фото заменяем заглушкой.
 *
 * @param sessionId   - ID сессии
 * @param userId      - ID пользователя
 * @param userMessage - Сообщение пользователя (может содержать фото)
 * @param aiResponse  - Текстовый ответ агента
 * @param toolsUsed   - Список инструментов которые вызывал агент
 */
export async function saveMessages(
    sessionId: string,
    userId: string,
    userMessage: ChatMessage,
    aiResponse: string,
    toolsUsed: string[] = []
): Promise<void> {
    // Извлекаем текст из сообщения пользователя (убираем base64 фото)
    const userContent = extractTextContent(userMessage.content);

    const rows = [
        {
            session_id: sessionId,
            user_id: userId,
            role: 'user' as const,
            content: userContent,
            tools_used: null,
        },
        {
            session_id: sessionId,
            user_id: userId,
            role: 'assistant' as const,
            content: aiResponse,
            tools_used: toolsUsed.length > 0 ? toolsUsed : null,
        },
    ];

    const { error } = await supabase
        .from('chat_messages')
        .insert(rows);

    if (error) {
        // Не бросаем ошибку — сбой сохранения не должен ломать чат
        console.error('Ошибка сохранения сообщений в память:', error.message);
    }
}

/**
 * Загрузить последние N сообщений из БД для контекста агента.
 *
 * Используется при открытии нового чата — агент получает историю
 * прошлых разговоров и может ссылаться на них.
 *
 * @param userId  - ID пользователя
 * @param limit   - Сколько сообщений загрузить (по умолчанию 20)
 * @returns       - Массив сообщений в формате ChatMessage[]
 */
export async function loadRecentHistory(
    userId: string,
    limit: number = HISTORY_LIMIT
): Promise<ChatMessage[]> {
    // Берём последние N сообщений пользователя, сортируем по времени
    const { data: rows, error } = await supabase
        .from('chat_messages')
        .select('role, content, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Ошибка загрузки истории чата:', error.message);
        return [];
    }

    if (!rows || rows.length === 0) return [];

    // Разворачиваем массив — БД вернула от новых к старым, нам нужно наоборот
    return rows
        .reverse()
        .map((row: { role: 'user' | 'assistant'; content: string }) => ({
            role: row.role,
            content: row.content,
        }));
}

/**
 * Обновить заголовок сессии на основе первого сообщения.
 *
 * Вызывается один раз при создании сессии — берём первые 50 символов
 * сообщения пользователя как заголовок (полезно для будущей истории чатов).
 *
 * @param sessionId - ID сессии
 * @param firstMessage - Первое сообщение пользователя
 */
export async function updateSessionTitle(
    sessionId: string,
    firstMessage: string
): Promise<void> {
    const title = firstMessage.slice(0, 50) + (firstMessage.length > 50 ? '...' : '');

    await supabase
        .from('chat_sessions')
        .update({ title })
        .eq('id', sessionId)
        .is('title', null); // Обновляем только если заголовок ещё не задан
}

// ============================================
// Вспомогательные функции
// ============================================

/**
 * Извлечь текстовое содержимое из сообщения.
 *
 * Обрабатывает два формата:
 *   1. Простая строка → возвращаем как есть
 *   2. Массив блоков → берём текстовые блоки, фото заменяем заглушкой
 *
 * Пример мультимодального сообщения:
 *   [{ type: 'text', text: 'Что на фото?' }, { type: 'image', source: {...} }]
 * Результат:
 *   'Что на фото? [Фото прикреплено]'
 */
function extractTextContent(
    content: ChatMessage['content']
): string {
    // Простой текст — возвращаем как есть
    if (typeof content === 'string') return content;

    // Мультимодальное сообщение — обрабатываем блоки
    return content
        .map(block => {
            if (block.type === 'text') return block.text;
            if (block.type === 'image') return '[Фото прикреплено]';
            return '';
        })
        .filter(Boolean)
        .join(' ');
}
