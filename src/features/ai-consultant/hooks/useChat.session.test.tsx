/**
 * useChat.session.test.tsx
 *
 * Новое открытие чата не показывает сохранённый диалог и не отправляет его модели.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fetchChatHistory, streamChatMessage } from '../services/consultantApi';
import { useChat } from './useChat';

vi.mock('../services/consultantApi', () => ({
  streamChatMessage: vi.fn(),
  uploadPhotoToDriveFolder: vi.fn(),
  dismissChatForm: vi.fn().mockResolvedValue(undefined),
  fetchChatHistory: vi.fn().mockResolvedValue([
    { role: 'user', content: 'старый вопрос' },
    { role: 'assistant', content: 'старый ответ' },
  ]),
}));

vi.mock('../../user-activity/services/activityLogsApi', () => ({
  logUserActivity: vi.fn(),
}));

describe('useChat session', () => {
  it('does not restore the saved dialog into an empty chat', async () => {
    const { result } = renderHook(() => useChat(null, null));

    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchChatHistory).not.toHaveBeenCalled();
    expect(result.current.messages).toEqual([]);
  });

  it('sends only the visible thread', async () => {
    vi.mocked(streamChatMessage).mockImplementationOnce(async function* () {
      yield { type: 'text_delta', delta: 'ok' };
      yield { type: 'done', toolsUsed: [] };
    });

    const { result } = renderHook(() => useChat(null, null));
    await act(async () => {
      await result.current.sendMessage({ text: 'новый вопрос' });
    });

    await waitFor(() => {
      expect(streamChatMessage).toHaveBeenCalled();
    });
    const call = vi.mocked(streamChatMessage).mock.calls[0];
    expect(call[4]).toBe('fresh');
    expect(call[0]).toEqual([
      expect.objectContaining({ role: 'user', content: 'новый вопрос' }),
    ]);
  });
});
