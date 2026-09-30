/**
 * Компонент для отображения списка файлов из Google Drive
 */

import React, { useState, useEffect, useCallback } from 'react';
import { DriveFile } from '../services/equipmentApi';
import { getFolderFiles } from '../services/equipmentApi';
import { getDocumentIndexStatuses, type DocumentIndexStatus } from '../services/driveApi';
import { logUserActivity } from '@/features/user-activity/services/activityLogsApi';
import './DriveFilesList.css';

interface DriveFilesListProps {
  folderUrl: string;
  equipmentName?: string;
}

const DriveFilesList: React.FC<DriveFilesListProps> = ({ folderUrl, equipmentName }) => {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [indexStatuses, setIndexStatuses] = useState<Record<string, DocumentIndexStatus>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isCheckingAccess, setIsCheckingAccess] = useState<boolean>(false);
  const checkIntervalRef = React.useRef<NodeJS.Timeout | null>(null);
  const isCheckingAccessRef = React.useRef<boolean>(false);
  const accessGrantedRef = React.useRef<boolean>(false);

  const loadFiles = useCallback(async (silent: boolean = false, checkAccess: boolean = false) => {
    if (!silent) {
      setLoading(true);
    }
    setError(null);
    
    try {
      console.debug('📁 Загрузка файлов из папки:', folderUrl);
      const filesList = await getFolderFiles(folderUrl);
      console.debug('📁 Получено файлов:', filesList.length, filesList);
      setFiles(filesList);
      
      // Если доступ получен и ранее была ошибка, останавливаем проверку и открываем папку
      if (checkAccess && isCheckingAccessRef.current && !accessGrantedRef.current) {
        console.debug('✅ Доступ к папке получен!');
        accessGrantedRef.current = true;
        setIsCheckingAccess(false);
        isCheckingAccessRef.current = false;
        
        // Останавливаем периодическую проверку
        if (checkIntervalRef.current) {
          clearInterval(checkIntervalRef.current);
          checkIntervalRef.current = null;
        }
        
        // Показываем уведомление и автоматически открываем папку
        setTimeout(() => {
          alert('✅ Доступ к папке получен! Папка откроется автоматически.');
          window.open(folderUrl, '_blank', 'noopener,noreferrer');
        }, 500);
      }
      
      if (filesList.length === 0) {
        console.debug('⚠️ Папка пуста или файлы не найдены');
      }
    } catch (err: any) {
      console.error('❌ Ошибка загрузки файлов:', err);
      console.error('  - URL папки:', folderUrl);
      console.error('  - Сообщение ошибки:', err.message);
      
      // Проверяем, является ли ошибка ошибкой доступа
      const httpStatus = (err as any)?.status;
      const isAccessError = httpStatus === 403 || 
                           httpStatus === 401 ||
                           err.message?.toLowerCase().includes('access') || 
                           err.message?.toLowerCase().includes('permission') ||
                           err.message?.toLowerCase().includes('доступ') ||
                           err.message?.toLowerCase().includes('разрешение') ||
                           err.message?.toLowerCase().includes('403') ||
                           err.message?.toLowerCase().includes('401') ||
                           err.message?.toLowerCase().includes('forbidden') ||
                           err.message?.toLowerCase().includes('unauthorized');
      
      if (isAccessError && !isCheckingAccessRef.current) {
        // Начинаем периодическую проверку доступа
        console.log('🔍 Начинаем проверку доступа к папке...');
        setIsCheckingAccess(true);
        isCheckingAccessRef.current = true;
        accessGrantedRef.current = false;
        
        // Проверяем доступ каждые 3 секунды (максимум 2 минуты = 40 попыток)
        let attempts = 0;
        const maxAttempts = 40;
        
        checkIntervalRef.current = setInterval(async () => {
          attempts++;
          console.log(`🔍 Проверка доступа (попытка ${attempts}/${maxAttempts})...`);
          
          try {
            // Тихая проверка доступа с флагом checkAccess
            await loadFiles(true, true);
          } catch (checkErr: any) {
            // Если все еще ошибка доступа, продолжаем проверку
            if (attempts >= maxAttempts) {
              console.debug('⏱️ Превышено время ожидания доступа');
              setIsCheckingAccess(false);
              isCheckingAccessRef.current = false;
              if (checkIntervalRef.current) {
                clearInterval(checkIntervalRef.current);
                checkIntervalRef.current = null;
              }
              setError('Доступ к папке не получен в течение 2 минут. Попробуйте позже или обратитесь к администратору.');
            }
          }
        }, 3000);
      } else if (!isAccessError) {
        // Если это не ошибка доступа, показываем обычную ошибку
        setError(`Не удалось загрузить список файлов: ${err.message || 'Неизвестная ошибка'}`);
      } else {
        // Если это ошибка доступа и мы уже проверяем, не показываем ошибку
        // Просто продолжаем проверку
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [folderUrl]);

  useEffect(() => {
    if (folderUrl) {
      loadFiles();
    }
    
    // Очистка интервала при размонтировании компонента
    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
    };
  }, [folderUrl, loadFiles]);

  useEffect(() => {
    const indexableIds = files.filter((file) => isIndexableFile(file.mimeType)).map((file) => file.id);
    if (indexableIds.length === 0) {
      setIndexStatuses({});
      return;
    }

    let cancelled = false;
    const refreshStatuses = async () => {
      try {
        const statuses = await getDocumentIndexStatuses(indexableIds);
        if (!cancelled) setIndexStatuses(statuses);
      } catch {
        if (!cancelled) setIndexStatuses({});
      }
    };

    void refreshStatuses();
    const timer = window.setInterval(() => { void refreshStatuses(); }, 20000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [files]);

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
    if (mimeType === 'application/vnd.google-apps.folder') return '📁';
    if (mimeType.includes('pdf')) return '📄';
    if (mimeType.includes('image')) return '🖼️';
    if (mimeType.includes('video')) return '🎥';
    if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
    if (mimeType.includes('zip') || mimeType.includes('archive')) return '📦';
    return '📎';
  };

  const handleOpenFile = (file: DriveFile) => {
    // Логируем просмотр файла
    logUserActivity(
      'file_view',
      `Просмотр файла: "${file.name}"${equipmentName ? ` (${equipmentName})` : ''}`,
      {
        entityType: 'file',
        entityId: file.id,
        metadata: {
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.mimeType,
          equipmentName: equipmentName || undefined,
        },
      }
    ).catch(() => {});

    window.open(file.url, '_blank', 'noopener,noreferrer');
  };

  const handleOpenFolder = () => {
    // Логируем открытие папки в Google Drive
    logUserActivity(
      'folder_open',
      `Открытие папки в Google Drive${equipmentName ? `: "${equipmentName}"` : ''}`,
      {
        entityType: 'other',
        metadata: {
          folderUrl,
          equipmentName: equipmentName || undefined,
        },
      }
    ).catch(() => {});

    window.open(folderUrl, '_blank', 'noopener,noreferrer');
  };


  if (loading) {
    return (
      <div className="drive-files-list">
        <div className="files-loading">Загрузка списка файлов...</div>
      </div>
    );
  }

  if (error && !isCheckingAccess) {
    return (
      <div className="drive-files-list">
        <div className="files-error">
          <span>⚠️ {error}</span>
          <button onClick={() => loadFiles(false)} className="retry-button">Повторить</button>
        </div>
      </div>
    );
  }
  
  if (isCheckingAccess) {
    return (
      <div className="drive-files-list">
        <div className="files-checking-access">
          <div className="checking-spinner">⏳</div>
          <p>⏳ Ожидание доступа к папке...</p>
          <p className="checking-hint">
            Запросите доступ в Google Drive (кнопка «Запросить доступ») или обратитесь к администратору.
            <br />
            Администратор может выдать «Только просмотр» или «Редактор» в настройках общего доступа Drive.
            <br />
            После выдачи доступа папка откроется автоматически.
          </p>
          <button 
            onClick={() => {
              setIsCheckingAccess(false);
              isCheckingAccessRef.current = false;
              if (checkIntervalRef.current) {
                clearInterval(checkIntervalRef.current);
                checkIntervalRef.current = null;
              }
              setError('Доступ к папке не получен. Попробуйте позже или обратитесь к администратору.');
            }} 
            className="cancel-check-button"
          >
            Отменить проверку
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="drive-files-list">
      <div className="files-header">
        <h3>📁 Документация {equipmentName && `(${equipmentName})`}</h3>
        <div className="files-actions">
          <button onClick={() => loadFiles(false)} className="refresh-button" title="Обновить список">
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
          <p className="files-empty-hint">
            Для загрузки файлов нужны права редактора в Google Drive (выдаёт администратор)
          </p>
        </div>
      ) : (
        <div className="files-grid">
          {/* Папки сверху, потом файлы */}
          {[...files].sort((a, b) => {
            const aIsFolder = a.mimeType === 'application/vnd.google-apps.folder' ? 0 : 1;
            const bIsFolder = b.mimeType === 'application/vnd.google-apps.folder' ? 0 : 1;
            return aIsFolder - bIsFolder;
          }).map((file) => {
            const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
            return (
              <div
                key={file.id}
                className={`file-card${isFolder ? ' file-card-folder' : ''}`}
                onClick={() => handleOpenFile(file)}
                title={isFolder ? 'Открыть папку' : 'Открыть файл'}
              >
                <div className="file-icon">{getFileIcon(file.mimeType)}</div>
                <div className="file-info">
                  <div className="file-name" title={file.name}>
                    {file.name}
                  </div>
                  {isIndexableFile(file.mimeType) && (
                    <IndexStatus status={indexStatuses[file.id]} />
                  )}
                  <div className="file-meta">
                    {!isFolder && <span className="file-size">{formatFileSize(file.size)}</span>}
                    <span className="file-date">{formatDate(file.modifiedTime)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default DriveFilesList;

const INDEXABLE_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.google-apps.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.google-apps.spreadsheet',
  'text/plain',
  'text/csv',
]);

function isIndexableFile(mimeType: string): boolean {
  return INDEXABLE_MIME_TYPES.has(mimeType);
}

function IndexStatus({ status }: { status?: DocumentIndexStatus }) {
  const label = status === 'ready'
    ? 'Проиндексирован'
    : status === 'pending' || status === 'indexing'
      ? 'Индексируется'
      : status === 'error'
        ? 'Ошибка индексации'
        : status === 'skipped'
          ? 'Без текста'
          : 'Не проиндексирован';
  const tone = status === 'ready'
    ? 'ready'
    : status === 'error'
      ? 'error'
      : status === 'pending' || status === 'indexing'
        ? 'progress'
        : 'waiting';

  return <span className={`file-index-status file-index-status--${tone}`}>{label}</span>;
}

