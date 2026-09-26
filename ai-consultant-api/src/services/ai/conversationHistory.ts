/**
 * conversationHistory.ts
 *
 * Продолжение разговора дописывает сохранённые реплики перед новыми и не повторяет то, что уже есть на экране.
 * Новый разговор сохранённую историю не подмешивает.
 */

import type { ChatMessage } from './types.js';

export type ConversationMode = 'continue' | 'fresh';

function messageKey(message: ChatMessage): string {
    const text = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
    return `${message.role}:${text}`;
}

export function mergeConversation(
    saved: readonly ChatMessage[],
    incoming: readonly ChatMessage[],
    mode: ConversationMode,
): ChatMessage[] {
    if (mode === 'fresh') return [...incoming];
    const seen = new Set(incoming.map(messageKey));
    const older = saved.filter(message => !seen.has(messageKey(message)));
    return [...older, ...incoming];
}
