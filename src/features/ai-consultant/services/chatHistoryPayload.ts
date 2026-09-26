/**
 * chatHistoryPayload.ts
 *
 * На экран остаются все фото. В запрос к AI байты изображений уходят только с последним сообщением, если в нём есть фото.
 */

export interface HistoryBlock {
  type: string;
  text?: string;
}

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string | HistoryBlock[];
}

function hasImage(content: HistoryMessage['content']): boolean {
  return Array.isArray(content) && content.some(block => block.type === 'image');
}

function withoutImages(content: HistoryMessage['content']): HistoryMessage['content'] {
  if (!Array.isArray(content)) return content;
  const text = content.filter(block => block.type === 'text');
  if (text.length === content.length) return content;
  if (text.length === 0) return '';
  if (text.length === 1 && typeof text[0].text === 'string') return text[0].text;
  return text;
}

export function historyForApi<T extends HistoryMessage>(messages: readonly T[], maxCount: number): T[] {
  const trimmed = messages.slice(-maxCount);
  const lastIndex = trimmed.length - 1;
  return trimmed.map((message, index) => {
    if (index === lastIndex && hasImage(message.content)) return message;
    return { ...message, content: withoutImages(message.content) };
  });
}
