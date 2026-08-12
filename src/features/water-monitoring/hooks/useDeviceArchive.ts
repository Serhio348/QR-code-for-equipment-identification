/**
 * useDeviceArchive
 *
 * Инкапсулирует всё, что связано с архивом показаний одного счётчика:
 * - управление состоянием (даты, группировка, страница, режим отображения)
 * - загрузку данных через useBeliotDeviceReadings (запрос с календарного дня до начала периода,
 *   чтобы объём за первый день считался от показания предыдущего дня)
 * - группировку и вычисление объёмов потребления
 * - подготовку данных для графика (fullChartData)
 * - пагинацию таблицы
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useBeliotDeviceReadings } from './useBeliotDeviceReadings';
import type { BeliotDeviceReading } from '../services/supabaseBeliotReadingsApi';
import { getBeliotArchiveVolumeOverride } from '../constants/beliotDeviceRegistry';

export type ArchiveGroupBy = 'hour' | 'day' | 'week' | 'month' | 'year';
export type ArchiveViewType = 'readings' | 'volume';
export type ArchiveDisplayMode = 'table' | 'chart';

/** Элемент сгруппированного архива */
export interface GroupedReading {
  groupKey: string;
  groupDate: Date;
  reading?: BeliotDeviceReading;
  /** true — значение перенесено из последней известной точки (carry-forward) */
  isEstimated?: boolean;
  consumption: number;
}

/** Точка данных для графика */
export interface ArchiveChartPoint {
  date: string;
  fullDate: string;
  reading: number;
  volume: number;
  hasData: boolean;
  index: number;
}

const ARCHIVE_DATA_LIMIT = 50_000;

/** Календарный день YYYY-MM-DD в Europe/Moscow (как beliot_daily_readings_agg и UI Beliot). */
function moscowYmd(dateInput: string | Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(dateInput));
}

/**
 * Границы календарных дат YYYY-MM-DD в Europe/Moscow → ISO для Supabase.
 * Явный +03:00 (Москва без DST), чтобы конец «31.07» всегда включал вечерние точки 23:xx.
 */
