import type {
  BeliotRegistrySummary,
  BeliotScanInfo,
} from '../types/beliotDeviceRegistry';
import './RegistrySummary.css';

interface RegistrySummaryProps {
  summary: BeliotRegistrySummary;
  scan: BeliotScanInfo | null;
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString('ru-RU') : 'ещё не выполнялось';
}

export function RegistrySummary({ summary, scan }: RegistrySummaryProps): React.ReactElement {
  const scanDate = scan?.finishedAt ?? scan?.startedAt ?? null;

  return (
    <section className="registry-summary" aria-label="Сводка реестра">
      <div className="registry-summary__counts">
        <div><strong>{summary.total}</strong><span>Всего</span></div>
        <div><strong>{summary.discovered}</strong><span>Новые</span></div>
        <div><strong>{summary.tracked}</strong><span>Отслеживаются</span></div>
        <div><strong>{summary.ignored}</strong><span>Игнорируются</span></div>
        <div><strong>{summary.retired}</strong><span>Выведены</span></div>
        <div><strong>{summary.missing}</strong><span>Не найдены</span></div>
      </div>
      <div className="registry-summary__scan">
        <span>Последнее сканирование</span>
        <strong>{formatDate(scanDate)}</strong>
        {scan && (
          <small>
            Статус: {scan.status}; найдено: {scan.discoveredCount}; обновлено: {scan.updatedCount}
          </small>
        )}
        {scan?.error && <small className="registry-summary__scan-error">{scan.error}</small>}
      </div>
    </section>
  );
}
