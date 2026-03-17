/**
 * useDeviceArchive
 *
 * Инкапсулирует всё, что связано с архивом показаний одного счётчика:
 * - управление состоянием (даты, группировка, страница, режим отображения)
 * - загрузку данных через useBeliotDeviceReadings
 * - группировку и вычисление объёмов потребления
 * - подготовку данных для графика (fullChartData)
 * - пагинацию таблицы
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useBeliotDeviceReadings } from './useBeliotDeviceReadings';
import type { BeliotDeviceReading } from '../services/supabaseBeliotReadingsApi';

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

const ARCHIVE_DATA_LIMIT = 10_000;

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthStartStr(): string {
  const d = new Date();
  const ms = new Date(d.getFullYear(), d.getMonth(), 1);
  return `${ms.getFullYear()}-${String(ms.getMonth() + 1).padStart(2, '0')}-${String(ms.getDate()).padStart(2, '0')}`;
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

  const updateDefaultDates = useCallback((_groupBy: ArchiveGroupBy) => {
    setArchiveStartDate(monthStartStr());
    setArchiveEndDate(todayStr());
    setArchiveDataLoaded(false);
  }, []);

  const handleGroupByChange = useCallback((newGroupBy: ArchiveGroupBy) => {
    setArchiveGroupBy(newGroupBy);
    setArchiveDataLoaded(false);
    updateDefaultDates(newGroupBy);
  }, [updateDefaultDates]);

  const handleLoadArchiveData = useCallback(async () => {
    if (!deviceId || !archiveStartDate || !archiveEndDate) return;
    setArchiveDataLoaded(true);

    const startDateStr = `${archiveStartDate}T00:00:00.000Z`;
    const endDate = new Date(`${archiveEndDate}T23:59:59.999Z`);
    endDate.setDate(endDate.getDate() + 1);
    const endDateStr = endDate.toISOString();

    if (loadByPeriod) {
      await loadByPeriod(startDateStr, endDateStr);
    } else {
      await refreshArchive();
    }
    setIsArchiveSettingsCollapsed(true);
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
        case 'hour':
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:00`;
          break;
        case 'day':
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
          break;
        case 'week': {
          const weekOfMonth = Math.ceil(date.getDate() / 7);
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-W${weekOfMonth}`;
          break;
        }
        case 'month':
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          break;
        case 'year':
          key = String(date.getFullYear());
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
      maxDate.setMinutes(0, 0, 0);
      effectiveEnd = maxDate;
    }

    const allPeriods: GroupedReading[] = [];
    const current = new Date(start);
    let lastKnownReading: BeliotDeviceReading | undefined;

    while (current <= effectiveEnd) {
      let key: string;
      let periodDate: Date;

      switch (groupBy) {
        case 'hour':
          key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')} ${String(current.getHours()).padStart(2, '0')}:00`;
          periodDate = new Date(current);
          periodDate.setMinutes(0, 0, 0);
          current.setHours(current.getHours() + 1);
          break;
        case 'day':
          key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
          periodDate = new Date(current);
          current.setDate(current.getDate() + 1);
          break;
        case 'week': {
          const weekOfMonth = Math.ceil(current.getDate() / 7);
          key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-W${weekOfMonth}`;
          periodDate = new Date(current);
          current.setDate(current.getDate() + 7);
          break;
        }
        case 'month':
          key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
          periodDate = new Date(current);
          current.setMonth(current.getMonth() + 1);
          break;
        case 'year':
          key = String(current.getFullYear());
          periodDate = new Date(current);
          current.setFullYear(current.getFullYear() + 1);
          break;
        default:
          key = current.toISOString();
          periodDate = new Date(current);
          current.setHours(current.getHours() + 1);
      }

      const periodReadings = grouped.get(key) || [];
      const sortedReadings = [...periodReadings].sort(
        (a, b) => new Date(b.reading_date).getTime() - new Date(a.reading_date).getTime(),
      );

      let consumption = 0;
      if (periodReadings.length > 1) {
        const first = Number(sortedReadings[sortedReadings.length - 1].reading_value);
        const last = Number(sortedReadings[0].reading_value);
        if (!isNaN(first) && !isNaN(last)) {
          consumption = Math.max(0, last - first);
        }
      }

      const realReading = sortedReadings[0];
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
        if (item.reading) {
          nextKnown = item.reading;
          continue;
        }
        if (nextKnown) {
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
    const startDateStr = `${archiveStartDate}T00:00:00.000Z`;
    const endDate = new Date(`${archiveEndDate}T23:59:59.999Z`);
    endDate.setDate(endDate.getDate() + 1);
    return groupReadings(archiveReadingsRaw, archiveGroupBy, startDateStr, endDate.toISOString());
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
          volume = computeVolume(groupedReading, index, archiveGroupBy, archiveReadings, archiveReadingsRaw);
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

  // Перезагрузка при смене дат (если данные уже загружены)
  useEffect(() => {
    if (!isArchiveOpen || !deviceId || !archiveDataLoaded || !archiveStartDate || !archiveEndDate) return;
    const startDateStr = `${archiveStartDate}T00:00:00.000Z`;
    const endDate = new Date(`${archiveEndDate}T23:59:59.999Z`);
    endDate.setDate(endDate.getDate() + 1);
    if (loadByPeriod) {
      loadByPeriod(startDateStr, endDate.toISOString());
    } else {
      refreshArchive();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archiveStartDate, archiveEndDate]);

  // Сброс при открытии/закрытии архива
  useEffect(() => {
    setArchiveDataLoaded(false);
    setArchiveCurrentPage(1);
    setIsArchiveSettingsCollapsed(false);
    if (isArchiveOpen) {
      document.body.classList.add('archive-modal-open');
    } else {
      document.body.classList.remove('archive-modal-open');
    }
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

// ─── Вспомогательная функция вычисления объёма ───────────────────────────────
// Вынесена из useMemo, чтобы не раздувать хук

function computeVolume(
  groupedReading: { groupKey: string; groupDate: Date; reading?: BeliotDeviceReading; consumption: number },
  index: number,
  groupBy: ArchiveGroupBy,
  archiveReadings: { groupKey: string; groupDate: Date; reading?: BeliotDeviceReading; consumption: number }[],
  rawReadings: BeliotDeviceReading[],
): number {
  if (!groupedReading.reading) return 0;

  if (groupBy === 'hour') {
    // Ищем следующее показание (более раннее по времени — архив в обратном порядке)
    for (let i = index + 1; i < archiveReadings.length; i++) {
      const candidate = archiveReadings[i];
      if (candidate?.reading) {
        const current = Number(groupedReading.reading.reading_value);
        const previous = Number(candidate.reading.reading_value);
        if (!isNaN(current) && !isNaN(previous)) {
          return Math.max(0, current - previous);
        }
        break;
      }
    }
    return 0;
  }

  // Для day/week/month/year: суммируем почасовые разницы за период
  const filterByKey = makeFilterByKey(groupedReading.groupKey, groupBy);
  const periodRaw = rawReadings.filter(r => filterByKey(r));
  if (!periodRaw.length) return 0;

  const sorted = [...periodRaw].sort(
    (a, b) => new Date(a.reading_date).getTime() - new Date(b.reading_date).getTime(),
  );

  // Предыдущее показание: последнее за предыдущий день
  const prevDayKey = getPreviousDayKey(sorted[0].reading_date);
  const prevDayReadings = rawReadings.filter(r => {
    const d = new Date(r.reading_date);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return k === prevDayKey;
  });

  let previousHourValue: number | null = null;
  if (prevDayReadings.length > 0) {
    const sortedPrev = [...prevDayReadings].sort(
      (a, b) => new Date(b.reading_date).getTime() - new Date(a.reading_date).getTime(),
    );
    previousHourValue = Number(sortedPrev[0].reading_value);
  }

  let total = 0;
  for (let i = 0; i < sorted.length; i++) {
    const current = Number(sorted[i].reading_value);
    const previous = i === 0
      ? (previousHourValue !== null ? previousHourValue : Number(sorted[0].reading_value))
      : Number(sorted[i - 1].reading_value);
    if (!isNaN(current) && !isNaN(previous)) {
      total += current - previous;
    }
  }
  return Math.max(0, total);
}

function makeFilterByKey(groupKey: string, groupBy: ArchiveGroupBy): (r: BeliotDeviceReading) => boolean {
  switch (groupBy) {
    case 'day':
      return r => {
        const d = new Date(r.reading_date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === groupKey;
      };
    case 'week': {
      const [year, month, weekPart] = groupKey.split('-');
      const monthNum = parseInt(month);
      const weekNum = parseInt(weekPart.replace('W', ''));
      const weekStartDay = (weekNum - 1) * 7 + 1;
      const weekEndDay = Math.min(weekStartDay + 6, new Date(parseInt(year), monthNum, 0).getDate());
      return r => {
        const d = new Date(r.reading_date);
        return d.getFullYear() === parseInt(year) &&
          d.getMonth() + 1 === monthNum &&
          d.getDate() >= weekStartDay && d.getDate() <= weekEndDay;
      };
    }
    case 'month': {
      const [year, month] = groupKey.split('-');
      return r => {
        const d = new Date(r.reading_date);
        return d.getFullYear() === parseInt(year) && d.getMonth() + 1 === parseInt(month);
      };
    }
    case 'year':
      return r => new Date(r.reading_date).getFullYear() === parseInt(groupKey);
    default:
      return () => false;
  }
}

function getPreviousDayKey(dateStr: string): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
