/**
 * chatRequestValidation.ts
 *
 * Одинаковая проверка тела /api/chat и /api/chat/stream до начала ответа.
 */

const MAX_MESSAGES = 50;
const MAX_MESSAGE_LENGTH = 32_000;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

export function validateChatMessages(messages: unknown): string | null {
    if (!Array.isArray(messages) || messages.length === 0) return 'Messages array is required';
    if (messages.length > MAX_MESSAGES) return `Too many messages: max ${MAX_MESSAGES} allowed`;

    for (const message of messages) {
        if (!message || typeof message !== 'object') return 'Invalid message format';
        const record = message as { role?: unknown; content?: unknown };
        if (record.role !== 'user' && record.role !== 'assistant') return 'Invalid message role';
        const contentError = validateContent(record.content);
        if (contentError) return contentError;
    }
    return null;
}

function validateContent(content: unknown): string | null {
    if (typeof content === 'string') {
        if (content.length > MAX_MESSAGE_LENGTH) return `Message too long: max ${MAX_MESSAGE_LENGTH} characters`;
        return null;
    }
    if (!Array.isArray(content) || content.length === 0) return 'Invalid content type';
    for (const block of content) {
        if (!block || typeof block !== 'object') return 'Invalid content block';
        const item = block as {
            type?: unknown;
            text?: unknown;
            source?: { type?: unknown; media_type?: unknown; data?: unknown };
        };
        if (item.type === 'text') {
            if (typeof item.text !== 'string') return 'Invalid text block';
            continue;
        }
        if (item.type === 'image') {
            const source = item.source;
            if (!source || source.type !== 'base64' || typeof source.data !== 'string' || typeof source.media_type !== 'string') {
                return 'Invalid image block';
            }
            if (!IMAGE_TYPES.has(source.media_type)) return 'Invalid image block';
            continue;
        }
        return 'Invalid content block';
    }
    return null;
}
