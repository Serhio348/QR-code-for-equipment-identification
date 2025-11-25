/**
 * Компонент для отображения списка файлов из Google Drive
 */

import React, { useState, useEffect, useCallback } from 'react';
import { DriveFile } from '../services/equipmentApi';
import { getFolderFiles } from '../services/equipmentApi';
import './DriveFilesList.css';

interface DriveFilesListProps {
  folderUrl: string;
  equipmentName?: string;
}

const DriveFilesList: React.FC<DriveFilesListProps> = ({ folderUrl, equipmentName }) => {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('📁 Загрузка файлов из папки:', folderUrl);
      const filesList = await getFolderFiles(folderUrl);
      console.log('📁 Получено файлов:', filesList.length, filesList);
      setFiles(filesList);
      
      if (filesList.length === 0) {
        console.log('⚠️ Папка пуста или файлы не найдены');
      }
    } catch (err: any) {
      console.error('❌ Ошибка загрузки файлов:', err);
      console.error('  - URL папки:', folderUrl);
      console.error('  - Сообщение ошибки:', err.message);
      setError(`Не удалось загрузить список файлов: ${err.message || 'Неизвестная ошибка'}`);
    } finally {
      setLoading(false);
    }
  }, [folderUrl]);

  useEffect(() => {
    if (folderUrl) {
      loadFiles();
    }
  }, [folderUrl, loadFiles]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Б';
    const k = 1024;
    const sizes = ['Б', 'КБ', 'МБ', 'ГБ'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('ru-RU', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateString;
    }
  };

  const getFileIcon = (mimeType: string): string => {
    if (mimeType.includes('pdf')) return '📄';
    if (mimeType.includes('image')) return '🖼️';
    if (mimeType.includes('video')) return '🎥';
    if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
    if (mimeType.includes('zip') || mimeType.includes('archive')) return '📦';
    return '📎';
  };

  const handleOpenFile = (fileUrl: string) => {
    window.open(fileUrl, '_blank', 'noopener,noreferrer');
  };

  const handleOpenFolder = () => {
    window.open(folderUrl, '_blank', 'noopener,noreferrer');
  };


  if (loading) {
    return (
      <div className="drive-files-list">
        <div className="files-loading">Загрузка списка файлов...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="drive-files-list">
        <div className="files-error">
          <span>⚠️ {error}</span>
          <button onClick={loadFiles} className="retry-button">Повторить</button>
        </div>
      </div>
    );
  }

  return (
    <div className="drive-files-list">
      <div className="files-header">
        <h3>📁 Документация {equipmentName && `(${equipmentName})`}</h3>
        <div className="files-actions">
          <button onClick={loadFiles} className="refresh-button" title="Обновить список">
            🔄
          </button>
          <button onClick={handleOpenFolder} className="open-folder-button">
            Открыть папку
          </button>
        </div>
      </div>

      {files.length === 0 ? (
        <div className="files-empty">
          <p>В папке пока нет файлов</p>
          <p className="files-empty-hint">Откройте папку в Google Drive для загрузки файлов</p>
        </div>
      ) : (
        <div className="files-grid">
          {files.map((file) => (
            <div
              key={file.id}
              className="file-card"
              onClick={() => handleOpenFile(file.url)}
              title="Открыть файл"
            >
              <div className="file-icon">{getFileIcon(file.mimeType)}</div>
              <div className="file-info">
                <div className="file-name" title={file.name}>
                  {file.name}
                </div>
                <div className="file-meta">
                  <span className="file-size">{formatFileSize(file.size)}</span>
                  <span className="file-date">{formatDate(file.modifiedTime)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DriveFilesList;

