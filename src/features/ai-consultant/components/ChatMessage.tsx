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
  // Функция отображения текста с переносами строк
  const renderText = (text: string) => {
    return text.split('\n').map((line, index) => (
      <React.Fragment key={index}>
        {line}
        {index < text.split('\n').length - 1 && <br />}
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