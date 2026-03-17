import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/shared/config/supabase';
import './BeliotCountersSupabase.css';

type DeviceRole = 'source' | 'production' | 'domestic' | null;

interface DeviceRow {
  device_id: string;
  name: string | null;
  object_name: string | null;
  device_role: DeviceRole;
}

interface LastReadingRow {
  device_id: string;
  reading_date: string;
  reading_value: number;
  unit: string | null;
}

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

export default function BeliotCountersSupabase(): React.ReactElement {
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [lastReadings, setLastReadings] = useState<Record<string, LastReadingRow>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Список счётчиков и их роли/названия храним в Supabase (ручные правки + sync overrides).
      const { data: devs, error: devsError } = await supabase
        .from('beliot_device_overrides')
        .select('device_id, name, object_name, device_role')
        .order('object_name', { ascending: true });

      if (devsError) {
        throw new Error(devsError.message);
      }

      const normalized: DeviceRow[] = (devs || []).map((d: any) => ({
        device_id: String(d.device_id),
        name: d.name ?? null,
        object_name: d.object_name ?? null,
        device_role: (d.device_role ?? null) as DeviceRole,
      }));

      setDevices(normalized);

      // Если устройств нет — не дергаем readings.
      if (normalized.length === 0) {
        setLastReadings({});
        return;
      }

      // Получаем последние показания одним запросом и выбираем первое (самое свежее) на устройство.
      // Берём небольшую "дельту" записей на устройство, чтобы не упереться в лимиты.
      const ids = normalized.map(d => d.device_id);
      const { data: readings, error: readingsError } = await supabase
        .from('beliot_device_readings')
        .select('device_id, reading_date, reading_value, unit')
        .in('device_id', ids)
        .order('reading_date', { ascending: false })
        .limit(Math.min(ids.length * 5, 500));

      if (readingsError) {
        throw new Error(readingsError.message);
      }

      const byId: Record<string, LastReadingRow> = {};
      for (const r of readings || []) {
        const id = String((r as any).device_id);
        if (!byId[id]) {
          byId[id] = {
            device_id: id,
            reading_date: String((r as any).reading_date),
            reading_value: Number((r as any).reading_value),
            unit: (r as any).unit ?? null,
          };
        }
      }
      setLastReadings(byId);
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить данные из Supabase');
      setDevices([]);
      setLastReadings({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="beliot-counters">
      <div className="beliot-counters__header">
        <div>
          <div className="beliot-counters__title">Счётчики воды</div>
          <div className="beliot-counters__subtitle">
            Источник данных: Supabase (обновляется GitHub Actions каждый час)
          </div>
        </div>
        <button type="button" className="beliot-counters__reload" onClick={() => void load()} disabled={loading}>
          Обновить
        </button>
      </div>

      {error && <div className="beliot-counters__error">Ошибка: {error}</div>}

      {loading ? (
        <div className="beliot-counters__loading">Загрузка…</div>
      ) : devices.length === 0 ? (
        <div className="beliot-counters__empty">
          В `beliot_device_overrides` нет устройств. Добавьте `device_id` и (опционально) `object_name/device_role`.
        </div>
      ) : (
        <div className="beliot-counters__tableWrap">
          <table className="beliot-counters__table">
            <thead>
              <tr>
                <th>Объект</th>
                <th>Имя</th>
                <th>Роль</th>
                <th>ID</th>
                <th>Последнее показание</th>
                <th>Дата</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => {
                const last = lastReadings[d.device_id];
                const displayName = d.object_name || d.name || d.device_id;
                return (
                  <tr key={d.device_id}>
                    <td>{d.object_name || '—'}</td>
                    <td>{displayName}</td>
                    <td>{d.device_role || '—'}</td>
                    <td className="beliot-counters__mono">{d.device_id}</td>
                    <td>
                      {last
                        ? `${last.reading_value}${last.unit ? ` ${last.unit}` : ''}`
                        : '—'}
                    </td>
                    <td>{last ? formatDateTime(last.reading_date) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && devices.length > 0 && (
        <div className="beliot-counters__note">
          Если показания не обновляются, проверьте статус workflow `Sync Beliot Readings` в GitHub Actions и наличие записей в `beliot_device_readings`.
        </div>
      )}
    </div>
  );
}

