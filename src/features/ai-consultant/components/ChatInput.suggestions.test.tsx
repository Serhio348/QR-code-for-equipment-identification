/**
 * ChatInput.suggestions.test.tsx
 *
 * Кнопка подсказки отправляет свой текст как обычное сообщение.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChatInput } from './ChatInput';

vi.mock('./VoiceButton', () => ({ VoiceButton: () => null }));
vi.mock('./PhotoButton', () => ({ PhotoButton: () => null }));
vi.mock('./QRButton', () => ({ QRButton: () => null }));

describe('ChatInput suggestions', () => {
  it('sends the suggestion text and does not decide what it means', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(
      <ChatInput
        onSend={onSend}
        isLoading={false}
        suggestions={['Да', 'Нет', 'Редактировать']}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Да' }));

    expect(onSend).toHaveBeenCalledWith({ text: 'Да' });
  });
});
