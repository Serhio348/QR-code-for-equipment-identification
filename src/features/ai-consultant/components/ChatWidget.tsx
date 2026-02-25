import React, { useState, useRef, useEffect } from 'react';
import { useChat } from '../hooks/useChat';
import { useAlerts } from '../hooks/useAlerts';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import QRScanner from '../../common/components/QRScanner/QRScanner';
import { useEquipmentData } from '../../equipment/hooks/useEquipmentData';
import { logUserActivity } from '../../user-activity/services/activityLogsApi';
import { SET_WATER_CONTEXT_EVENT, type WaterDashboardContext } from '../events/chatEvents';
import type { Equipment } from '../../equipment/types/equipment';
import './ChatWidget.css';

interface ChatWidgetProps {
  initialOpen?: boolean;
}

export const ChatWidget: React.FC<ChatWidgetProps> = ({ initialOpen = false }) => {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);
  const [equipmentContext, setEquipmentContext] = useState<Equipment | null>(null);
  const [waterContext, setWaterContext] = useState<WaterDashboardContext | null>(null);
  const [alertsBannerDismissed, setAlertsBannerDismissed] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Преобразуем Equipment в EquipmentContext для передачи в хук
  const contextForChat = equipmentContext ? {
    id: equipmentContext.id,
    name: equipmentContext.name,
    type: equipmentContext.type,
    googleDriveUrl: equipmentContext.googleDriveUrl,
    maintenanceSheetId: equipmentContext.maintenanceSheetId,
  } : null;

  const { messages, isLoading, error, sendMessage, clearMessages } = useChat(contextForChat, waterContext);
  const { alerts } = useAlerts();
  const { transcript, resetTranscript } = useSpeechRecognition();
  const { data: equipmentListData } = useEquipmentData();

  // Слушаем событие установки контекста водного дашборда
  useEffect(() => {
    const handler = (e: Event) => {
      const ctx = (e as CustomEvent<WaterDashboardContext | null>).detail;
      setWaterContext(ctx);
    };
    window.addEventListener(SET_WATER_CONTEXT_EVENT, handler);
    return () => window.removeEventListener(SET_WATER_CONTEXT_EVENT, handler);
  }, []);

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
    console.log('[ChatWidget] Тип ID:', typeof equipmentId);

    // Ищем оборудование в списке
    const equipmentList = Array.isArray(equipmentListData) ? equipmentListData : [];
    console.log('[ChatWidget] Список оборудования:', equipmentList.length, 'записей');
    console.log('[ChatWidget] Первые 3 ID в списке:', equipmentList.slice(0, 3).map(eq => ({ id: eq.id, type: typeof eq.id, name: eq.name })));

    // Поддерживаем два варианта поиска:
    // 1. По обычному ID (UUID)
    // 2. По Google Drive ID (если отсканирован QR-код папки Drive)
    let foundEquipment: Equipment | undefined;

    if (equipmentId.startsWith('DRIVE:')) {
      // Извлекаем ID папки Drive
      const driveId = equipmentId.replace('DRIVE:', '');
      console.log('[ChatWidget] Поиск по Google Drive ID:', driveId);

      // Ищем по googleDriveUrl
      foundEquipment = equipmentList.find(eq =>
        eq.googleDriveUrl?.includes(driveId)
      );
    } else {
      // Ищем по обычному ID
      console.log('[ChatWidget] Поиск по ID оборудования:', equipmentId);
      foundEquipment = equipmentList.find(eq => eq.id === equipmentId);
    }

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

      // Формируем информативное сообщение об ошибке
      const errorMessage = equipmentId.startsWith('DRIVE:')
        ? `Оборудование с Google Drive папкой не найдено.\n\nВозможно, оборудование не создано в системе или QR-код указывает на неправильную папку.`
        : `Оборудование с ID "${equipmentId}" не найдено в списке.\n\nПроверьте, что оборудование создано в системе.`;

      alert(errorMessage);

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
        {!isOpen && alerts.total > 0 && (
          <span className={`ai-chat-widget__badge ${alerts.critical > 0 ? 'ai-chat-widget__badge--critical' : 'ai-chat-widget__badge--warning'}`}>
            {alerts.total}
          </span>
        )}
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

          {/* Баннер алертов по воде */}
          {alerts.total > 0 && !alertsBannerDismissed && (
            <div className={`ai-chat-widget__alerts-banner ${alerts.critical > 0 ? 'ai-chat-widget__alerts-banner--critical' : 'ai-chat-widget__alerts-banner--warning'}`}>
              <div className="ai-chat-widget__alerts-banner-body">
                <span className="ai-chat-widget__alerts-banner-icon">
                  {alerts.critical > 0 ? '🔴' : '🟡'}
                </span>
                <span className="ai-chat-widget__alerts-banner-text">
                  {alerts.critical > 0 && <strong>{alerts.critical} критич.</strong>}
                  {alerts.critical > 0 && alerts.warnings > 0 && ' · '}
                  {alerts.warnings > 0 && <span>{alerts.warnings} предупр.</span>}
                  {' — '}
                  {alerts.items[0]?.title}
                  {alerts.total > 1 && ` (+${alerts.total - 1})`}
                </span>
              </div>
              <div className="ai-chat-widget__alerts-banner-actions">
                <button
                  className="ai-chat-widget__alerts-banner-ask"
                  onClick={() => sendMessage({ text: 'Покажи все активные алерты по воде', photos: [] })}
                  title="Спросить AI об алертах"
                >
                  Подробнее
                </button>
                <button
                  className="ai-chat-widget__alerts-banner-close"
                  onClick={() => setAlertsBannerDismissed(true)}
                  title="Скрыть"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

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