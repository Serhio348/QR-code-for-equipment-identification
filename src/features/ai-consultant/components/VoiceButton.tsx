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
    isTranscribing,
    transcript,
    error,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition();

  React.useEffect(() => {
    if (transcript && onTranscript) {
      onTranscript(transcript);
      resetTranscript();
    }
  }, [transcript, onTranscript, resetTranscript]);

  if (!isSupported) {
    return null;
  }

  const handleClick = () => {
    if (isTranscribing) {
      return;
    }
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const busy = isListening || isTranscribing;
  const title = isTranscribing
    ? 'Распознавание...'
    : isListening
      ? 'Остановить запись'
      : 'Голосовой ввод';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || isTranscribing}
      className={`ai-chat-voice-btn ${busy ? 'ai-chat-voice-btn--listening' : ''}`}
      title={title}
      aria-label={title}
    >
      {isTranscribing ? '⏳' : isListening ? '🔴' : '🎤'}
      {error && <span className="ai-chat-voice-error">{error}</span>}
    </button>
  );
};
