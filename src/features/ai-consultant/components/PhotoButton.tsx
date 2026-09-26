import React, { useRef } from 'react';
import { planPhotoSelection } from '../services/chatPhotoBudget';
import './ChatWidget.css';

export interface PhotoData {
  /** Исходный File (для прямой загрузки на backend без LLM) */
  file: File;
  /** Base64 строка без префикса data:image/... */
  data: string;
  /** MIME тип изображения */
  mimeType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  /** Имя файла */
  fileName: string;
  /** URL для превью (data URL) */
  previewUrl: string;
}

interface PhotoButtonProps {
  disabled?: boolean;
  /** Уже выбранные фото, в байтах Base64. */
  encodedBytesUsed?: number;
  onPhotosSelected?: (photos: PhotoData[]) => void;
  onPhotoErrors?: (errors: string[]) => void;
}

export const PhotoButton: React.FC<PhotoButtonProps> = ({
  disabled,
  encodedBytesUsed = 0,
  onPhotosSelected,
  onPhotoErrors,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Конвертирует File в Base64 и создаёт объект PhotoData.
   */
  const fileToPhotoData = async (file: File): Promise<PhotoData | null> => {
    return new Promise((resolve) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const base64Match = dataUrl.match(/^data:image\/[a-z]+;base64,(.+)$/);
        if (!base64Match) {
          resolve(null);
          return;
        }

        resolve({
          file,
          data: base64Match[1],
          mimeType: file.type as PhotoData['mimeType'],
          fileName: file.name,
          previewUrl: dataUrl,
        });
      };

      reader.onerror = () => {
        resolve(null);
      };

      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    const plan = planPhotoSelection(encodedBytesUsed, list.map(file => ({
      name: file.name,
      size: file.size,
      type: file.type,
    })));
    const accepted = await Promise.all(plan.accepted.map(index => fileToPhotoData(list[index])));
    const validPhotos = accepted.filter((photo): photo is PhotoData => photo !== null);
    const readFailures = plan.accepted.length - validPhotos.length;
    const errors = readFailures > 0
      ? [...plan.errors, 'Не удалось прочитать одно из фото']
      : plan.errors;

    onPhotoErrors?.(errors);
    if (validPhotos.length > 0 && onPhotosSelected) {
      onPhotosSelected(validPhotos);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  /**
   * Открывает диалог выбора файлов.
   */
  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        multiple
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className="ai-chat-photo-btn"
        title="Прикрепить фото"
      >
        📷
      </button>
    </>
  );
};
