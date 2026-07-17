import { useEffect, useState } from 'react';
import type {
  BeliotDeviceRole,
  BeliotRegistryDevice,
  DeviceTrackingStatus,
} from '../types/beliotDeviceRegistry';
import './DeviceRegistryTable.css';

interface DeviceRegistryTableProps {
  devices: BeliotRegistryDevice[];
  selectedIds: Set<string>;
  busy: boolean;
  onSelectionChange: (deviceId: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  onTrackingChange: (deviceId: string, status: DeviceTrackingStatus) => void;
  onConfigurationChange: (
    deviceId: string,
    configuration: { name: string; group: string; role: BeliotDeviceRole | null },
  ) => Promise<boolean>;
}

const TRACKING_LABELS: Record<DeviceTrackingStatus, string> = {
  discovered: 'Новый',
  tracked: 'Отслеживается',
  ignored: 'Игнорируется',
  retired: 'Выведен',
};

function formatReading(device: BeliotRegistryDevice): string {
  if (!device.lastReading) {
    return '—';
  }

  const value = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 })
    .format(device.lastReading.value);
  const date = new Date(device.lastReading.recordedAt).toLocaleString('ru-RU');
  return `${value} ${device.lastReading.unit} · ${date}`;
}

interface DeviceRegistryRowProps {
  device: BeliotRegistryDevice;
  selected: boolean;
  busy: boolean;
  onSelectionChange: (deviceId: string, selected: boolean) => void;
  onTrackingChange: (deviceId: string, status: DeviceTrackingStatus) => void;
  onConfigurationChange: DeviceRegistryTableProps['onConfigurationChange'];
}

function DeviceRegistryRow({
  device,
  selected,
  busy,
  onSelectionChange,
  onTrackingChange,
  onConfigurationChange,
}: DeviceRegistryRowProps): React.ReactElement {
  const [name, setName] = useState(device.name ?? '');
  const [group, setGroup] = useState(device.user?.group ?? '');
  const [role, setRole] = useState<BeliotDeviceRole | ''>(device.user?.role ?? '');

  useEffect(() => {
    setName(device.name ?? '');
    setGroup(device.user?.group ?? '');
    setRole(device.user?.role ?? '');
  }, [device]);

  const hasRole = Boolean(device.user?.role);
  const disabledTitle = hasRole ? undefined : 'Для отслеживания сначала назначьте роль';

  return (
    <tr>
      <td className="device-registry-table__check" data-label="Выбор">
        <input
          type="checkbox"
          checked={selected}
          onChange={(event) => onSelectionChange(device.id, event.target.checked)}
          aria-label={`Выбрать ${device.name ?? device.providerDeviceId}`}
          disabled={busy}
          title={disabledTitle}
        />
      </td>
      <td data-label="Счётчик">
        <strong>{device.name ?? 'Без названия'}</strong>
        <small>{device.serialNumber ?? device.providerDeviceId}</small>
      </td>
      <td data-label="Провайдер">
        <span className="device-badge device-badge--provider">{device.provider}</span>
        <small>{device.providerStatus === 'missing' ? 'Не найден' : 'Доступен'}</small>
      </td>
      <td data-label="Настройка">
        <input
          value={name}
          onChange={event => setName(event.target.value)}
          placeholder="Название"
          disabled={busy}
          aria-label={`Название ${device.providerDeviceId}`}
        />
        <input
          value={group}
          onChange={event => setGroup(event.target.value)}
          placeholder="Группа"
          disabled={busy}
          aria-label={`Группа ${device.providerDeviceId}`}
        />
        <select
          value={role}
          onChange={event => setRole(event.target.value as BeliotDeviceRole | '')}
          disabled={busy}
          aria-label={`Роль ${device.providerDeviceId}`}
        >
          <option value="">Роль не назначена</option>
          <option value="source">Источник</option>
          <option value="production">Производство</option>
          <option value="domestic">Хозбыт</option>
        </select>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onConfigurationChange(device.id, {
            name,
            group,
            role: role || null,
          })}
        >
          Сохранить
        </button>
      </td>
      <td data-label="Последнее показание">{formatReading(device)}</td>
      <td data-label="Отслеживание">
        <span className={`device-badge device-badge--${device.trackingStatus}`}>
          {TRACKING_LABELS[device.trackingStatus]}
        </span>
        <select
          value={device.trackingStatus}
          onChange={(event) => onTrackingChange(
            device.id,
            event.target.value as DeviceTrackingStatus,
          )}
          disabled={busy}
          title={disabledTitle}
          aria-label={`Статус отслеживания ${device.name ?? device.providerDeviceId}`}
        >
          <option value="discovered">Новый</option>
          <option value="tracked">Отслеживать</option>
          <option value="ignored">Игнорировать</option>
          <option value="retired">Вывести из эксплуатации</option>
        </select>
      </td>
    </tr>
  );
}

export function DeviceRegistryTable({
  devices,
  selectedIds,
  busy,
  onSelectionChange,
  onSelectAll,
  onTrackingChange,
  onConfigurationChange,
}: DeviceRegistryTableProps): React.ReactElement {
  const selectableDevices = devices;
  const allSelected = selectableDevices.length > 0
    && selectableDevices.every((device) => selectedIds.has(device.id));

  if (devices.length === 0) {
    return (
      <div className="device-registry-table__empty">
        <strong>Счётчики не найдены</strong>
        <span>Измените фильтры или запустите сканирование.</span>
      </div>
    );
  }

  return (
    <div className="device-registry-table__wrapper">
      <table className="device-registry-table">
        <thead>
          <tr>
            <th className="device-registry-table__check">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(event) => onSelectAll(event.target.checked)}
                aria-label="Выбрать все доступные счётчики на странице"
                disabled={selectableDevices.length === 0 || busy}
              />
            </th>
            <th>Счётчик</th>
            <th>Провайдер</th>
            <th>Пользователь</th>
            <th>Последнее показание</th>
            <th>Отслеживание</th>
          </tr>
        </thead>
        <tbody>
          {devices.map(device => (
            <DeviceRegistryRow
              key={device.id}
              device={device}
              selected={selectedIds.has(device.id)}
              busy={busy}
              onSelectionChange={onSelectionChange}
              onTrackingChange={onTrackingChange}
              onConfigurationChange={onConfigurationChange}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
