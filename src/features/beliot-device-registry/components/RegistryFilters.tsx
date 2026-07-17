import type {
  BeliotDeviceFilters,
  DeviceTrackingStatus,
} from '../types/beliotDeviceRegistry';
import './RegistryFilters.css';

interface RegistryFiltersProps {
  filters: BeliotDeviceFilters;
  selectedCount: number;
  busy: boolean;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: BeliotDeviceFilters['status']) => void;
  onBulkUpdate: (status: DeviceTrackingStatus) => void;
}

export function RegistryFilters({
  filters,
  selectedCount,
  busy,
  onSearchChange,
  onStatusChange,
  onBulkUpdate,
}: RegistryFiltersProps): React.ReactElement {
  return (
    <section className="registry-filters" aria-label="Фильтры и массовые действия">
      <label className="registry-filters__search">
        <span className="registry-filters__label">Поиск</span>
        <input
          type="search"
          value={filters.search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Серийный номер, устройство или пользователь"
        />
      </label>

      <label>
        <span className="registry-filters__label">Статус</span>
        <select
          value={filters.status}
          onChange={(event) => onStatusChange(
            event.target.value as BeliotDeviceFilters['status'],
          )}
        >
          <option value="all">Все</option>
          <option value="discovered">Новые</option>
          <option value="tracked">Отслеживаются</option>
          <option value="ignored">Игнорируются</option>
          <option value="retired">Выведены</option>
        </select>
      </label>

      <div className="registry-filters__bulk">
        <span className="registry-filters__label">Выбрано: {selectedCount}</span>
        <div>
          <button
            type="button"
            disabled={selectedCount === 0 || busy}
            onClick={() => onBulkUpdate('tracked')}
          >
            Отслеживать
          </button>
          <button
            type="button"
            disabled={selectedCount === 0 || busy}
            onClick={() => onBulkUpdate('ignored')}
          >
            Игнорировать
          </button>
        </div>
      </div>
    </section>
  );
}
