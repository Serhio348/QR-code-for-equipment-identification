import React, { useState, useRef, useEffect } from 'react';
import { useChat } from '../hooks/useChat';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import QRScanner from '../../common/components/QRScanner/QRScanner';
import { useEquipmentData } from '../../equipment/hooks/useEquipmentData';
import { logUserActivity } from '../../user-activity/services/activityLogsApi';
import type { Equipment } from '../../equipment/types/equipment';
import './ChatWidget.css';

interface ChatWidgetProps {
  initialOpen?: boolean;
}

export const ChatWidget: React.FC<ChatWidgetProps> = ({ initialOpen = false }) => {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);
  const [equipmentContext, setEquipmentContext] = useState<Equipment | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Преобразуем Equipment в EquipmentContext для передачи в хук
  const contextForChat = equipmentContext ? {
    id: equipmentContext.id,
    name: equipmentContext.name,
    type: equipmentContext.type,
    googleDriveUrl: equipmentContext.googleDriveUrl,
  } : null;

  const { messages, isLoading, error, sendMessage, clearMessages } = useChat(contextForChat);
  const { transcript, resetTranscript } = useSpeechRecognition();
  const { data: equipmentListData } = useEquipmentData();

  // Автопрокрутка к последнему сообщению
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const toggleOpen = () => {
    setIsOpen(!isOpen);
  };

  const handleVoiceTranscriptUsed = () => {
    resetTranscript();
  };

  // Обработка открытия QR-сканера
  const handleQRScanClick = () => {
    setIsQRScannerOpen(true);
  };

  // Обработка успешного сканирования QR-кода
  const handleQRScanSuccess = (equipmentId: string) => {
    console.log('[ChatWidget] QR сканирование успешно, ID:', equipmentId);

    // Ищем оборудование в списке
    const equipmentList = Array.isArray(equipmentListData) ? equipmentListData : [];
    const foundEquipment = equipmentList.find(eq => eq.id === equipmentId);

    if (foundEquipment) {
      setEquipmentContext(foundEquipment);
      console.log('[ChatWidget] Оборудование найдено:', foundEquipment.name);

      // Логируем успешное сканирование в чате
      logUserActivity(
        'qr_code_scan',
        `Сканирование QR в AI-чате: "${foundEquipment.name}"`,
        {
          entityType: 'equipment',
          entityId: foundEquipment.id,
          metadata: {
            equipmentName: foundEquipment.name,
            equipmentType: foundEquipment.type,
            scannedInChat: true,
          },
        }
      ).catch(() => {});
    } else {
      console.warn('[ChatWidget] Оборудование не найдено:', equipmentId);
      alert(`Оборудование с ID "${equipmentId}" не найдено в списке.`);

      // Логируем неудачное сканирование
      logUserActivity(
        'qr_code_scan',
        `Сканирование QR в AI-чате: оборудование не найдено (ID: ${equipmentId})`,
        {
          entityType: 'other',
          metadata: {
            scannedId: equipmentId,
            success: false,
            scannedInChat: true,
          },
        }
      ).catch(() => {});
    }

    setIsQRScannerOpen(false);
  };

  // Сброс контекста оборудования
  const handleClearContext = () => {
    setEquipmentContext(null);
  };

  return (
    <div className={`ai-chat-widget ${isOpen ? 'ai-chat-widget--open' : ''}`}>
      {/* Кнопка открытия */}
      <button
        className="ai-chat-widget__toggle"
        onClick={toggleOpen}
        title={isOpen ? 'Закрыть консультанта' : 'AI Консультант'}
      >
        {isOpen ? '✕' : '💬'}
      </button>

      {/* Окно чата */}
      {isOpen && (
        <div className="ai-chat-widget__window">
          {/* Заголовок */}
          <div className="ai-chat-widget__header">
            <span className="ai-chat-widget__title">
              🤖 AI Консультант
            </span>
            <button
              className="ai-chat-widget__clear"
              onClick={clearMessages}
              title="Очистить историю"
            >
              🗑️
            </button>
          </div>

          {/* Контекст оборудования */}
          {equipmentContext && (
            <div className="ai-chat-widget__context">
              <div className="ai-chat-widget__context-info">
                <span className="ai-chat-widget__context-icon">🔧</span>
                <span className="ai-chat-widget__context-text">
                  {equipmentContext.name} ({equipmentContext.type})
                </span>
              </div>
              <button
                className="ai-chat-widget__context-clear"
                onClick={handleClearContext}
                title="Сбросить контекст"
              >
                ✕
              </button>
            </div>
          )}

          {/* Сообщения */}
          <div className="ai-chat-widget__messages">
            {messages.length === 0 && (
              <div className="ai-chat-widget__welcome">
                <p>👋 Привет! Я AI-консультант по оборудованию.</p>
                <p>Вы можете спросить меня:</p>
                <ul>
                  <li>«Покажи список оборудования»</li>
                  <li>«Найди фильтр обезжелезивания»</li>
                  <li>«Покажи журнал обслуживания котла»</li>
                  <li>«Добавь запись о ремонте»</li>
                  <li>«Прочитай инструкцию к насосу»</li>
                </ul>
              </div>
            )}

            {messages.map((msg, index) => (
              <ChatMessage key={index} role={msg.role} content={msg.content} />
            ))}

            {isLoading && (
              <div className="ai-chat-widget__loading">
                <span className="ai-chat-widget__loading-dots">
                  <span>.</span><span>.</span><span>.</span>
                </span>
                Думаю...
              </div>
            )}

            {error && (
              <div className="ai-chat-widget__error">
                ❌ {error}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Поле ввода */}
          <ChatInput
            onSend={sendMessage}
            isLoading={isLoading}
            voiceTranscript={transcript}
            onVoiceTranscriptUsed={handleVoiceTranscriptUsed}
            onQRScanClick={handleQRScanClick}
          />
        </div>
      )}

      {/* QR-сканер */}
      <QRScanner
        isOpen={isQRScannerOpen}
        onScanSuccess={handleQRScanSuccess}
        onClose={() => setIsQRScannerOpen(false)}
      />
    </div>
  );
};