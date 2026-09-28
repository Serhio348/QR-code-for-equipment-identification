/**
 * chatFormRouting.test.ts
 *
 * Бланк отвечает до модели. Обычный чат по-прежнему вызывает провайдера.
 */

import { type Server } from 'node:http';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handleChatForm: vi.fn(),
  cancelChatForm: vi.fn(),
  chat: vi.fn(),
  streamChat: vi.fn(),
  createFallbackProviders: vi.fn(),
  saveMessages: vi.fn(async () => {}),
  getOrCreateSession: vi.fn(async () => 'session-1'),
  updateSessionTitle: vi.fn(async () => {}),
  loadRecentHistory: vi.fn(async () => []),
}));

vi.mock('../../middleware/auth.js', () => ({
  authMiddleware: (req: { user?: { id: string; email: string } }, _res: unknown, next: () => void) => {
    req.user = { id: 'user-1', email: 'user@example.com' };
    next();
  },
}));

vi.mock('../../services/ai/chatForms/index.js', () => ({
  handleChatForm: mocks.handleChatForm,
  cancelChatForm: mocks.cancelChatForm,
  textFromChatContent: (content: unknown) => (typeof content === 'string' ? content.trim() : ''),
}));

vi.mock('../../services/ai/providerFallback.js', () => ({
  createFallbackProviders: mocks.createFallbackProviders,
  runWithProviderFallback: async (
    providers: Array<{ chat: typeof mocks.chat; streamChat: typeof mocks.streamChat }>,
    run: (provider: { chat: typeof mocks.chat; streamChat: typeof mocks.streamChat }, mark: () => void) => Promise<unknown>,
  ) => run(providers[0], () => {}),
}));

vi.mock('../../services/ai/chatMemoryService.js', () => ({
  getOrCreateSession: mocks.getOrCreateSession,
  saveMessages: mocks.saveMessages,
  updateSessionTitle: mocks.updateSessionTitle,
  loadRecentHistory: mocks.loadRecentHistory,
}));

vi.mock('../../services/ai/userAppAccessService.js', () => ({
  loadUserAppAccess: async () => ({ equipment: true, water: true, isAdmin: false }),
}));

vi.mock('../../services/ai/agentMemoryService.js', () => ({
  loadFactsForPrompt: async () => '',
}));

vi.mock('../../services/ai/driveFileContextService.js', () => ({
  buildDriveFileContext: async () => '',
}));

vi.mock('../../services/ai/documentSessionService.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/ai/documentSessionService.js')>();
  return {
    ...actual,
    buildDocumentSessionPrompt: () => '',
  };
});

vi.mock('../../services/ai/toolContext.js', () => ({
  runWithToolContext: (_context: unknown, fn: () => Promise<unknown>) => fn(),
}));

import chatRouter from './chat.js';
import streamRouter from './chatStream.js';

async function withServer(router: express.Router, run: (url: string) => Promise<void>): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use(router);
  const server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, () => resolve(listening));
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  try {
    await run(`http://127.0.0.1:${port}/`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

const body = {
  messages: [{ role: 'user', content: 'заполни журнал обслуживания' }],
};

describe('chat form routing', () => {
  beforeEach(() => {
    mocks.handleChatForm.mockReset();
    mocks.chat.mockReset();
    mocks.streamChat.mockReset();
    mocks.createFallbackProviders.mockReset();
    mocks.saveMessages.mockClear();
    mocks.createFallbackProviders.mockReturnValue([{ chat: mocks.chat, streamChat: mocks.streamChat }]);
    mocks.chat.mockResolvedValue({ message: 'обычный ответ', toolsUsed: ['get_maintenance_log'] });
    mocks.streamChat.mockImplementation(async (
      _messages: unknown,
      _tools: unknown,
      _userId: unknown,
      onEvent: (event: { type: string; delta?: string; toolsUsed?: string[] }) => void,
    ) => {
      onEvent({ type: 'text_delta', delta: 'обычный ответ' });
      onEvent({ type: 'done', toolsUsed: [] });
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns a form answer without calling the model', async () => {
    mocks.handleChatForm.mockResolvedValue({
      handled: true,
      text: 'Какое оборудование?',
      suggestions: ['Отмена'],
    });

    await withServer(chatRouter, async (url) => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await response.json() as { data: { message: string; suggestions: string[] } };
      expect(response.status).toBe(200);
      expect(json.data.message).toBe('Какое оборудование?');
      expect(json.data.suggestions).toEqual(['Отмена']);
    });

    expect(mocks.chat).not.toHaveBeenCalled();
    expect(mocks.createFallbackProviders).not.toHaveBeenCalled();
    expect(mocks.saveMessages).toHaveBeenCalled();
  });

  it('keeps the existing chat pipeline when the form does not handle the message', async () => {
    mocks.handleChatForm.mockResolvedValue({ handled: false });

    await withServer(chatRouter, async (url) => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'когда было последнее обслуживание' }],
        }),
      });
      const json = await response.json() as { data: { message: string } };
      expect(response.status).toBe(200);
      expect(json.data.message).toBe('обычный ответ');
    });

    expect(mocks.chat).toHaveBeenCalledOnce();
    expect(mocks.createFallbackProviders).toHaveBeenCalledOnce();
  });

  it('streams a form answer and suggestions without calling the model', async () => {
    mocks.handleChatForm.mockResolvedValue({
      handled: true,
      text: 'Сохранить?',
      suggestions: ['Да', 'Нет', 'Редактировать'],
    });

    await withServer(streamRouter, async (url) => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.text();
      expect(payload).toContain('"type":"text_delta"');
      expect(payload).toContain('Сохранить?');
      expect(payload).toContain('"type":"suggestions"');
      expect(payload).toContain('Редактировать');
      expect(payload).toContain('"type":"done"');
    });

    expect(mocks.streamChat).not.toHaveBeenCalled();
    expect(mocks.createFallbackProviders).not.toHaveBeenCalled();
  });

  it('streams the model when the form does not handle the message', async () => {
    mocks.handleChatForm.mockResolvedValue({ handled: false });

    await withServer(streamRouter, async (url) => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'когда было последнее обслуживание' }],
        }),
      });
      const payload = await response.text();
      expect(payload).toContain('обычный ответ');
      expect(payload).not.toContain('"type":"suggestions"');
    });

    expect(mocks.streamChat).toHaveBeenCalledOnce();
  });

  it('drops the open form when the chat is dismissed', async () => {
    await withServer(chatRouter, async (url) => {
      const response = await fetch(`${url}dismiss`, { method: 'POST' });
      expect(response.status).toBe(204);
    });

    expect(mocks.cancelChatForm).toHaveBeenCalledWith('user-1');
    expect(mocks.chat).not.toHaveBeenCalled();
  });
});
