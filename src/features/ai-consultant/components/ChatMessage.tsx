import React, { useState } from 'react';
import { downloadInvoicePdf } from '../../water-monitoring/services/notificationsApi';
import './ChatWidget.css';

interface TextContentBlock {
  type: 'text';
  text: string;
}

interface ImageContentBlock {
  type: 'image';
  source: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string | Array<TextContentBlock | ImageContentBlock>;
}

// Кнопка скачивания PDF счёта. period и account извлекаются из маркера pdf:YYYY-MM:account
const PdfDownloadButton: React.FC<{ label: string; period: string; account?: string }> = ({ label, period, account }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);

    // Открываем вкладку синхронно (user gesture context) без noopener —
    // с noopener браузер возвращает null и мы теряем ссылку на окно
    const win = window.open('about:blank', '_blank');

    try {
      const blob = await downloadInvoicePdf(period, account);

      if (!blob) {
        win?.close();
        setError('Не удалось скачать PDF');
        return;
      }

      const url = URL.createObjectURL(blob);
      if (win) {
        win.location.href = url;
      } else {
        // win=null если браузер заблокировал — fallback через <a>
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      win?.close();
      setError('Ошибка при загрузке PDF');
    } finally {
      setLoading(false);
    }
  };

  return (
    <span>
      <button
        onClick={handleClick}
        disabled={loading}
        className="ai-chat-file-btn"
        style={{ cursor: loading ? 'wait' : 'pointer' }}
      >
        {loading ? '⏳ Загрузка...' : label}
      </button>
      {error && <span style={{ color: '#e53e3e', fontSize: '0.85em', marginLeft: 6 }}>⚠ {error}</span>}
    </span>
  );
};

export const ChatMessage: React.FC<ChatMessageProps> = ({ role, content }) => {
  // Парсинг строки: разбивает на текст, http-ссылки и pdf-кнопки
  const renderLineWithLinks = (line: string, lineKey: number) => {
    const combinedRegex = /\[([^\]]+)\]\((pdf:[^)]+|https?:\/\/[^)]+)\)/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = combinedRegex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        parts.push(line.slice(lastIndex, match.index));
      }

      const label = match[1];
      const url = match[2];

      if (url.startsWith('pdf:')) {
        // pdf:YYYY-MM:account или pdf:YYYY-MM
        const segments = url.slice(4).split(':');
        const period = segments[0];
        const account = segments[1];
        parts.push(
          <PdfDownloadButton
            key={`pdf-${lineKey}-${match.index}`}
            label={label}
            period={period}
            account={account}
          />
        );
      } else {
        parts.push(
          <a
            key={`link-${lineKey}-${match.index}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="ai-chat-file-btn"
          >
            {label}
          </a>
        );
      }

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < line.length) {
      parts.push(line.slice(lastIndex));
    }

    return parts.length > 0 ? parts : line;
  };

  // Функция отображения текста с переносами строк и ссылками
  const renderText = (text: string) => {
    const lines = text.split('\n');
    return lines.map((line, index) => (
      <React.Fragment key={index}>
        {renderLineWithLinks(line, index)}
        {index < lines.length - 1 && <br />}
      </React.Fragment>
    ));
  };

  // Если контент - строка, отображаем как раньше
  if (typeof content === 'string') {
    return (
      <div className={`ai-chat-message ai-chat-message--${role}`}>
        <div className="ai-chat-message__avatar">
          {role === 'user' ? '👤' : '🤖'}
        </div>
        <div className="ai-chat-message__content">
          <div className="ai-chat-message__text">
            {renderText(content)}
          </div>
        </div>
      </div>
    );
  }

  // Если контент - массив блоков (мультимодальный)
  return (
    <div className={`ai-chat-message ai-chat-message--${role}`}>
      <div className="ai-chat-message__avatar">
        {role === 'user' ? '👤' : '🤖'}
      </div>
      <div className="ai-chat-message__content">
        {content.map((block, index) => {
          if (block.type === 'text') {
            return (
              <div key={index} className="ai-chat-message__text">
                {renderText(block.text)}
              </div>
            );
          }

          if (block.type === 'image') {
            return (
              <div key={index} className="ai-chat-message__image">
                <img
                  src={`data:${block.source.media_type};base64,${block.source.data}`}
                  alt="Прикрепленное фото"
                />
              </div>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
};