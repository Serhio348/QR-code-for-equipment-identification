import React from 'react';
import './ChatWidget.css';

interface TextContentBlock {
  type: 'text';
  text: string;
}

interface ImageContentBlock {
  type: 'image';
  source: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string | Array<TextContentBlock | ImageContentBlock>;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ role, content }) => {
  // Парсинг строки: разбивает на текст и markdown-ссылки [текст](url)
  const renderLineWithLinks = (line: string, lineKey: number) => {
    const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = linkRegex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        parts.push(line.slice(lastIndex, match.index));
      }
      parts.push(
        <a
          key={`link-${lineKey}-${match.index}`}
          href={match[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="ai-chat-file-btn"
        >
          {match[1]}
        </a>
      );
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < line.length) {
      parts.push(line.slice(lastIndex));
    }

    return parts.length > 0 ? parts : line;
  };

  // Функция отображения текста с переносами строк и ссылками
  const renderText = (text: string) => {
    const lines = text.split('\n');
    return lines.map((line, index) => (
      <React.Fragment key={index}>
        {renderLineWithLinks(line, index)}
        {index < lines.length - 1 && <br />}
      </React.Fragment>
    ));
  };

  // Если контент - строка, отображаем как раньше
  if (typeof content === 'string') {
    return (
      <div className={`ai-chat-message ai-chat-message--${role}`}>
        <div className="ai-chat-message__avatar">
          {role === 'user' ? '👤' : '🤖'}
        </div>
        <div className="ai-chat-message__content">
          <div className="ai-chat-message__text">
            {renderText(content)}
          </div>
        </div>
      </div>
    );
  }

  // Если контент - массив блоков (мультимодальный)
  return (
    <div className={`ai-chat-message ai-chat-message--${role}`}>
      <div className="ai-chat-message__avatar">
        {role === 'user' ? '👤' : '🤖'}
      </div>
      <div className="ai-chat-message__content">
        {content.map((block, index) => {
          if (block.type === 'text') {
            return (
              <div key={index} className="ai-chat-message__text">
                {renderText(block.text)}
              </div>
            );
          }

          if (block.type === 'image') {
            return (
              <div key={index} className="ai-chat-message__image">
                <img
                  src={`data:${block.source.media_type};base64,${block.source.data}`}
                  alt="Прикрепленное фото"
                />
              </div>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
};