import { useState } from 'react';
import type {
  ConfirmMeterReplacementInput,
  MeterReplacementEvent,
} from '../types/beliotDeviceRegistry';
import './ReplacementReviewPanel.css';

interface ReplacementReviewPanelProps {
  events: MeterReplacementEvent[];
  loading: boolean;
  busyEventId: string | null;
  error: string | null;
  onConfirm: (eventId: string, input: ConfirmMeterReplacementInput) => Promise<boolean>;
  onDismiss: (eventId: string, reason: string | null) => Promise<boolean>;
}

interface ReplacementCardProps {
  event: MeterReplacementEvent;
  busy: boolean;
  onConfirm: ReplacementReviewPanelProps['onConfirm'];
  onDismiss: ReplacementReviewPanelProps['onDismiss'];
}

function formatReading(value: number | null, date: string | null): string {
  if (value === null) return 'Нет данных';
  const formattedValue = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(value);
  const formattedDate = date ? new Date(date).toLocaleString('ru-RU') : 'дата неизвестна';
  return `${formattedValue} м³ · ${formattedDate}`;
}

function ReplacementCard({
  event,
  busy,
  onConfirm,
  onDismiss,
}: ReplacementCardProps): React.ReactElement {
  const [replacementDay, setReplacementDay] = useState(event.suggestedReplacementDay ?? '');
  const [serialNumber, setSerialNumber] = useState(
    event.providerSerialNumber ?? event.confirmedSerialNumber ?? '',
  );
  const [firstDayVolume, setFirstDayVolume] = useState('');
  const [reason, setReason] = useState('');

  const handleConfirm = async (): Promise<void> => {
    if (!replacementDay || !serialNumber.trim()) return;
    await onConfirm(event.id, {
      replacementDay,
      newSerialNumber: serialNumber.trim(),
      firstDayVolumeM3: firstDayVolume ? Number(firstDayVolume) : null,
      reason: reason.trim() || null,
    });
  };

  return (
    <article className="replacement-review-card">
      <div className="replacement-review-card__heading">
        <div>
          <strong>{event.deviceName ?? `Счётчик ${event.deviceId}`}</strong>
          <span>Beliot ID: {event.deviceId}</span>
        </div>
        <span className="replacement-review-card__source">
          {event.detectionSource === 'serial_mismatch'
            ? 'Не совпал заводской номер'
            : 'Обнаружен сброс показаний'}
        </span>
      </div>

      <div className="replacement-review-card__evidence">
        <div><span>До изменения</span><strong>{formatReading(event.oldReadingValue, event.oldReadingAt)}</strong></div>
        <div><span>После изменения</span><strong>{formatReading(event.newReadingValue, event.newReadingAt)}</strong></div>
        <div><span>Старый номер</span><strong>{event.oldSerialNumber ?? 'Не указан'}</strong></div>
        <div><span>Номер из Beliot</span><strong>{event.providerSerialNumber ?? 'Не передан'}</strong></div>
      </div>

      <div className="replacement-review-card__form">
        <label>
          Дата замены
          <input
            type="date"
            value={replacementDay}
            onChange={eventValue => setReplacementDay(eventValue.target.value)}
            disabled={busy}
            required
          />
        </label>
        <label>
          Новый заводской номер
          <input
            value={serialNumber}
            onChange={eventValue => setSerialNumber(eventValue.target.value)}
            disabled={busy}
            placeholder="Введите номер"
            required
          />
        </label>
        <label>
          Расход в день замены, м³
          <input
            type="number"
            min="0"
            step="0.001"
            value={firstDayVolume}
            onChange={eventValue => setFirstDayVolume(eventValue.target.value)}
            disabled={busy}
            placeholder="Необязательно"
          />
        </label>
        <label className="replacement-review-card__reason">
          Комментарий
          <textarea
            value={reason}
            onChange={eventValue => setReason(eventValue.target.value)}
            disabled={busy}
            placeholder="Причина замены или отклонения"
          />
        </label>
      </div>

      <div className="replacement-review-card__actions">
        <button
          type="button"
          className="replacement-review-card__confirm"
          disabled={busy || !replacementDay || !serialNumber.trim()}
          onClick={() => void handleConfirm()}
        >
          Подтвердить замену
        </button>
        <button
          type="button"
          className="replacement-review-card__dismiss"
          disabled={busy}
          onClick={() => void onDismiss(event.id, reason.trim() || null)}
        >
          Отклонить
        </button>
      </div>
    </article>
  );
}

export function ReplacementReviewPanel({
  events,
  loading,
  busyEventId,
  error,
  onConfirm,
  onDismiss,
}: ReplacementReviewPanelProps): React.ReactElement | null {
  if (!loading && events.length === 0 && !error) return null;

  return (
    <section className="replacement-review-panel" aria-label="Возможные замены счётчиков">
      <div className="replacement-review-panel__header">
        <div>
          <h2>Требуют подтверждения</h2>
          <p>Проверьте дату и заводской номер перед изменением расчётов.</p>
        </div>
        <strong>{events.length}</strong>
      </div>
      {error && <div className="replacement-review-panel__error" role="alert">{error}</div>}
      {loading && <div className="replacement-review-panel__loading">Загрузка событий…</div>}
      {!loading && events.map(event => (
        <ReplacementCard
          key={event.id}
          event={event}
          busy={busyEventId === event.id}
          onConfirm={onConfirm}
          onDismiss={onDismiss}
        />
      ))}
    </section>
  );
}
