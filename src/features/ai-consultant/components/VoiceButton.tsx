import React from 'react';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import './ChatWidget.css';

interface VoiceButtonProps {
  disabled?: boolean;
  onTranscript?: (text: string) => void;
}

export const VoiceButton: React.FC<VoiceButtonProps> = ({ disabled, onTranscript }) => {
  const {
    isSupported,
    isListening,
    transcript,
    error,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition();

  // Вызываем callback при получении транскрипции
  React.useEffect(() => {
    if (transcript && onTranscript) {
      onTranscript(transcript);
      resetTranscript();
    }
  }, [transcript, onTranscript, resetTranscript]);

  if (!isSupported) {
    return null; // Скрываем кнопку, если браузер не поддерживает
  }

  const handleClick = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={`ai-chat-voice-btn ${isListening ? 'ai-chat-voice-btn--listening' : ''}`}
      title={isListening ? 'Остановить запись' : 'Голосовой ввод'}
    >
      {isListening ? '🔴' : '🎤'}
      {error && <span className="ai-chat-voice-error">{error}</span>}
    </button>
  );
};