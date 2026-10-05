/**
 * ChatWidget.close.test.tsx
 *
 * Закрытие окна чата очищает текущий диалог.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChatWidget } from './ChatWidget';

const clearMessages = vi.fn();

vi.mock('../hooks/useChat', () => ({
  useChat: () => ({
    messages: [{ id: '1', role: 'user', content: 'прошлый вопрос', timestamp: 1 }],
    isLoading: false,
    error: null,
    activeToolName: null,
    suggestions: [],
    sendMessage: vi.fn(),
    clearMessages,
  }),
}));

vi.mock('../hooks/useAlerts', () => ({
  useAlerts: () => ({ alerts: { total: 0, critical: 0, warnings: 0, items: [] } }),
}));

vi.mock('../hooks/useSpeechRecognition', () => ({
  useSpeechRecognition: () => ({ transcript: '', resetTranscript: vi.fn() }),
}));

const equipmentApi = vi.hoisted(() => ({
  getAllEquipment: vi.fn(),
  getEquipmentById: vi.fn(),
}));

vi.mock('../../equipment/services/equipmentApi', () => ({
  getAllEquipment: equipmentApi.getAllEquipment,
  getEquipmentById: equipmentApi.getEquipmentById,
}));

vi.mock('../../user-activity/services/activityLogsApi', () => ({
  logUserActivity: vi.fn(),
}));

describe('ChatWidget close', () => {
  it('clears the dialog when the window is closed', async () => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    const user = userEvent.setup();
    render(<ChatWidget initialOpen />);

    expect(screen.getByText('прошлый вопрос')).toBeInTheDocument();
    await user.click(screen.getByTitle('Закрыть консультанта'));

    expect(clearMessages).toHaveBeenCalledOnce();
    expect(equipmentApi.getAllEquipment).not.toHaveBeenCalled();
    expect(equipmentApi.getEquipmentById).not.toHaveBeenCalled();
  });
});
