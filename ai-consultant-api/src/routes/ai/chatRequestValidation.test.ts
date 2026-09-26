import { describe, expect, it } from 'vitest';
import { validateChatMessages } from './chatRequestValidation.js';

describe('validateChatMessages', () => {
    it('accepts a text message and an image block', () => {
        expect(validateChatMessages([
            { role: 'user', content: 'привет' },
            {
                role: 'user',
                content: [{
                    type: 'image',
                    source: { type: 'base64', media_type: 'image/jpeg', data: 'abc' },
                }],
            },
        ])).toBeNull();
    });

    it('rejects a bad role, a broken block, and an empty list', () => {
        expect(validateChatMessages([])).toBe('Messages array is required');
        expect(validateChatMessages([{ role: 'system', content: 'x' }])).toBe('Invalid message role');
        expect(validateChatMessages([{ role: 'user', content: [{ type: 'image', source: {} }] }])).toBe('Invalid image block');
    });
});
