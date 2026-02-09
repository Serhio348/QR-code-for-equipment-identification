import React, { useState, useRef, useEffect } from 'react';
import { VoiceButton } from './VoiceButton';
import { PhotoButton, PhotoData } from './PhotoButton';
import { QRButton } from './QRButton';
import './ChatWidget.css';

// Реэкспортируем PhotoData для использования в других модулях
export type { PhotoData };

export interface ChatInputMessage {
  text: string;
  photos?: PhotoData[];
}

interface ChatInputProps {
  onSend: (message: ChatInputMessage) => void;
  isLoading: boolean;
  voiceTranscript?: string;
  onVoiceTranscriptUsed?: () => void;
  onQRScanClick?: () => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  isLoading,
  voiceTranscript,
  onVoiceTranscriptUsed,
  onQRScanClick,
}) => {
  const [text, setText] = useState('');
  const [selectedPhotos, setSelectedPhotos] = useState<PhotoData[]>([]);
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

    // Можно отправить если есть текст или фото
    if ((text.trim() || selectedPhotos.length > 0) && !isLoading) {
      onSend({
        text: text.trim(),
        photos: selectedPhotos.length > 0 ? selectedPhotos : undefined,
      });
      setText('');
      setSelectedPhotos([]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handlePhotosSelected = (photos: PhotoData[]) => {
    setSelectedPhotos(prev => [...prev, ...photos]);
  };

  const handleRemovePhoto = (index: number) => {
    setSelectedPhotos(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <form className="ai-chat-input" onSubmit={handleSubmit}>
      {/* Превью выбранных фото */}
      {selectedPhotos.length > 0 && (
        <div className="ai-chat-input__photo-preview">
          {selectedPhotos.map((photo, index) => (
            <div key={index} className="ai-chat-input__photo-item">
              <img src={photo.previewUrl} alt={photo.fileName} />
              <button
                type="button"
                onClick={() => handleRemovePhoto(index)}
                className="ai-chat-input__photo-remove"
                title="Удалить фото"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

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
        <PhotoButton disabled={isLoading} onPhotosSelected={handlePhotosSelected} />
        <VoiceButton disabled={isLoading} />
        {onQRScanClick && <QRButton disabled={isLoading} onClick={onQRScanClick} />}

        <button
          type="submit"
          disabled={(!text.trim() && selectedPhotos.length === 0) || isLoading}
          className="ai-chat-input__send"
          title="Отправить"
        >
          {isLoading ? '⏳' : '➤'}
        </button>
      </div>
    </form>
  );
};