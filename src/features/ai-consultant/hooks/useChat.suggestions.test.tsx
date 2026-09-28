/**
 * useChat.suggestions.test.tsx
 *
 * Подсказки из потока попадают в состояние чата и сбрасываются при новом сообщении.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { streamChatMessage } from '../services/consultantApi';
import { useChat } from './useChat';

vi.mock('../services/consultantApi', () => ({
  streamChatMessage: vi.fn(),
  uploadPhotoToDriveFolder: vi.fn(),
  fetchChatHistory: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../user-activity/services/activityLogsApi', () => ({
  logUserActivity: vi.fn(),
}));

describe('useChat suggestions', () => {
  beforeEach(() => {
    vi.mocked(streamChatMessage).mockReset();
  });

  it('keeps server suggestions and clears them on the next message', async () => {
    vi.mocked(streamChatMessage)
      .mockImplementationOnce(async function* () {
        yield { type: 'text_delta', delta: 'Сохранить?' };
        yield { type: 'suggestions', suggestions: ['Да', 'Нет'] };
        yield { type: 'done', toolsUsed: [] };
      })
      .mockImplementationOnce(async function* () {
        yield { type: 'text_delta', delta: 'обычный ответ' };
        yield { type: 'done', toolsUsed: [] };
      });

    const { result } = renderHook(() => useChat(null, null));

    await act(async () => {
      await result.current.sendMessage({ text: 'заполни журнал обслуживания' });
    });
    await waitFor(() => {
      expect(result.current.suggestions).toEqual(['Да', 'Нет']);
    });

    await act(async () => {
      await result.current.sendMessage({ text: 'когда было последнее обслуживание' });
    });
    await waitFor(() => {
      expect(result.current.suggestions).toEqual([]);
    });
  });
});
