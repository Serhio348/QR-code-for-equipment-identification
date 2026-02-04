import React, { useState, useRef, useEffect } from 'react';
import { VoiceButton } from './VoiceButton';
import './ChatWidget.css';

interface ChatInputProps {
  onSend: (text: string) => void;
  isLoading: boolean;
  voiceTranscript?: string;
  onVoiceTranscriptUsed?: () => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  isLoading,
  voiceTranscript,
  onVoiceTranscriptUsed,
}) => {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Обновляем текст при получении голосового ввода
  useEffect(() => {
    if (voiceTranscript) {
      setText(prev => prev + (prev ? ' ' : '') + voiceTranscript);
      onVoiceTranscriptUsed?.();
    }
  }, [voiceTranscript, onVoiceTranscriptUsed]);

  // Автоматическое изменение высоты textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 300)}px`;
    }
  }, [text]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();

    if (text.trim() && !isLoading) {
      onSend(text.trim());
      setText('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <form className="ai-chat-input" onSubmit={handleSubmit}>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Задайте вопрос об оборудовании..."
        disabled={isLoading}
        rows={3}
        className="ai-chat-input__textarea"
      />

      <div className="ai-chat-input__actions">
        <VoiceButton disabled={isLoading} />

        <button
          type="submit"
          disabled={!text.trim() || isLoading}
          className="ai-chat-input__send"
          title="Отправить"
        >
          {isLoading ? '⏳' : '➤'}
        </button>
      </div>
    </form>
  );
};