function localYmdBoundsToIso(startYmd: string, endYmd: string): { startIso: string; endIso: string } {
  const start = new Date(`${startYmd}T00:00:00+03:00`);
  const end = new Date(`${endYmd}T23:59:59.999+03:00`);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/** Предыдущий календарный день YYYY-MM-DD (календарь Europe/Moscow). */
function previousCalendarDayYmd(ymd: string): string {
  const noonMsk = new Date(`${ymd}T12:00:00+03:00`);
  noonMsk.setTime(noonMsk.getTime() - 24 * 60 * 60 * 1000);
  return moscowYmd(noonMsk);
}

/**
 * Границы запроса в Supabase: на один день раньше archiveStart — иначе объём за первый день
 * периода (и первый час) считается от «предыдущего показания того же дня» и даёт 0.
 * Строки таблицы по-прежнему строятся только от archiveStart (см. groupReadings).
 */
function archiveFetchRangeIso(archiveStartYmd: string, archiveEndYmd: string): { fetchStartIso: string; fetchEndIso: string } {
  const prevYmd = previousCalendarDayYmd(archiveStartYmd);
  const fetchStartIso = localYmdBoundsToIso(prevYmd, prevYmd).startIso;
  const fetchEndIso = localYmdBoundsToIso(archiveEndYmd, archiveEndYmd).endIso;
  return { fetchStartIso, fetchEndIso };
}

function todayStr(): string {
  return moscowYmd(new Date());
}

function monthStartStr(): string {
  const today = moscowYmd(new Date());
  return `${today.slice(0, 8)}01`;
}

function pickLatestReading(readings: BeliotDeviceReading[]): BeliotDeviceReading | undefined {
  let latest: BeliotDeviceReading | undefined;
  for (const reading of readings) {
    if (!latest) {
      latest = reading;
      continue;
    }
    if (new Date(reading.reading_date).getTime() > new Date(latest.reading_date).getTime()) {
      latest = reading;
    }
  }
  return latest;
}

export function useDeviceArchive(deviceId: string | null) {
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [archiveViewType, setArchiveViewType] = useState<ArchiveViewType>('readings');
  const [archiveDisplayMode, setArchiveDisplayMode] = useState<ArchiveDisplayMode>('table');
  const [archiveGroupBy, setArchiveGroupBy] = useState<ArchiveGroupBy>('hour');
  const [archiveDataLoaded, setArchiveDataLoaded] = useState(false);
  const [archiveCurrentPage, setArchiveCurrentPage] = useState(1);
  const [archivePageSize, setArchivePageSize] = useState(10);
  const [archiveStartDate, setArchiveStartDate] = useState(monthStartStr);
  const [archiveEndDate, setArchiveEndDate] = useState(todayStr);
  const [isArchiveSettingsCollapsed, setIsArchiveSettingsCollapsed] = useState(false);

  // ─── Загрузка данных ──────────────────────────────────────────────────────
  // ВАЖНО: передаём deviceId напрямую (не через условие), чтобы loadByPeriod
  // всегда замыкался над реальным deviceId, а не null.
  // autoLoad: false гарантирует, что данные не загружаются автоматически.

  const {
    readings: archiveReadingsRaw,
    loading: archiveLoading,
    error: archiveError,
    refresh: refreshArchive,
    loadByPeriod,
  } = useBeliotDeviceReadings(deviceId, {
    reading_type: 'hourly',
    limit: ARCHIVE_DATA_LIMIT,
    autoLoad: false,
  });

  // ─── Callbacks ────────────────────────────────────────────────────────────

  // Группировка — только клиентское представление уже загруженных hourly-данных.
  // Период дат не трогаем: иначе при смене «по часам/дням/…» сбрасывается выбранный диапазон.
  const handleGroupByChange = useCallback((newGroupBy: ArchiveGroupBy) => {
    setArchiveGroupBy(newGroupBy);
  }, []);

  const handleLoadArchiveData = useCallback(async () => {
    if (!deviceId || !archiveStartDate || !archiveEndDate) return;

    const { fetchStartIso, fetchEndIso } = archiveFetchRangeIso(archiveStartDate, archiveEndDate);

    try {
      if (loadByPeriod) {
        await loadByPeriod(fetchStartIso, fetchEndIso);
      } else {
        await refreshArchive();
      }
      setArchiveDataLoaded(true);
      // Сворачиваем настройки только по явному «Обновить данные», не при автозагрузке
      setIsArchiveSettingsCollapsed(true);
    } catch {
      setArchiveDataLoaded(false);
    }
  }, [deviceId, archiveStartDate, archiveEndDate, loadByPeriod, refreshArchive]);

  // ─── Группировка показаний ────────────────────────────────────────────────

  const groupReadings = useCallback((
    readings: BeliotDeviceReading[],
    groupBy: ArchiveGroupBy,
    startDate: string,
    endDate: string,
  ): GroupedReading[] => {
    if (!readings) readings = [];

    const start = new Date(startDate);
    const end = new Date(endDate);

    const grouped = new Map<string, BeliotDeviceReading[]>();

    readings.forEach((reading) => {
      const date = new Date(reading.reading_date);
      let key: string;

      switch (groupBy) {
        case 'hour': {
          // Часовой ключ в Europe/Moscow — совпадает с beliot / календарём объекта
          const day = moscowYmd(date);
          const hour = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Europe/Moscow',
            hour: '2-digit',
            hour12: false,
          }).format(date).padStart(2, '0');
          key = `${day} ${hour}:00`;
          break;
        }
        case 'day':
          key = moscowYmd(date);
          break;
        case 'week': {
          const day = moscowYmd(date);
          const [y, m, d] = day.split('-').map(Number);
          const weekOfMonth = Math.ceil(d / 7);
          key = `${y}-${String(m).padStart(2, '0')}-W${weekOfMonth}`;
          break;
        }
        case 'month': {
          const day = moscowYmd(date);
          key = day.slice(0, 7);
          break;
        }
        case 'year':
          key = moscowYmd(date).slice(0, 4);
          break;
        default:
          key = date.toISOString();
      }

      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(reading);
    });

    // Для часов: до последнего часа с данными; для остального — весь диапазон
    let effectiveEnd = end;
    if (groupBy === 'hour' && readings.length > 0) {
      const maxDate = new Date(Math.max(...readings.map(r => new Date(r.reading_date).getTime())));
      // Срез до начала часа по Москве
      const maxDay = moscowYmd(maxDate);
      const maxHour = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Moscow',
        hour: '2-digit',
        hour12: false,
      }).format(maxDate).padStart(2, '0');
      effectiveEnd = new Date(`${maxDay}T${maxHour}:00:00+03:00`);
    }

    const allPeriods: GroupedReading[] = [];
    const current = new Date(start);
    let lastKnownReading: BeliotDeviceReading | undefined;

    while (current <= effectiveEnd) {
      let key: string;
      let periodDate: Date;

      switch (groupBy) {
        case 'hour': {
          const day = moscowYmd(current);
          const hour = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Europe/Moscow',
            hour: '2-digit',
            hour12: false,
          }).format(current).padStart(2, '0');
          key = `${day} ${hour}:00`;
          periodDate = new Date(`${day}T${hour}:00:00+03:00`);
          current.setTime(current.getTime() + 60 * 60 * 1000);
          break;
        }
        case 'day': {
          key = moscowYmd(current);
          periodDate = new Date(`${key}T00:00:00+03:00`);
          current.setTime(periodDate.getTime() + 24 * 60 * 60 * 1000);
          break;
        }
        case 'week': {
          const day = moscowYmd(current);
          const [y, m, d] = day.split('-').map(Number);
          const weekOfMonth = Math.ceil(d / 7);
          key = `${y}-${String(m).padStart(2, '0')}-W${weekOfMonth}`;
          periodDate = new Date(`${day}T00:00:00+03:00`);
          current.setTime(current.getTime() + 7 * 24 * 60 * 60 * 1000);
          break;
        }
        case 'month': {
          const day = moscowYmd(current);
          key = day.slice(0, 7);
          periodDate = new Date(`${key}-01T00:00:00+03:00`);
          const [y, m] = key.split('-').map(Number);
          if (m === 12) {
            current.setTime(new Date(`${y + 1}-01-01T00:00:00+03:00`).getTime());
          } else {
            current.setTime(new Date(`${y}-${String(m + 1).padStart(2, '0')}-01T00:00:00+03:00`).getTime());
          }
          break;
        }
        case 'year': {
          key = moscowYmd(current).slice(0, 4);
          periodDate = new Date(`${key}-01-01T00:00:00+03:00`);
          current.setTime(new Date(`${Number(key) + 1}-01-01T00:00:00+03:00`).getTime());
          break;
        }
        default:
          key = current.toISOString();
          periodDate = new Date(current);
          current.setTime(current.getTime() + 60 * 60 * 1000);
      }

      const periodReadings = grouped.get(key) || [];
      const realReading = pickLatestReading(periodReadings);

      let consumption = 0;
      if (periodReadings.length > 1 && realReading) {
        const sortedAsc = [...periodReadings].sort(
          (a, b) => new Date(a.reading_date).getTime() - new Date(b.reading_date).getTime(),
        );
        const first = Number(sortedAsc[0].reading_value);
        const last = Number(realReading.reading_value);
        if (!isNaN(first) && !isNaN(last)) {
          consumption = Math.max(0, last - first);
        }
      }

      const readingToUse =
        realReading
          ? realReading
          : (groupBy === 'hour' ? lastKnownReading : undefined);

      const isEstimated = Boolean(!realReading && readingToUse);
      if (groupBy === 'hour' && realReading) {
        lastKnownReading = realReading;
      }

      allPeriods.push({
        groupKey: key,
        groupDate: periodDate,
        reading: readingToUse,
        isEstimated,
        consumption,
      });
    }

    // Если для почасовой сетки первые часы до первой реальной точки пустые,
    // заполняем их "ближайшим следующим" значением, чтобы в таблице не было прочерков.
    if (groupBy === 'hour') {
      let nextKnown: BeliotDeviceReading | undefined;
      for (let i = allPeriods.length - 1; i >= 0; i--) {
        const item = allPeriods[i];
        if (item.reading && !item.isEstimated) {
          nextKnown = item.reading;
          continue;
        }
        if (nextKnown && (!item.reading || item.isEstimated)) {
          allPeriods[i] = {
            ...item,
            reading: nextKnown,
            isEstimated: true,
          };
        }
      }
    }

    return allPeriods;
  }, []);

  // ─── Сгруппированные показания ────────────────────────────────────────────

  const archiveReadings = useMemo((): GroupedReading[] => {
    if (!archiveStartDate || !archiveEndDate) return [];
    const { startIso, endIso } = localYmdBoundsToIso(archiveStartDate, archiveEndDate);
    return groupReadings(archiveReadingsRaw, archiveGroupBy, startIso, endIso);
  }, [archiveReadingsRaw, archiveGroupBy, archiveStartDate, archiveEndDate, groupReadings]);

  // ─── Данные для графика ───────────────────────────────────────────────────

  const fullChartData = useMemo((): ArchiveChartPoint[] => {
    if (!archiveReadings.length || !archiveReadingsRaw) return [];

    return archiveReadings.map((groupedReading, index) => {
      const readingDate = groupedReading.groupDate;
      const hasReading = !!groupedReading.reading;
      const hasRealData = hasReading && !groupedReading.isEstimated;

      let dateLabel = '';
      switch (archiveGroupBy) {
        case 'hour':
          dateLabel = readingDate.toLocaleString('ru-RU', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
          break;
        case 'day':
          dateLabel = readingDate.toLocaleDateString('ru-RU', { month: '2-digit', day: '2-digit' });
          break;
        case 'week': {
          const weekNum = Math.ceil(readingDate.getDate() / 7);
          const monthYear = readingDate.toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' });
          dateLabel = `Н${weekNum}, ${monthYear}`;
          break;
        }
        case 'month':
          dateLabel = readingDate.toLocaleDateString('ru-RU', { month: 'short' });
          break;
        case 'year':
          dateLabel = readingDate.getFullYear().toString();
          break;
      }

      let readingValue = 0;
      let volume = 0;

      if (hasReading && groupedReading.reading) {
        readingValue = Number(groupedReading.reading.reading_value) || 0;

        if (archiveViewType === 'volume') {
          volume = computeArchivePeriodVolume(
            groupedReading,
            index,
            archiveGroupBy,
            archiveReadings,
            archiveReadingsRaw,
          );
        }
      }

      return {
        date: dateLabel,
        fullDate: readingDate.toISOString(),
        reading: readingValue,
        volume,
        hasData: hasRealData,
        index,
      };
    }).reverse();
  }, [archiveReadings, archiveGroupBy, archiveViewType, archiveReadingsRaw]);

  // ─── Пагинация ────────────────────────────────────────────────────────────
  // Таблица показывает свежие данные сверху (reversed), график — хронологически

  const archiveReadingsDesc = useMemo(
    () => [...archiveReadings].reverse(),
    [archiveReadings],
  );

  const archiveTotalPages = Math.ceil(archiveReadings.length / archivePageSize);
  const archiveStartIndex = (archiveCurrentPage - 1) * archivePageSize;
  const archiveEndIndex = archiveStartIndex + archivePageSize;
  const archiveDisplayedReadings = archiveReadingsDesc.slice(archiveStartIndex, archiveEndIndex);

  const handlePreviousPage = useCallback(() => {
    setArchiveCurrentPage(p => Math.max(1, p - 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setArchiveCurrentPage(p => Math.min(archiveTotalPages, p + 1));
  }, [archiveTotalPages]);

  // ─── Effects ──────────────────────────────────────────────────────────────

  // Сброс страницы при смене группировки или загрузке
  useEffect(() => {
    setArchiveCurrentPage(1);
  }, [archiveGroupBy, archiveDataLoaded]);

  // Автозагрузка при открытии модалки, смене счётчика или периода.
  // Группировку не включаем: она считается на клиенте и не должна дергать сеть / сворачивать настройки.
  // Не сворачиваем панель настроек здесь — иначе после выбора даты в календаре настройки сразу прячутся.
  useEffect(() => {
    if (!isArchiveOpen || !deviceId || !archiveStartDate || !archiveEndDate) return;

    let cancelled = false;
    const { fetchStartIso, fetchEndIso } = archiveFetchRangeIso(archiveStartDate, archiveEndDate);

    void (async () => {
      try {
        if (loadByPeriod) {
          await loadByPeriod(fetchStartIso, fetchEndIso);
        } else {
          await refreshArchive();
        }
        if (!cancelled) {
          setArchiveDataLoaded(true);
        }
      } catch {
        if (!cancelled) setArchiveDataLoaded(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isArchiveOpen, deviceId, archiveStartDate, archiveEndDate, loadByPeriod, refreshArchive]);

  // Оформление страницы и сброс «загружено» только при закрытии
  useEffect(() => {
    if (isArchiveOpen) {
      setArchiveCurrentPage(1);
      setIsArchiveSettingsCollapsed(false);
      document.body.classList.add('archive-modal-open');
      return;
    }
    setArchiveDataLoaded(false);
    document.body.classList.remove('archive-modal-open');
  }, [isArchiveOpen]);

  return {
    // Состояние
    isArchiveOpen, setIsArchiveOpen,
    archiveViewType, setArchiveViewType,
    archiveDisplayMode, setArchiveDisplayMode,
    archiveGroupBy,
    archiveDataLoaded, setArchiveDataLoaded,
    archiveCurrentPage,
    archivePageSize, setArchivePageSize,
    archiveStartDate, setArchiveStartDate,
    archiveEndDate, setArchiveEndDate,
    isArchiveSettingsCollapsed, setIsArchiveSettingsCollapsed,
    // Данные
    archiveReadingsRaw,
    archiveReadings,
    fullChartData,
    archiveLoading,
    archiveError,
    refreshArchive,
    // Пагинация
    archiveTotalPages,
    archiveStartIndex,
    archiveEndIndex,
    archiveDisplayedReadings,
    // Обработчики
    handleGroupByChange,
    handleLoadArchiveData,
    handlePreviousPage,
    handleNextPage,
  };
}

/**
 * Объём за период = показание периода − предыдущее известное показание.
 * Как в Beliot («Показать расход») и как ручная разность колонки «Показания»:
 * last[период] − last[предыдущий период], а не сумма часовых дельт внутри дня
 * (иначе теряется ночной расход до первого часового замера → недоучёт).
 *
 * @param ascendingIndex — индекс в archiveReadingsAsc (хронологический порядок)
 */
export function computeArchivePeriodVolume(
  groupedReading: GroupedReading,
  ascendingIndex: number,
  groupBy: ArchiveGroupBy,
  archiveReadingsAsc: GroupedReading[],
  rawReadings: BeliotDeviceReading[],
): number {
  if (!groupedReading.reading) return 0;

  if (groupBy === 'day') {
    const volumeOverride = getBeliotArchiveVolumeOverride(
      groupedReading.reading.device_id,
      groupedReading.groupKey,
    );
    if (volumeOverride !== null) return volumeOverride;
  }

  const current = Number(groupedReading.reading.reading_value);
  if (isNaN(current)) return 0;

  for (let i = ascendingIndex - 1; i >= 0; i--) {
    const prev = archiveReadingsAsc[i];
    if (!prev?.reading) continue;
    const previous = Number(prev.reading.reading_value);
    if (isNaN(previous)) return 0;
    return Math.max(0, current - previous);
  }

  // Первый период выбранного диапазона: база из raw (запрос тянет день до archiveStart)
  const periodStartMs = groupedReading.groupDate.getTime();
  let baseline: BeliotDeviceReading | undefined;
  for (const r of rawReadings) {
    if (new Date(r.reading_date).getTime() >= periodStartMs) continue;
    if (!baseline || new Date(r.reading_date).getTime() > new Date(baseline.reading_date).getTime()) {
      baseline = r;
    }
  }
  if (baseline) {
    const previous = Number(baseline.reading_value);
    if (!isNaN(previous)) return Math.max(0, current - previous);
  }

  return 0;
}
