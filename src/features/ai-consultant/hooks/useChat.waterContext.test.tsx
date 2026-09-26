import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WaterDashboardContext } from '../services/consultantApi';
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

function water(monthLabel: string): WaterDashboardContext {
  return {
    monthLabel,
    sourceMonth: 1,
    productionMonth: 1,
    domesticMonth: 1,
    lossesMonth: 0,
    lossesPct: 0,
    filterLoss: 0,
    osmosisLoss: 0,
    softenedWaterMonth: 1,
    activeAlerts: 0,
  };
}

describe('useChat water context', () => {
  beforeEach(() => {
    vi.mocked(streamChatMessage).mockReset();
  });

  it('sends the latest water context after it changes without a new history item', async () => {
    vi.mocked(streamChatMessage).mockImplementation(async function* () {
      yield { type: 'done', toolsUsed: [] };
    });

    const { result, rerender } = renderHook(
      ({ context }) => useChat(null, context),
      { initialProps: { context: water('январь') } },
    );

    await act(async () => {
      await result.current.sendMessage({ text: 'сколько воды' });
    });
    rerender({ context: water('февраль') });
    await act(async () => {
      await result.current.sendMessage({ text: 'а сейчас' });
    });

    await waitFor(() => {
      expect(vi.mocked(streamChatMessage).mock.calls.length).toBe(2);
    });
    expect(vi.mocked(streamChatMessage).mock.calls[1][3]).toMatchObject({ monthLabel: 'февраль' });
  });

  it('retries with the water context that is current after the failure', async () => {
    let attempt = 0;
    vi.mocked(streamChatMessage).mockImplementation(async function* () {
      attempt += 1;
      if (attempt === 1) throw new Error('сеть');
      yield { type: 'done', toolsUsed: [] };
    });

    const { result, rerender } = renderHook(
      ({ context }) => useChat(null, context),
      { initialProps: { context: water('январь') } },
    );

    await act(async () => {
      await result.current.sendMessage({ text: 'сколько воды' });
    });
    rerender({ context: water('февраль') });
    await act(async () => {
      await result.current.retryLastMessage();
    });

    expect(vi.mocked(streamChatMessage).mock.calls[1][3]).toMatchObject({ monthLabel: 'февраль' });
  });
});
