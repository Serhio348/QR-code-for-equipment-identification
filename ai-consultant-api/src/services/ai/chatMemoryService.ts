/**
 * chatMemoryService.ts
 *
 * Сервис памяти агента - сохраняет и загружает историю чата из Supabase.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from '../../config/env.js';
import type { ChatMessage } from './types.js';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);
const HISTORY_LIMIT = 20;
const SESSION_TIMEOUT_HOURS = 24;

export async function getOrCreateSession(userId: string, equipmentId?: string): Promise<string> {
    const { data: sessions } = await supabase
        .from('chat_sessions')
        .select('id, updated_at, equipment_id')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(1);
    if (sessions && sessions.length > 0) {
        const lastActivity = new Date(sessions[0].updated_at);
        const hoursSince = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60);
        if (hoursSince < SESSION_TIMEOUT_HOURS) return sessions[0].id;
    }
    const { data: newSession, error } = await supabase
        .from('chat_sessions')
        .insert({ user_id: userId, equipment_id: equipmentId || null })
        .select('id')
        .single();
    if (error || !newSession) throw new Error(`Не удалось создать сессию: ${error?.message}`);
    return newSession.id;
}

export async function saveMessages(
    sessionId: string,
    userId: string,
    userMessage: ChatMessage,
    aiResponse: string,
    toolsUsed: string[] = []
): Promise<void> {
    const userContent = extractTextContent(userMessage.content);
    const rows = [
        { session_id: sessionId, user_id: userId, role: 'user' as const, content: userContent, tools_used: null },
        { session_id: sessionId, user_id: userId, role: 'assistant' as const, content: aiResponse, tools_used: toolsUsed.length > 0 ? toolsUsed : null },
    ];
    const { error } = await supabase.from('chat_messages').insert(rows);
    if (error) console.error('Ошибка сохранения сообщений в память:', error.message);
}

export async function loadRecentHistory(userId: string, limit: number = HISTORY_LIMIT): Promise<ChatMessage[]> {
    const { data: rows, error } = await supabase
        .from('chat_messages')
        .select('role, content, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error || !rows || rows.length === 0) return [];
    return rows.reverse().map((row: { role: 'user' | 'assistant'; content: string }) => ({
        role: row.role,
        content: row.content,
    }));
}

export async function updateSessionTitle(sessionId: string, firstMessage: string): Promise<void> {
    const title = firstMessage.slice(0, 50) + (firstMessage.length > 50 ? '...' : '');
    await supabase.from('chat_sessions').update({ title }).eq('id', sessionId).is('title', null);
}

function extractTextContent(content: ChatMessage['content']): string {
    if (typeof content === 'string') return content;
    return content
        .map(block => {
            if (block.type === 'text') return block.text;
            if (block.type === 'image') return '[Фото прикреплено]';
            return '';
        })
        .filter(Boolean)
        .join(' ');
}
