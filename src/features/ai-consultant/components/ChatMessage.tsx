import React from 'react';
import './ChatWidget.css';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ role, content }) => {
  return (
    <div className={`ai-chat-message ai-chat-message--${role}`}>
      <div className="ai-chat-message__avatar">
        {role === 'user' ? '👤' : '🤖'}
      </div>
      <div className="ai-chat-message__content">
        <div className="ai-chat-message__text">
          {content.split('\n').map((line, index) => (
            <React.Fragment key={index}>
              {line}
              {index < content.split('\n').length - 1 && <br />}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};