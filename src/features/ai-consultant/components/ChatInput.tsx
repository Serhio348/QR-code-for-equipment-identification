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
  /** Пользователь явно включил запись выбранных фото в папку. */
  uploadConfirmed?: boolean;
  folderUrl?: string;
  /** Ключи fileName:size уже записанных файлов. Повтор их не отправляет. */
  alreadyUploaded?: string[];
}

interface ChatInputProps {
  onSend: (message: ChatInputMessage) => void;
  isLoading: boolean;
  voiceTranscript?: string;
  onVoiceTranscriptUsed?: () => void;
  onQRScanClick?: () => void;
  folderUrl?: string | null;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  isLoading,
  voiceTranscript,
  onVoiceTranscriptUsed,
  onQRScanClick,
  folderUrl,
}) => {
  const [text, setText] = useState('');
  const [selectedPhotos, setSelectedPhotos] = useState<PhotoData[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [uploadConfirmed, setUploadConfirmed] = useState(false);
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
        uploadConfirmed: uploadConfirmed && selectedPhotos.length > 0,
        folderUrl: folderUrl?.trim() || undefined,
      });
      setText('');
      setSelectedPhotos([]);
      setPhotoError(null);
      setUploadConfirmed(false);
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

  const handlePhotoErrors = (errors: string[]) => {
    setPhotoError(errors.length > 0 ? errors.join(' ') : null);
  };

  const encodedBytesUsed = selectedPhotos.reduce((sum, photo) => sum + photo.data.length, 0);

  const handleRemovePhoto = (index: number) => {
    setSelectedPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleVoiceTranscript = (voiceText: string) => {
    // Добавляем распознанный текст к текущему тексту
    setText(prev => prev + (prev ? ' ' : '') + voiceText);
  };

  return (
    <form className="ai-chat-input" onSubmit={handleSubmit}>
      {photoError && (
        <p className="ai-chat-input__photo-error" role="alert">{photoError}</p>
      )}

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

      {selectedPhotos.length > 0 && (
        <label className="ai-chat-input__upload">
          <input
            type="checkbox"
            checked={uploadConfirmed}
            disabled={!folderUrl?.trim() || isLoading}
            onChange={(event) => setUploadConfirmed(event.target.checked)}
          />
          <span>
            {folderUrl?.trim()
              ? 'Записать эти фото в папку оборудования'
              : 'Папка оборудования не выбрана, фото останутся только в чате'}
          </span>
        </label>
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
        <PhotoButton
          disabled={isLoading}
          encodedBytesUsed={encodedBytesUsed}
          onPhotosSelected={handlePhotosSelected}
          onPhotoErrors={handlePhotoErrors}
        />
        <VoiceButton disabled={isLoading} onTranscript={handleVoiceTranscript} />
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