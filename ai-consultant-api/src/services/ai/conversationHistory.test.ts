import { describe, expect, it } from 'vitest';
import { mergeConversation } from './conversationHistory.js';

const saved = [
    { role: 'user' as const, content: 'Как зовут насос?' },
    { role: 'assistant' as const, content: 'Насос называется Н-1.' },
];

describe('mergeConversation', () => {
    it('keeps the previous reply before a follow-up and does not duplicate lines already on screen', () => {
        const onScreen = [
            ...saved,
            { role: 'user' as const, content: 'Повтори имя' },
        ];
        expect(mergeConversation(saved, onScreen, 'continue')).toEqual(onScreen);

        const reloaded = mergeConversation(saved, [{ role: 'user' as const, content: 'Повтори имя' }], 'continue');
        expect(reloaded.map(message => message.content)).toEqual([
            'Как зовут насос?',
            'Насос называется Н-1.',
            'Повтори имя',
        ]);
    });

    it('starts a fresh conversation without the saved lines', () => {
        expect(mergeConversation(saved, [{ role: 'user' as const, content: 'Новый вопрос' }], 'fresh')).toEqual([
            { role: 'user', content: 'Новый вопрос' },
        ]);
    });
});
