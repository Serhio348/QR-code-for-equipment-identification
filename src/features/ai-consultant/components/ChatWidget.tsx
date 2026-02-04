import React, { useState, useRef, useEffect } from 'react';
import { useChat } from '../hooks/useChat';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import './ChatWidget.css';

interface ChatWidgetProps {
  initialOpen?: boolean;
}

export const ChatWidget: React.FC<ChatWidgetProps> = ({ initialOpen = false }) => {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, isLoading, error, sendMessage, clearMessages } = useChat();
  const { transcript, resetTranscript } = useSpeechRecognition();

  // Автопрокрутка к последнему сообщению
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const toggleOpen = () => {
    setIsOpen(!isOpen);
  };

  const handleVoiceTranscriptUsed = () => {
    resetTranscript();
  };

  return (
    <div className={`ai-chat-widget ${isOpen ? 'ai-chat-widget--open' : ''}`}>
      {/* Кнопка открытия */}
      <button
        className="ai-chat-widget__toggle"
        onClick={toggleOpen}
        title={isOpen ? 'Закрыть консультанта' : 'AI Консультант'}
      >
        {isOpen ? '✕' : '💬'}
      </button>

      {/* Окно чата */}
      {isOpen && (
        <div className="ai-chat-widget__window">
          {/* Заголовок */}
          <div className="ai-chat-widget__header">
            <span className="ai-chat-widget__title">
              🤖 AI Консультант
            </span>
            <button
              className="ai-chat-widget__clear"
              onClick={clearMessages}
              title="Очистить историю"
            >
              🗑️
            </button>
          </div>

          {/* Сообщения */}
          <div className="ai-chat-widget__messages">
            {messages.length === 0 && (
              <div className="ai-chat-widget__welcome">
                <p>👋 Привет! Я AI-консультант по оборудованию.</p>
                <p>Вы можете спросить меня:</p>
                <ul>
                  <li>«Покажи список оборудования»</li>
                  <li>«Найди фильтр обезжелезивания»</li>
                  <li>«Покажи журнал обслуживания котла»</li>
                  <li>«Добавь запись о ремонте»</li>
                  <li>«Прочитай инструкцию к насосу»</li>
                </ul>
              </div>
            )}

            {messages.map((msg, index) => (
              <ChatMessage key={index} role={msg.role} content={msg.content} />
            ))}

            {isLoading && (
              <div className="ai-chat-widget__loading">
                <span className="ai-chat-widget__loading-dots">
                  <span>.</span><span>.</span><span>.</span>
                </span>
                Думаю...
              </div>
            )}

            {error && (
              <div className="ai-chat-widget__error">
                ❌ {error}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Поле ввода */}
          <ChatInput
            onSend={sendMessage}
            isLoading={isLoading}
            voiceTranscript={transcript}
            onVoiceTranscriptUsed={handleVoiceTranscriptUsed}
          />
        </div>
      )}
    </div>
  );
};