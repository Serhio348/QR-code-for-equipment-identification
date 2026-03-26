import React, { useRef } from 'react';
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
  onPhotosSelected?: (photos: PhotoData[]) => void;
}

export const PhotoButton: React.FC<PhotoButtonProps> = ({ disabled, onPhotosSelected }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Конвертирует File в Base64 и создаёт объект PhotoData.
   */
  const fileToPhotoData = async (file: File): Promise<PhotoData | null> => {
    // Проверка типа файла
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      console.warn(`Неподдерживаемый тип файла: ${file.type}`);
      return null;
    }

    // Проверка размера (макс 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      console.warn(`Файл слишком большой: ${file.size} байт (макс 10MB)`);
      return null;
    }

    return new Promise((resolve) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;

        // Извлекаем Base64 часть (без префикса "data:image/jpeg;base64,")
        const base64Match = dataUrl.match(/^data:image\/[a-z]+;base64,(.+)$/);
        if (!base64Match) {
          console.warn('Не удалось извлечь Base64 из Data URL');
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
        console.error('Ошибка чтения файла');
        resolve(null);
      };

      reader.readAsDataURL(file);
    });
  };

  /**
   * Обработчик выбора файлов.
   */
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // Конвертируем все файлы в PhotoData
    const photosPromises = Array.from(files).map(file => fileToPhotoData(file));
    const photosResults = await Promise.all(photosPromises);

    // Фильтруем null значения (невалидные файлы)
    const validPhotos = photosResults.filter((photo): photo is PhotoData => photo !== null);

    if (validPhotos.length > 0 && onPhotosSelected) {
      onPhotosSelected(validPhotos);
    }

    // Сбрасываем input чтобы можно было выбрать те же файлы снова
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
