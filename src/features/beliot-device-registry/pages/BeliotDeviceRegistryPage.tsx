import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LoadingSpinner from '@/features/common/components/LoadingSpinner';
import { ROUTES } from '@/shared/utils/routes';
import { DeviceRegistryTable } from '../components/DeviceRegistryTable';
import { RegistryFilters } from '../components/RegistryFilters';
import { RegistrySummary } from '../components/RegistrySummary';
import { useBeliotDeviceRegistry } from '../hooks/useBeliotDeviceRegistry';
import type { DeviceTrackingStatus } from '../types/beliotDeviceRegistry';
import './BeliotDeviceRegistryPage.css';

export default function BeliotDeviceRegistryPage(): React.ReactElement {
  const navigate = useNavigate();
  const registry = useBeliotDeviceRegistry();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const devices = useMemo(() => registry.data?.devices ?? [], [registry.data]);
  const scanRunning = registry.scan?.status === 'queued' || registry.scan?.status === 'running';

  useEffect(() => {
    const visibleIds = new Set(devices.map((device) => device.id));
    setSelectedIds((current) => new Set([...current].filter((id) => visibleIds.has(id))));
  }, [devices]);

  const handleSelectionChange = (deviceId: string, selected: boolean): void => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (selected) {
        next.add(deviceId);
      } else {
        next.delete(deviceId);
      }
      return next;
    });
  };

  const handleSelectAll = (selected: boolean): void => {
    setSelectedIds(selected
      ? new Set(devices.map((device) => device.id))
      : new Set());
  };

  const handleBulkUpdate = async (status: DeviceTrackingStatus): Promise<void> => {
    const updated = await registry.updateBulkTracking([...selectedIds], status);
    if (updated) {
      setSelectedIds(new Set());
    }
  };

  if (registry.loading && !registry.data) {
    return <LoadingSpinner fullScreen text="Загрузка реестра Beliot..." />;
  }

  return (
    <div className="beliot-registry-page">
      <div className="beliot-registry-page__container">
        <header className="beliot-registry-page__header">
          <div>
            <button
              type="button"
              className="beliot-registry-page__back"
              onClick={() => navigate(ROUTES.HOME)}
            >
              ← Назад к главному меню
            </button>
            <h1>Счётчики Beliot</h1>
            <p>Реестр обнаруженных устройств и управление их отслеживанием</p>
          </div>
          <button
            type="button"
            className="beliot-registry-page__scan"
            onClick={() => void registry.startScan()}
            disabled={registry.actionLoading || scanRunning}
          >
            {scanRunning ? 'Сканирование…' : 'Запустить сканирование'}
          </button>
        </header>

        {registry.error && (
          <div className="beliot-registry-page__error" role="alert">
            <span>{registry.error}</span>
            <button type="button" onClick={() => void registry.reload()}>Повторить</button>
          </div>
        )}

        {registry.data && (
          <RegistrySummary summary={registry.data.summary} scan={registry.scan} />
        )}

        <RegistryFilters
          filters={registry.filters}
          selectedCount={selectedIds.size}
          busy={registry.actionLoading}
          onSearchChange={registry.setSearch}
          onStatusChange={registry.setStatus}
          onBulkUpdate={(status) => void handleBulkUpdate(status)}
        />

        <div className="beliot-registry-page__table-area" aria-busy={registry.loading}>
          {registry.loading && <div className="beliot-registry-page__loading">Обновление списка…</div>}
          <DeviceRegistryTable
            devices={devices}
            selectedIds={selectedIds}
            busy={registry.actionLoading}
            onSelectionChange={handleSelectionChange}
            onSelectAll={handleSelectAll}
            onTrackingChange={(deviceId, status) => {
              void registry.updateTracking(deviceId, status);
            }}
            onConfigurationChange={registry.updateConfiguration}
          />
        </div>

        {registry.data && registry.data.pagination.totalPages > 1 && (
          <nav className="beliot-registry-page__pagination" aria-label="Пагинация реестра">
            <button
              type="button"
              disabled={registry.filters.page <= 1 || registry.loading}
              onClick={() => registry.setPage(registry.filters.page - 1)}
            >
              ← Назад
            </button>
            <span>
              Страница {registry.data.pagination.page} из {registry.data.pagination.totalPages}
              {' '}· Всего {registry.data.pagination.total}
            </span>
            <button
              type="button"
              disabled={
                registry.filters.page >= registry.data.pagination.totalPages || registry.loading
              }
              onClick={() => registry.setPage(registry.filters.page + 1)}
            >
              Вперёд →
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}
