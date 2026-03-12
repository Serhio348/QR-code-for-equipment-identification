/**
 * Компонент для отображения счетчиков через Beliot API
 * 
 * Админ-панель с таблицей счетчиков слева и состоянием справа при наведении
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  getCompanyDevices,
  getDeviceById,
  getDeviceReadings,
  BeliotDevice,
  DeviceReadings,
} from '../services/beliotDeviceApi';
import { useBeliotDevicesStorage } from '../hooks/useBeliotDevicesStorage';
import {
  getBeliotDevicesOverrides,
  saveBeliotDeviceOverride,
  BeliotDeviceOverride,
} from '@/shared/services/api/supabaseBeliotOverridesApi';
import { useBeliotDeviceReadings } from '../hooks/useBeliotDeviceReadings';
import { saveBeliotReading } from '../services/supabaseBeliotReadingsApi';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import DeviceArchiveChart from './DeviceArchiveChart';
import './BeliotDevicesTest.css';

interface StateTableRow {
  key: string;
  value: any;
  type: string;
}

interface DeviceGroup {
  name: string;
  deviceIds: string[];
  devices: BeliotDevice[];
}

const BeliotDevicesTest: React.FC = () => {
  const [devices, setDevices] = useState<BeliotDevice[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<DeviceGroup | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<BeliotDevice | null>(null);
  const [deviceReadings, setDeviceReadings] = useState<DeviceReadings | null>(null);
  const [loadingState, setLoadingState] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Состояние для архивных данных (для будущего локального архива)
  // archiveData не используется, но setArchiveData нужен для сброса состояния
  const [, setArchiveData] = useState<any>(null);
  
  // Состояние для управления архивом текущих показаний
  const [isArchiveOpen, setIsArchiveOpen] = useState<boolean>(false);
  const [archiveViewType, setArchiveViewType] = useState<'readings' | 'volume'>('readings');
  const [archiveDisplayMode, setArchiveDisplayMode] = useState<'table' | 'chart'>('table');
  const [archivePageSize, setArchivePageSize] = useState<number>(10);
  const [archiveGroupBy, setArchiveGroupBy] = useState<'hour' | 'day' | 'week' | 'month' | 'year'>('hour');
  const [archiveDataLoaded, setArchiveDataLoaded] = useState<boolean>(false);
  const [archiveCurrentPage, setArchiveCurrentPage] = useState<number>(1);
  
  const [archiveStartDate, setArchiveStartDate] = useState<string>(() => {
    // По умолчанию: первое число текущего месяца
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    // Используем локальное форматирование, чтобы избежать проблем с часовыми поясами
    return `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}-${String(monthStart.getDate()).padStart(2, '0')}`;
  });
  const [archiveEndDate, setArchiveEndDate] = useState<string>(() => {
    // По умолчанию: сегодня (включая все данные за сегодня)
    const today = new Date();
    // Используем локальное форматирование, чтобы избежать проблем с часовыми поясами
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  });
  
  // Состояние для управления мобильными панелями
  const [isGroupsPanelOpen, setIsGroupsPanelOpen] = useState<boolean>(false);
  const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState<boolean>(false);
  
  // Состояние для выпадающего меню действий на мобильных
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  // Состояние для показа поля поиска на мобильных
  const [isMobileSearchVisible, setIsMobileSearchVisible] = useState<boolean>(false);
  // Состояние для сворачивания панели настроек архива
  const [isArchiveSettingsCollapsed, setIsArchiveSettingsCollapsed] = useState<boolean>(false);

  // Функция для установки дат по умолчанию
  // Начальная дата всегда: первое число текущего месяца (независимо от группировки)
  const updateDefaultDates = useCallback((_groupBy: 'hour' | 'day' | 'week' | 'month' | 'year') => {
    const today = new Date();
    // Начальная дата всегда: первое число текущего месяца
    // Используем локальное время, чтобы избежать проблем с часовыми поясами
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthStartStr = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}-${String(monthStart.getDate()).padStart(2, '0')}`;
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    // Для всех группировок: с первого числа текущего месяца до сегодня (включая сегодня)
    setArchiveStartDate(monthStartStr);
    setArchiveEndDate(todayStr);
    
    // Сбрасываем флаг загрузки при изменении группировки
    setArchiveDataLoaded(false);
  }, []);
  
  // Хук для работы с архивными данными текущего устройства
  // autoLoad: false - не загружаем автоматически, только по кнопке
  const currentDeviceId = selectedDevice ? String(selectedDevice.device_id || selectedDevice.id || selectedDevice._id) : null;
  
  // Для всех группировок нужно загружать ВСЕ данные за период
  // Используем большой лимит, чтобы загрузить все данные за месяц
  const effectiveLimit = 10000; // 10000 - достаточно большой лимит для всех данных за месяц
  
  const {
    readings: archiveReadingsRaw,
    loading: archiveLoading,
    error: archiveError,
    refresh: refreshArchive,
    loadByPeriod,
  } = useBeliotDeviceReadings((isArchiveOpen && archiveDataLoaded) ? currentDeviceId : null, {
    reading_type: 'hourly',
    limit: effectiveLimit,
    start_date: archiveStartDate ? `${archiveStartDate}T00:00:00.000Z` : undefined,
    // Добавляем 1 день к end_date и используем начало следующего дня, чтобы включить все данные за выбранный день
    end_date: archiveEndDate ? (() => {
      const endDate = new Date(archiveEndDate + 'T23:59:59.999Z');
      endDate.setDate(endDate.getDate() + 1);
      return endDate.toISOString();
    })() : undefined,
    autoLoad: false, // Не загружаем автоматически
  });
  
  // Обработчик изменения группировки
  const handleGroupByChange = useCallback((newGroupBy: 'hour' | 'day' | 'week' | 'month' | 'year') => {
    setArchiveGroupBy(newGroupBy);
    // Сбрасываем загруженные данные при изменении группировки
    setArchiveDataLoaded(false);
    // Обновляем даты по умолчанию для новой группировки
    updateDefaultDates(newGroupBy);
  }, [updateDefaultDates]);
  
  // Обработчик загрузки данных
  const handleLoadArchiveData = useCallback(async () => {
    if (!currentDeviceId || !archiveStartDate || !archiveEndDate) return;
    setArchiveDataLoaded(true);

    // Для всех группировок используем loadByPeriod
    // чтобы загрузить ВСЕ данные за период без ограничений
    if (loadByPeriod) {
      const startDateStr = `${archiveStartDate}T00:00:00.000Z`;
      // Добавляем 1 день к end_date, чтобы включить все данные за выбранный день
      const endDate = new Date(`${archiveEndDate}T23:59:59.999Z`);
      endDate.setDate(endDate.getDate() + 1);
      const endDateStr = endDate.toISOString();

      console.log('📥 Загрузка данных архива:', {
        deviceId: currentDeviceId,
        startDate: startDateStr,
        endDate: endDateStr,
        groupBy: archiveGroupBy
      });

      await loadByPeriod(startDateStr, endDateStr);

      console.log('✅ Данные загружены, проверяем количество:', {
        deviceId: currentDeviceId,
        // Проверим количество после загрузки через useEffect
      });

      // Сворачиваем панель настроек после загрузки данных
      setIsArchiveSettingsCollapsed(true);
    } else {
      // Fallback: используем обычную загрузку
      await refreshArchive();
      // Сворачиваем панель настроек после загрузки данных
      setIsArchiveSettingsCollapsed(true);
    }
  }, [currentDeviceId, archiveStartDate, archiveEndDate, archiveGroupBy, loadByPeriod, refreshArchive]);


  // Функция группировки показаний и генерации всех периодов в диапазоне
  const groupReadings = useCallback((
    readings: typeof archiveReadingsRaw,
    groupBy: 'hour' | 'day' | 'week' | 'month' | 'year',
    startDate: string,
    endDate: string
  ) => {
    if (!readings) readings = [];

    // Парсим даты диапазона
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Группируем существующие показания
    const grouped = new Map<string, typeof archiveReadingsRaw>();
    
    readings.forEach((reading) => {
      const date = new Date(reading.reading_date);
      let key: string;
      
      switch (groupBy) {
        case 'hour':
          // Группировка по часу с начала суток (00:00, 01:00, ...)
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:00`;
          break;
        case 'day':
          // Группировка по дню с начала месяца (01, 02, ...)
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
          break;
        case 'week':
          // Группировка по неделе с начала месяца (неделя 1, 2, 3, 4)
          const weekOfMonth = Math.ceil(date.getDate() / 7);
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-W${weekOfMonth}`;
          break;
        case 'month':
          // Группировка по месяцу с начала года (01, 02, ...)
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          break;
        case 'year':
          // Группировка по году
          key = String(date.getFullYear());
          break;
        default:
          key = date.toISOString();
      }
      
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(reading);
    });

    // Для группировки по часам: генерируем только до последнего часа с данными
    // Для остальных группировок: генерируем все периоды в выбранном диапазоне
    let effectiveEnd = end;
    
    if (groupBy === 'hour' && readings.length > 0) {
      // Для часов: находим последний час с данными
      const maxDate = new Date(Math.max(...readings.map(r => new Date(r.reading_date).getTime())));
      const lastHourWithData = new Date(maxDate);
      lastHourWithData.setMinutes(0, 0, 0);
      lastHourWithData.setSeconds(0, 0);
      lastHourWithData.setMilliseconds(0);
      effectiveEnd = lastHourWithData;
    }
    // Для остальных группировок (day, week, month, year) используем весь выбранный диапазон
    
    // Генерируем периоды в диапазоне
    const allPeriods: Array<{
      groupKey: string;
      groupDate: Date;
      reading?: typeof archiveReadingsRaw[0];
      consumption: number;
    }> = [];
    
    const current = new Date(start);
    
    while (current <= effectiveEnd) {
      let key: string;
      let periodDate: Date;
      
      switch (groupBy) {
        case 'hour':
          // Для часов: генерируем каждый час в диапазоне
          key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')} ${String(current.getHours()).padStart(2, '0')}:00`;
          periodDate = new Date(current);
          periodDate.setMinutes(0, 0, 0);
          // Переходим к следующему часу
          current.setHours(current.getHours() + 1);
          break;
        case 'day':
          // Для дней: генерируем каждый день в диапазоне
          key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
          periodDate = new Date(current);
          periodDate.setHours(0, 0, 0, 0);
          // Переходим к следующему дню
          current.setDate(current.getDate() + 1);
          break;
        case 'week':
          // Для недель: генерируем каждую неделю в диапазоне
          const weekOfMonth = Math.ceil(current.getDate() / 7);
          key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-W${weekOfMonth}`;
          periodDate = new Date(current);
          periodDate.setHours(0, 0, 0, 0);
          // Переходим к следующей неделе (7 дней)
          current.setDate(current.getDate() + 7);
          break;
        case 'month':
          // Для месяцев: генерируем каждый месяц в диапазоне
          key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
          periodDate = new Date(current.getFullYear(), current.getMonth(), 1);
          // Переходим к следующему месяцу
          current.setMonth(current.getMonth() + 1);
          break;
        case 'year':
          // Для лет: генерируем каждый год в диапазоне
          key = String(current.getFullYear());
          periodDate = new Date(current.getFullYear(), 0, 1);
          // Переходим к следующему году
          current.setFullYear(current.getFullYear() + 1);
          break;
        default:
          key = current.toISOString();
          periodDate = new Date(current);
          current.setDate(current.getDate() + 1);
      }
      
      // Проверяем, есть ли данные для этого периода
      const groupReadings = grouped.get(key);
      let reading: typeof archiveReadingsRaw[0] | undefined;
      // consumption не рассчитываем здесь - он будет рассчитан при отображении
      // по принципу "текущее показание - предыдущее показание с данными"
      let consumption = 0;
      
      if (groupReadings && groupReadings.length > 0) {
        // Сортируем показания в группе по дате (от старых к новым)
        const sorted = [...groupReadings].sort((a, b) => 
          new Date(a.reading_date).getTime() - new Date(b.reading_date).getTime()
        );
        
        // Берем последнее показание в группе как основное (показание на конец периода)
        // Это показание будет использоваться для расчета объема относительно предыдущего периода
        reading = sorted[sorted.length - 1];
      }
      
      allPeriods.push({
        groupKey: key,
        groupDate: periodDate,
        reading,
        consumption, // Всегда 0 здесь, будет рассчитан при отображении
      });
    }

    // Сортируем по дате (от новых к старым - по убыванию)
    return allPeriods.sort((a, b) => b.groupDate.getTime() - a.groupDate.getTime());
  }, []);

  // Группированные показания со всеми периодами в диапазоне
  const archiveReadings = useMemo(() => {
    if (!archiveStartDate || !archiveEndDate) return [];
    
    const startDateStr = `${archiveStartDate}T00:00:00.000Z`;
    // Добавляем 1 день к end_date, чтобы включить все данные за выбранный день
    const endDate = new Date(`${archiveEndDate}T23:59:59.999Z`);
    endDate.setDate(endDate.getDate() + 1);
    const endDateStr = endDate.toISOString();
    
    const grouped = groupReadings(archiveReadingsRaw, archiveGroupBy, startDateStr, endDateStr);
    
    // Логирование для диагностики
    if (archiveReadingsRaw && archiveReadingsRaw.length > 0) {
      console.log('📊 Группировка данных:', {
        deviceId: currentDeviceId,
        rawReadingsCount: archiveReadingsRaw.length,
        groupedReadingsCount: grouped.length,
        groupBy: archiveGroupBy,
        dateRange: `${archiveStartDate} - ${archiveEndDate}`,
        firstReading: archiveReadingsRaw[0]?.reading_date,
        lastReading: archiveReadingsRaw[archiveReadingsRaw.length - 1]?.reading_date,
      });
    }
    
    return grouped;
  }, [archiveReadingsRaw, archiveGroupBy, archiveStartDate, archiveEndDate, currentDeviceId, groupReadings]);
  
  // Подготовка данных для графиков
  // Полные данные для графика (без фильтрации)
  const fullChartData = useMemo(() => {
    if (!archiveReadings || archiveReadings.length === 0 || !archiveReadingsRaw) return [];

    return archiveReadings.map((groupedReading: any, index: number) => {
      const readingDate = groupedReading.groupDate;
      const hasReading = !!groupedReading.reading;
      
      // Форматируем дату в зависимости от группировки
      let dateLabel = '';
      switch (archiveGroupBy) {
        case 'hour':
          dateLabel = readingDate.toLocaleString('ru-RU', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          });
          break;
        case 'day':
          dateLabel = readingDate.toLocaleDateString('ru-RU', {
            month: '2-digit',
            day: '2-digit',
          });
          break;
        case 'week':
          const weekNum = Math.ceil(readingDate.getDate() / 7);
          // Добавляем месяц и год для избежания неоднозначности при многомесячных данных
          const monthYear = readingDate.toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' });
          dateLabel = `Н${weekNum}, ${monthYear}`;
          break;
        case 'month':
          dateLabel = readingDate.toLocaleDateString('ru-RU', {
            month: 'short',
          });
          break;
        case 'year':
          dateLabel = readingDate.getFullYear().toString();
          break;
      }
      
      let readingValue = 0;
      let volume = 0;
      
      if (hasReading && groupedReading.reading) {
        readingValue = Number(groupedReading.reading.reading_value) || 0;
        
        // Вычисляем объем потребления (используем ту же логику, что и в таблице)
        if (archiveViewType === 'volume') {
          let consumption = 0;
          
          if (archiveGroupBy === 'hour') {
            // Для часов: ищем следующее показание (более раннее по времени)
            let foundPreviousReading = null;
            for (let i = index + 1; i < archiveReadings.length; i++) {
              const candidate = archiveReadings[i];
              if (candidate?.reading) {
                foundPreviousReading = candidate;
                break;
              }
            }
            
            if (foundPreviousReading?.reading) {
              const currentValue = Number(groupedReading.reading.reading_value);
              const previousValue = Number(foundPreviousReading.reading.reading_value);
              if (!isNaN(currentValue) && !isNaN(previousValue)) {
                consumption = currentValue - previousValue;
              }
            }
          } else if (archiveGroupBy === 'day') {
            // Для дней: суммируем потребление по часам за день
            const dayKey = groupedReading.groupKey;
            const dayReadings = archiveReadingsRaw
              ?.filter(r => {
                const rDate = new Date(r.reading_date);
                const rDayKey = `${rDate.getFullYear()}-${String(rDate.getMonth() + 1).padStart(2, '0')}-${String(rDate.getDate()).padStart(2, '0')}`;
                return rDayKey === dayKey;
              }) || [];
            
            if (dayReadings.length > 0) {
              const sorted = [...dayReadings].sort((a, b) => 
                new Date(a.reading_date).getTime() - new Date(b.reading_date).getTime()
              );
              
              let previousHourValue: number | null = null;
              const dayDate = new Date(sorted[0].reading_date);
              dayDate.setDate(dayDate.getDate() - 1);
              const prevDayKey = `${dayDate.getFullYear()}-${String(dayDate.getMonth() + 1).padStart(2, '0')}-${String(dayDate.getDate()).padStart(2, '0')}`;
              
              const prevDayReadings = archiveReadingsRaw.filter(r => {
                const rDate = new Date(r.reading_date);
                const rDayKey = `${rDate.getFullYear()}-${String(rDate.getMonth() + 1).padStart(2, '0')}-${String(rDate.getDate()).padStart(2, '0')}`;
                return rDayKey === prevDayKey;
              });
              
              if (prevDayReadings.length > 0) {
                const sortedPrevDay = [...prevDayReadings].sort((a, b) => 
                  new Date(b.reading_date).getTime() - new Date(a.reading_date).getTime()
                );
                previousHourValue = Number(sortedPrevDay[0].reading_value);
              }
              
              for (let i = 0; i < sorted.length; i++) {
                const currentValue = Number(sorted[i].reading_value);
                const previousValue = i === 0 
                  ? (previousHourValue !== null ? previousHourValue : Number(sorted[0].reading_value))
                  : Number(sorted[i - 1].reading_value);
                
                if (!isNaN(currentValue) && !isNaN(previousValue)) {
                  const hourConsumption = currentValue - previousValue;
                  consumption += hourConsumption;
                }
              }
            }
          } else if (archiveGroupBy === 'week') {
            // Для недель: используем ту же логику, что и в таблице
            const weekKey = groupedReading.groupKey;
            const [year, month, weekNum] = weekKey.split('-');
            const monthNum = parseInt(month);
            const weekStartDay = (parseInt(weekNum.replace('W', '')) - 1) * 7 + 1;
            const weekEndDay = Math.min(weekStartDay + 6, new Date(parseInt(year), monthNum, 0).getDate());
            
            const weekReadings = archiveReadingsRaw
              ?.filter(r => {
                const rDate = new Date(r.reading_date);
                return rDate.getFullYear() === parseInt(year) &&
                       rDate.getMonth() + 1 === monthNum &&
                       rDate.getDate() >= weekStartDay &&
                       rDate.getDate() <= weekEndDay;
              }) || [];
            
            if (weekReadings.length > 0) {
              const sorted = [...weekReadings].sort((a, b) => 
                new Date(a.reading_date).getTime() - new Date(b.reading_date).getTime()
              );
              
              let previousHourValue: number | null = null;
              if (archiveReadingsRaw) {
                const weekStartDate = new Date(parseInt(year), monthNum - 1, weekStartDay);
                weekStartDate.setDate(weekStartDate.getDate() - 1);
                const prevDayKey = `${weekStartDate.getFullYear()}-${String(weekStartDate.getMonth() + 1).padStart(2, '0')}-${String(weekStartDate.getDate()).padStart(2, '0')}`;
                
                const prevDayReadings = archiveReadingsRaw.filter(r => {
                  const rDate = new Date(r.reading_date);
                  const rDayKey = `${rDate.getFullYear()}-${String(rDate.getMonth() + 1).padStart(2, '0')}-${String(rDate.getDate()).padStart(2, '0')}`;
                  return rDayKey === prevDayKey;
                });
                
                if (prevDayReadings.length > 0) {
                  const sortedPrevDay = [...prevDayReadings].sort((a, b) => 
                    new Date(b.reading_date).getTime() - new Date(a.reading_date).getTime()
                  );
                  previousHourValue = Number(sortedPrevDay[0].reading_value);
                }
              }
              
              for (let i = 0; i < sorted.length; i++) {
                const currentValue = Number(sorted[i].reading_value);
                const previousValue = i === 0 
                  ? (previousHourValue !== null ? previousHourValue : Number(sorted[0].reading_value))
                  : Number(sorted[i - 1].reading_value);
                
                if (!isNaN(currentValue) && !isNaN(previousValue)) {
                  const hourConsumption = currentValue - previousValue;
                  consumption += hourConsumption;
                }
              }
            }
          } else if (archiveGroupBy === 'month') {
            // Для месяцев: используем ту же логику, что и в таблице
            const monthKey = groupedReading.groupKey;
            const [year, month] = monthKey.split('-');
            
            const monthReadings = archiveReadingsRaw
              ?.filter(r => {
                const rDate = new Date(r.reading_date);
                return rDate.getFullYear() === parseInt(year) &&
                       rDate.getMonth() + 1 === parseInt(month);
              }) || [];
            
            if (monthReadings.length > 0) {
              const sorted = [...monthReadings].sort((a, b) => 
                new Date(a.reading_date).getTime() - new Date(b.reading_date).getTime()
              );
              
              let previousHourValue: number | null = null;
              if (archiveReadingsRaw) {
                const monthStartDate = new Date(parseInt(year), parseInt(month) - 1, 1);
                monthStartDate.setDate(monthStartDate.getDate() - 1);
                const prevDayKey = `${monthStartDate.getFullYear()}-${String(monthStartDate.getMonth() + 1).padStart(2, '0')}-${String(monthStartDate.getDate()).padStart(2, '0')}`;
                
                const prevDayReadings = archiveReadingsRaw.filter(r => {
                  const rDate = new Date(r.reading_date);
                  const rDayKey = `${rDate.getFullYear()}-${String(rDate.getMonth() + 1).padStart(2, '0')}-${String(rDate.getDate()).padStart(2, '0')}`;
                  return rDayKey === prevDayKey;
                });
                
                if (prevDayReadings.length > 0) {
                  const sortedPrevDay = [...prevDayReadings].sort((a, b) => 
                    new Date(b.reading_date).getTime() - new Date(a.reading_date).getTime()
                  );
                  previousHourValue = Number(sortedPrevDay[0].reading_value);
                }
              }
              
              for (let i = 0; i < sorted.length; i++) {
                const currentValue = Number(sorted[i].reading_value);
                const previousValue = i === 0 
                  ? (previousHourValue !== null ? previousHourValue : Number(sorted[0].reading_value))
                  : Number(sorted[i - 1].reading_value);
                
                if (!isNaN(currentValue) && !isNaN(previousValue)) {
                  const hourConsumption = currentValue - previousValue;
                  consumption += hourConsumption;
                }
              }
            }
          } else if (archiveGroupBy === 'year') {
            // Для лет: используем ту же логику, что и в таблице
            const yearKey = groupedReading.groupKey;
            
            const yearReadings = archiveReadingsRaw
              ?.filter(r => {
                const rDate = new Date(r.reading_date);
                return rDate.getFullYear() === parseInt(yearKey);
              }) || [];
            
            if (yearReadings.length > 0) {
              const sorted = [...yearReadings].sort((a, b) => 
                new Date(a.reading_date).getTime() - new Date(b.reading_date).getTime()
              );
              
              let previousHourValue: number | null = null;
              if (archiveReadingsRaw) {
                const yearStartDate = new Date(parseInt(yearKey), 0, 1);
                yearStartDate.setDate(yearStartDate.getDate() - 1);
                const prevDayKey = `${yearStartDate.getFullYear()}-${String(yearStartDate.getMonth() + 1).padStart(2, '0')}-${String(yearStartDate.getDate()).padStart(2, '0')}`;
                
                const prevDayReadings = archiveReadingsRaw.filter(r => {
                  const rDate = new Date(r.reading_date);
                  const rDayKey = `${rDate.getFullYear()}-${String(rDate.getMonth() + 1).padStart(2, '0')}-${String(rDate.getDate()).padStart(2, '0')}`;
                  return rDayKey === prevDayKey;
                });
                
                if (prevDayReadings.length > 0) {
                  const sortedPrevDay = [...prevDayReadings].sort((a, b) => 
                    new Date(b.reading_date).getTime() - new Date(a.reading_date).getTime()
                  );
                  previousHourValue = Number(sortedPrevDay[0].reading_value);
                }
              }
              
              for (let i = 0; i < sorted.length; i++) {
                const currentValue = Number(sorted[i].reading_value);
                const previousValue = i === 0 
                  ? (previousHourValue !== null ? previousHourValue : Number(sorted[0].reading_value))
                  : Number(sorted[i - 1].reading_value);
                
                if (!isNaN(currentValue) && !isNaN(previousValue)) {
                  const hourConsumption = currentValue - previousValue;
                  consumption += hourConsumption;
                }
              }
            }
          }
          
          volume = consumption > 0 ? consumption : 0;
        }
      }
      
      return {
        date: dateLabel,
        fullDate: readingDate.toISOString(),
        reading: readingValue,
        volume: volume,
        hasData: hasReading,
        index: index, // Сохраняем индекс для фильтрации
      };
    }).reverse(); // Обращаем порядок для отображения от старых к новым
  }, [archiveReadings, archiveGroupBy, archiveViewType, archiveReadingsRaw]);

  // Функция для фильтрации данных по временному диапазону
  
  // Пагинация: вычисляем отображаемые записи (по 10 на страницу)
  const archivePageSizeDisplay = 10; // Фиксированный размер страницы для отображения
  const archiveTotalPages = Math.ceil(archiveReadings.length / archivePageSizeDisplay);
  const archiveStartIndex = (archiveCurrentPage - 1) * archivePageSizeDisplay;
  const archiveEndIndex = archiveStartIndex + archivePageSizeDisplay;
  const archiveDisplayedReadings = archiveReadings.slice(archiveStartIndex, archiveEndIndex);
  
  // Сброс страницы при изменении группировки или загрузке данных
  useEffect(() => {
    setArchiveCurrentPage(1);
  }, [archiveGroupBy, archiveDataLoaded]);
  
  // Обработчики навигации по страницам
  const handlePreviousPage = useCallback(() => {
    if (archiveCurrentPage > 1) {
      setArchiveCurrentPage(archiveCurrentPage - 1);
    }
  }, [archiveCurrentPage]);
  
  const handleNextPage = useCallback(() => {
    if (archiveCurrentPage < archiveTotalPages) {
      setArchiveCurrentPage(archiveCurrentPage + 1);
    }
  }, [archiveCurrentPage, archiveTotalPages]);
  
  // Перезагружаем архив при изменении параметров (только если данные уже загружены)
  useEffect(() => {
    if (isArchiveOpen && currentDeviceId && archiveDataLoaded && archiveStartDate && archiveEndDate) {
      // При изменении диапазона дат перезагружаем данные
      // Для всех группировок используем loadByPeriod
      if (loadByPeriod) {
        const startDateStr = `${archiveStartDate}T00:00:00.000Z`;
        // Добавляем 1 день к end_date, чтобы включить все данные за выбранный день
        const endDate = new Date(`${archiveEndDate}T23:59:59.999Z`);
        endDate.setDate(endDate.getDate() + 1);
        const endDateStr = endDate.toISOString();
        loadByPeriod(startDateStr, endDateStr);
      } else {
        // Fallback: используем обычную загрузку
        refreshArchive();
      }
    }
  }, [archiveStartDate, archiveEndDate, currentDeviceId, isArchiveOpen, archiveDataLoaded, loadByPeriod, refreshArchive]);
  
  // При открытии/закрытии архива сбрасываем флаг загрузки и управляем видимостью элементов
  useEffect(() => {
    if (!isArchiveOpen) {
      setArchiveDataLoaded(false);
      setArchiveCurrentPage(1);
      setIsArchiveSettingsCollapsed(false);
      // Убираем класс при закрытии архива
      document.body.classList.remove('archive-modal-open');
    } else {
      // При открытии архива также сбрасываем флаг, чтобы показать кнопку загрузки
      setArchiveDataLoaded(false);
      setArchiveCurrentPage(1);
      setIsArchiveSettingsCollapsed(false);
      // Добавляем класс при открытии архива для скрытия header
      document.body.classList.add('archive-modal-open');
    }
  }, [isArchiveOpen]);
  
  // Группировка применяется автоматически через useMemo при изменении archiveGroupBy
  
  // Хранилище пользовательских изменений (localStorage)
  const {
    updateOverride: updateLocalOverride,
    getOverride: getLocalOverride,
  } = useBeliotDevicesStorage();
  
  // Состояние для синхронизированных изменений из Supabase
  const [syncedOverrides, setSyncedOverrides] = useState<Record<string, BeliotDeviceOverride>>({});
  const [syncing, setSyncing] = useState<boolean>(false);
  
  // Состояние для отслеживания редактируемой ячейки (устаревшее, будет удалено)
  const [editingCell, setEditingCell] = useState<{ deviceId: string; field: 'name' | 'address' | 'serialNumber' | 'object' } | null>(null);
  
  // Состояние для модального окна паспорта счетчика
  const [isPassportOpen, setIsPassportOpen] = useState<boolean>(false);
  const [passportDevice, setPassportDevice] = useState<BeliotDevice | null>(null);
  const [passportData, setPassportData] = useState<{
    name: string;
    serialNumber: string;
    object: string;
    deviceRole: 'source' | 'production' | 'domestic' | '';
    manufactureDate: string;
    manufacturer: string;
    verificationDate: string;
    nextVerificationDate: string;
  }>({
    name: '',
    serialNumber: '',
    object: '',
    deviceRole: '',
    manufactureDate: '',
    manufacturer: '',
    verificationDate: '',
    nextVerificationDate: '',
  });
  const [passportSaving, setPassportSaving] = useState<boolean>(false);
  
  // Состояние для перетаскивания модального окна паспорта
  const [passportModalPosition, setPassportModalPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDraggingPassport, setIsDraggingPassport] = useState<boolean>(false);
  const [dragStartPassport, setDragStartPassport] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Блокировка прокрутки при открытии любого модального окна (архив или паспорт)
  // Координирует оба состояния, чтобы избежать конфликтов
  useEffect(() => {
    // Блокируем прокрутку, если открыто хотя бы одно модальное окно
    if (isArchiveOpen || isPassportOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    
    // Очистка при размонтировании
    // ВАЖНО: Безусловно восстанавливаем overflow при размонтировании,
    // чтобы избежать утечки состояния (stale closure)
    return () => {
      document.body.style.overflow = '';
    };
  }, [isArchiveOpen, isPassportOpen]);

  // Загрузка устройств и синхронизация при монтировании компонента
  useEffect(() => {
    handleGetDevices();
    syncOverridesFromServer();
  }, []);

  // Синхронизация изменений с Supabase
  const syncOverridesFromServer = useCallback(async () => {
    try {
      setSyncing(true);
      console.log('🔄 Синхронизация изменений счетчиков с Supabase...');
      const serverOverrides = await getBeliotDevicesOverrides();
      setSyncedOverrides(serverOverrides);
      console.log('✅ Синхронизация завершена:', Object.keys(serverOverrides).length, 'устройств');
    } catch (error: any) {
      console.error('❌ Ошибка синхронизации с Supabase:', error);
      // Не блокируем работу приложения при ошибке синхронизации
    } finally {
      setSyncing(false);
    }
  }, []);

  // Сохранение изменений только в localStorage (быстро, без синхронизации)
  const updateLocalValue = useCallback((
    deviceId: string,
    field: 'name' | 'address' | 'serialNumber' | 'object',
    value: string
  ) => {
    if (!deviceId) {
      console.error('❌ updateLocalValue: deviceId не указан!', { deviceId, field, value });
      return;
    }
    
    // Сохраняем только в localStorage (быстро, без синхронизации)
    updateLocalOverride(deviceId, field, value);
  }, [updateLocalOverride]);

  // Защита от повторных вызовов синхронизации
  const syncingRef = useRef<Set<string>>(new Set());

  // Синхронизация изменений с Supabase (вызывается при onBlur или Enter)
  const syncOverrideToSupabase = useCallback(async (
    deviceId: string,
    field: 'name' | 'address' | 'serialNumber' | 'object'
  ) => {
    console.log('💾 syncOverrideToSupabase вызван:', { deviceId, field });
    
    if (!deviceId) {
      console.error('❌ syncOverrideToSupabase: deviceId не указан!', { deviceId, field });
      return;
    }

    // Проверяем, не выполняется ли уже синхронизация для этого устройства
    const syncKey = `${deviceId}_${field}`;
    if (syncingRef.current.has(syncKey)) {
      console.log('⏸️ Синхронизация уже выполняется для', syncKey);
      return;
    }

    // Помечаем, что синхронизация началась
    syncingRef.current.add(syncKey);
    
    try {
      const currentOverride = getLocalOverride(deviceId);
      
      // Преобразуем поля из localStorage формата (camelCase) в Supabase формат (snake_case)
      const overrideData: Partial<BeliotDeviceOverride> = {};
      
      if (currentOverride) {
        if (currentOverride.name !== undefined) {
          overrideData.name = currentOverride.name;
        }
        if (currentOverride.address !== undefined) {
          overrideData.address = currentOverride.address;
        }
        if (currentOverride.serialNumber !== undefined) {
          overrideData.serial_number = currentOverride.serialNumber; // serialNumber → serial_number
        }
        if (currentOverride.object !== undefined) {
          overrideData.object_name = currentOverride.object; // object → object_name
        }
        // device_group не хранится в localStorage (только в Supabase), поэтому не включаем
      }
      
      console.log('💾 Отправка данных в Supabase:', { deviceId, overrideData });
      await saveBeliotDeviceOverride(deviceId, overrideData);
      console.log(`✅ Изменения для устройства ${deviceId} синхронизированы с Supabase`);
      
      // Обновляем локальный кэш синхронизированных данных
      const updated = await getBeliotDevicesOverrides();
      setSyncedOverrides(updated);
    } catch (error: any) {
      console.error(`❌ Ошибка синхронизации изменений для устройства ${deviceId}:`, error);
      // Изменения остаются в localStorage, синхронизация произойдет при следующей попытке
    } finally {
      // Убираем флаг синхронизации
      syncingRef.current.delete(syncKey);
    }
  }, [getLocalOverride]);

  // Получение редактируемых данных для устройства с приоритетом
  const getEditableValue = useCallback((deviceId: string, field: 'name' | 'address' | 'serialNumber' | 'object', defaultValue: string): string => {
    const id = String(deviceId);
    
    // Приоритет 1: localStorage (самые свежие локальные изменения)
    const localOverride = getLocalOverride(id);
    if (localOverride && localOverride[field] !== undefined) {
      return localOverride[field]!;
    }
    
    // Приоритет 2: Supabase (синхронизированные изменения)
    const syncedOverride = syncedOverrides[id];
    if (syncedOverride) {
      // Маппинг полей из Supabase формата в localStorage формат
      if (field === 'serialNumber' && syncedOverride.serial_number !== undefined) {
        return syncedOverride.serial_number;
      }
      if (field === 'object' && syncedOverride.object_name !== undefined) {
        return syncedOverride.object_name;
      }
      if (field === 'name' && syncedOverride.name !== undefined) {
        return syncedOverride.name;
      }
      if (field === 'address' && syncedOverride.address !== undefined) {
        return syncedOverride.address;
      }
    }
    
    // Приоритет 3: Значение по умолчанию
    return defaultValue;
  }, [getLocalOverride, syncedOverrides]);

  // Закрытие модального окна паспорта
  const handleClosePassport = useCallback(() => {
    setIsPassportOpen(false);
    setPassportDevice(null);
    setIsMobileMenuOpen(false);
    setPassportData({
      name: '',
      serialNumber: '',
      object: '',
      deviceRole: '',
      manufactureDate: '',
      manufacturer: '',
      verificationDate: '',
      nextVerificationDate: '',
    });
  }, []);

  // Сохранение данных паспорта
  const handleSavePassport = useCallback(async () => {
    if (!passportDevice) return;
    
    const deviceId = String(passportDevice.device_id || passportDevice.id || passportDevice._id);
    setPassportSaving(true);
    
    try {
      // Подготавливаем данные для сохранения
      const overrideData: Partial<BeliotDeviceOverride> = {
        name: passportData.name || undefined,
        serial_number: passportData.serialNumber || undefined,
        object_name: passportData.object || undefined,
        device_role: passportData.deviceRole || null,
        manufacture_date: passportData.manufactureDate || undefined,
        manufacturer: passportData.manufacturer || undefined,
        verification_date: passportData.verificationDate || undefined,
        next_verification_date: passportData.nextVerificationDate || undefined,
      };
      
      // Сохраняем в Supabase
      await saveBeliotDeviceOverride(deviceId, overrideData);
      
      // Обновляем локальный кэш
      const updated = await getBeliotDevicesOverrides();
      setSyncedOverrides(updated);
      
      // Обновляем localStorage
      if (passportData.name) updateLocalValue(deviceId, 'name', passportData.name);
      if (passportData.serialNumber) updateLocalValue(deviceId, 'serialNumber', passportData.serialNumber);
      if (passportData.object) updateLocalValue(deviceId, 'object', passportData.object);
      
      // Закрываем модальное окно
      handleClosePassport();
      
      // Обновляем синхронизацию
      await syncOverridesFromServer();
    } catch (error: any) {
      console.error('Ошибка сохранения паспорта:', error);
      alert(`Ошибка сохранения: ${error.message}`);
    } finally {
      setPassportSaving(false);
    }
  }, [passportDevice, passportData, saveBeliotDeviceOverride, getBeliotDevicesOverrides, updateLocalValue, handleClosePassport, syncOverridesFromServer]);

  const handleGetDevices = async () => {
    setLoading(true);
    setError(null);
    setDevices([]);
    setSelectedGroup(null);
    setSelectedDevice(null);
    setDeviceReadings(null);

    try {
      console.log('🔄 Получение всех устройств...');
      const allDevices = await getCompanyDevices({
        is_deleted: false,
      });
      
      console.log('✅ Устройства получены:', allDevices.length);
      
      // Для каждого устройства делаем запрос по ID, чтобы получить tied_point.place
      console.log('🔄 Загрузка tied_point.place для устройств...');
      const devicesWithPlace = await Promise.all(
        allDevices.map(async (device) => {
          const deviceId = device.device_id || device.id || device._id;
          if (!deviceId) {
            return device;
          }

          try {
            // Получаем только tied_point из полных данных
            const fullDevice = await getDeviceById(deviceId.toString());
            if (fullDevice?.tied_point) {
              // Просто добавляем tied_point к устройству
              return {
                ...device,
                tied_point: fullDevice.tied_point,
              };
            }
          } catch (err: any) {
            // Игнорируем ошибки, используем оригинальное устройство
          }

          return device;
        })
      );

      console.log('✅ Данные устройств загружены:', devicesWithPlace.length);
      
      setDevices(devicesWithPlace);
    } catch (err: any) {
      console.error('❌ Ошибка получения устройств:', err);
      setError(err.message || 'Не удалось получить устройства');
    } finally {
      setLoading(false);
    }
  };

  // Определение групп устройств
  const deviceGroups: DeviceGroup[] = [
    {
      name: 'ХВО',
      deviceIds: ['10597', '10596', '10598', '10586'],
      devices: [],
    },
    {
      name: 'АБК по ул.Советская, 2',
      deviceIds: ['11015', '11016'],
      devices: [],
    },
    {
      name: 'АБК по ул.Советская, 2/1',
      deviceIds: ['11019', '11018'],
      devices: [],
    },
    {
      name: 'Скважина',
      deviceIds: ['11013'],
      devices: [],
    },
    {
      name: 'Посудо-тарный участок',
      deviceIds: ['11078'],
      devices: [],
    },
  ];

  // Группировка устройств по заданным группам
  const groupedDevices = useMemo(() => {
    const groups: DeviceGroup[] = deviceGroups.map(group => ({
      ...group,
      devices: devices.filter(device => {
        const deviceId = String(device.device_id || device.id || device._id);
        return group.deviceIds.includes(deviceId);
      }),
    }));

    return groups.filter(group => group.devices.length > 0);
  }, [devices]);

  // Фильтрация групп по поисковому запросу
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) {
      return groupedDevices;
    }

    const query = searchQuery.toLowerCase();
    return groupedDevices
      .map(group => ({
        ...group,
        devices: group.devices.filter(device => {
          const name = (device.name || '').toLowerCase();
          const deviceId = String(device.device_id || device.id || device._id || '').toLowerCase();
          const groupName = group.name.toLowerCase();

          return (
            name.includes(query) ||
            deviceId.includes(query) ||
            groupName.includes(query)
          );
        }),
      }))
      .filter(group => group.devices.length > 0);
  }, [groupedDevices, searchQuery]);


  // Вспомогательные функции для получения данных устройства
  const getDeviceSerialNumber = (device: BeliotDevice): string => {
    const deviceId = String(device.device_id || device.id || device._id);
    
    // Проверяем редактируемое значение
    const editableValue = getEditableValue(deviceId, 'serialNumber', '');
    if (editableValue) {
      return editableValue;
    }
    
    // Согласно документации API (https://beliot.by:4443/docs/api-docs.json),
    // в схеме устройства нет отдельного поля для серийного номера.
    // Серийный номер обычно содержится в поле `name` (например, "MTK-40N тДЦ13001660")
    
    // Сначала проверяем явные поля серийного номера (на случай, если они есть в данных)
    if ((device as any).serial_number) return String((device as any).serial_number);
    if ((device as any).serialNumber) return String((device as any).serialNumber);
    if ((device as any).serial) return String((device as any).serial);
    if ((device as any).sn) return String((device as any).sn);
    if ((device as any).factory_number) return String((device as any).factory_number);
    if ((device as any).factoryNumber) return String((device as any).factoryNumber);
    
    // Проверяем в объекте модели (если он есть в данных)
    if ((device as any).model && typeof (device as any).model === 'object') {
      const model = (device as any).model;
      if (model.serial_number) return String(model.serial_number);
      if (model.serialNumber) return String(model.serialNumber);
      if (model.serial) return String(model.serial);
      if (model.sn) return String(model.sn);
    }
    
    // Извлекаем серийный номер из поля name
    // Формат может быть: "MTK-40N тДЦ13001660" или "MTK-40N 13001660"
    if (device.name) {
      const name = device.name.trim();
      
      // Вариант 1: "тДЦ" или "ТДЦ" + цифры (например, "тДЦ13001660" или "MTK-40N тДЦ13001660")
      // Ищем паттерн с префиксом "тДЦ" или "ТДЦ" (кириллица) или "тДЦ" (латиница)
      const serialMatch1 = name.match(/(?:тДЦ|ТДЦ|тДЦ|ТДЦ|тДЦ|ТДЦ|тДЦ|ТДЦ)\s*(\d{6,})/i);
      if (serialMatch1 && serialMatch1[1]) {
        return serialMatch1[1];
      }
      
      // Вариант 2: просто длинная последовательность цифр в конце (например, "13001660")
      // Ищем последовательность из 6+ цифр в конце строки после пробела
      const serialMatch2 = name.match(/\s+(\d{6,})$/);
      if (serialMatch2 && serialMatch2[1]) {
        return serialMatch2[1];
      }
      
      // Вариант 3: любая последовательность из 6+ цифр (но не в начале, чтобы не захватить ID)
      // Ищем последовательность цифр, которая не является частью модели в начале
      const serialMatch3 = name.match(/(?:[^\d]|^)(\d{6,})(?:[^\d]|$)/);
      if (serialMatch3 && serialMatch3[1]) {
        return serialMatch3[1];
      }
      
      // Вариант 4: если в названии есть только цифры и буквы, попробуем найти серийный номер
      // Например, "MTK-40N13001660" -> "13001660"
      const serialMatch4 = name.match(/(\d{6,})/);
      if (serialMatch4 && serialMatch4[1]) {
        return serialMatch4[1];
      }
    }
    
    // Fallback: если ничего не найдено, возвращаем "-"
    return '-';
  };

  const getDeviceName = (device: BeliotDevice): string => {
    const deviceId = String(device.device_id || device.id || device._id);
    
    // Проверяем редактируемое значение
    const editableValue = getEditableValue(deviceId, 'name', '');
    if (editableValue) {
      return editableValue;
    }
    
    return device.name || '-';
  };

  const getDeviceObject = (device: BeliotDevice): string => {
    const deviceId = String(device.device_id || device.id || device._id);
    
    // Проверяем редактируемое значение (override)
    const editableValue = getEditableValue(deviceId, 'object', '');
    if (editableValue) {
      return editableValue;
    }
    
    // Приоритет 1: tied_point.place (из API)
    if (device.tied_point?.place) {
      return device.tied_point.place;
    }
    
    // Приоритет 2: object_name (из API)
    if (device.object_name) {
      return device.object_name;
    }
    
    // Приоритет 3: facility_passport_name (из API)
    if (device.facility_passport_name) {
      return device.facility_passport_name;
    }
    
    // Приоритет 4: building_name (из API)
    if (device.building_name) {
      return device.building_name;
    }
    
    return '-';
  };

  // Открытие модального окна паспорта (после объявления getDeviceName, getDeviceSerialNumber, getDeviceObject)
  const handleOpenPassport = useCallback((device: BeliotDevice) => {
    const deviceId = String(device.device_id || device.id || device._id);
    setPassportDevice(device);
    
    // Загружаем данные из Supabase
    const override = syncedOverrides[deviceId];
    
    // Форматируем даты для input type="date" (YYYY-MM-DD)
    const formatDate = (dateStr: string | undefined): string => {
      if (!dateStr) return '';
      try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return '';
        return date.toISOString().split('T')[0];
      } catch {
        return '';
      }
    };
    
    setPassportData({
      name: getEditableValue(deviceId, 'name', getDeviceName(device)),
      serialNumber: getEditableValue(deviceId, 'serialNumber', getDeviceSerialNumber(device)),
      object: getEditableValue(deviceId, 'object', getDeviceObject(device)),
      deviceRole: (override?.device_role as 'source' | 'production' | 'domestic') || '',
      manufactureDate: formatDate(override?.manufacture_date),
      manufacturer: override?.manufacturer || '',
      verificationDate: formatDate(override?.verification_date),
      nextVerificationDate: formatDate(override?.next_verification_date),
    });
    
    // Сбрасываем позицию модального окна при открытии
    setPassportModalPosition({ x: 0, y: 0 });
    setIsDraggingPassport(false);
    setIsPassportOpen(true);
  }, [syncedOverrides, getEditableValue, getDeviceName, getDeviceSerialNumber, getDeviceObject]);

  // Обработчики для перетаскивания модального окна паспорта
  const handlePassportModalMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Перетаскивание только за заголовок, исключая кнопки
    if ((e.target as HTMLElement).closest('.passport-modal-header') && 
        !(e.target as HTMLElement).closest('.passport-modal-close') &&
        !(e.target as HTMLElement).closest('.passport-btn-back') &&
        !(e.target as HTMLElement).closest('.passport-btn-print') &&
        !(e.target as HTMLElement).closest('.passport-btn-pdf') &&
        !(e.target as HTMLElement).closest('button')) {
      setIsDraggingPassport(true);
      setDragStartPassport({
        x: e.clientX - passportModalPosition.x,
        y: e.clientY - passportModalPosition.y,
      });
    }
  }, [passportModalPosition]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingPassport) {
        setPassportModalPosition({
          x: e.clientX - dragStartPassport.x,
          y: e.clientY - dragStartPassport.y,
        });
      }
    };

    const handleMouseUp = () => {
      setIsDraggingPassport(false);
    };

    if (isDraggingPassport) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingPassport, dragStartPassport]);

  // Форматирование даты для отображения
  // Функция для экранирования HTML, предотвращает XSS атаки
  const escapeHtml = useCallback((text: string | undefined | null): string => {
    if (!text) return '—';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }, []);

  const formatDateForDisplay = useCallback((dateStr: string | undefined): string => {
    if (!dateStr) return '—';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return '—';
      return date.toLocaleDateString('ru-RU', { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit' 
      });
    } catch {
      return '—';
    }
  }, []);

  // Печать паспорта
  const handlePrintPassport = useCallback(() => {
    if (!passportDevice) return;
    
    // Создаем скрытый контейнер для печати
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Пожалуйста, разрешите всплывающие окна для печати');
      return;
    }

    const deviceName = getDeviceName(passportDevice);
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Паспорт счетчика: ${escapeHtml(deviceName)}</title>
          <style>
            @media print {
              @page {
                margin: 20mm;
                size: A4;
              }
              body {
                margin: 0;
                padding: 0;
                font-family: Arial, sans-serif;
                font-size: 12pt;
                color: #000;
              }
            }
            body {
              font-family: Arial, sans-serif;
              max-width: 210mm;
              margin: 0 auto;
              padding: 20px;
              color: #333;
            }
            .passport-header {
              text-align: center;
              border-bottom: 3px solid #667eea;
              padding-bottom: 20px;
              margin-bottom: 30px;
            }
            .passport-header h1 {
              margin: 0;
              font-size: 24pt;
              color: #667eea;
            }
            .passport-section {
              margin-bottom: 30px;
              page-break-inside: avoid;
            }
            .passport-section h2 {
              font-size: 18pt;
              color: #667eea;
              border-bottom: 2px solid #e0e0e0;
              padding-bottom: 10px;
              margin-bottom: 20px;
            }
            .passport-row {
              display: flex;
              justify-content: space-between;
              padding: 10px 0;
              border-bottom: 1px solid #f0f0f0;
            }
            .passport-label {
              font-weight: bold;
              width: 40%;
              color: #666;
            }
            .passport-value {
              width: 60%;
              text-align: right;
            }
            .passport-footer {
              margin-top: 50px;
              padding-top: 20px;
              border-top: 2px solid #e0e0e0;
              text-align: center;
              font-size: 10pt;
              color: #666;
            }
          </style>
        </head>
        <body>
          <div class="passport-header">
            <h1>ПАСПОРТ СЧЕТЧИКА</h1>
          </div>
          
          <div class="passport-section">
            <h2>Основные данные</h2>
            <div class="passport-row">
              <span class="passport-label">Название счетчика:</span>
              <span class="passport-value">${escapeHtml(passportData.name)}</span>
            </div>
            <div class="passport-row">
              <span class="passport-label">Серийный номер:</span>
              <span class="passport-value">${escapeHtml(passportData.serialNumber)}</span>
            </div>
            <div class="passport-row">
              <span class="passport-label">Объект:</span>
              <span class="passport-value">${escapeHtml(passportData.object)}</span>
            </div>
          </div>
          
          <div class="passport-section">
            <h2>Паспортные данные</h2>
            <div class="passport-row">
              <span class="passport-label">Дата выпуска:</span>
              <span class="passport-value">${escapeHtml(formatDateForDisplay(passportData.manufactureDate))}</span>
            </div>
            <div class="passport-row">
              <span class="passport-label">Производитель:</span>
              <span class="passport-value">${escapeHtml(passportData.manufacturer)}</span>
            </div>
            <div class="passport-row">
              <span class="passport-label">Дата поверки:</span>
              <span class="passport-value">${escapeHtml(formatDateForDisplay(passportData.verificationDate))}</span>
            </div>
            <div class="passport-row">
              <span class="passport-label">Дата следующей поверки:</span>
              <span class="passport-value">${escapeHtml(formatDateForDisplay(passportData.nextVerificationDate))}</span>
            </div>
          </div>
          
          <div class="passport-footer">
            <p>Документ сформирован: ${new Date().toLocaleDateString('ru-RU', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}</p>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    
    // Ждем загрузки и открываем диалог печати
    setTimeout(() => {
      printWindow.print();
    }, 250);
  }, [passportDevice, passportData, getDeviceName, formatDateForDisplay, escapeHtml]);

  // Сохранение паспорта в PDF
  const handleSavePassportAsPDF = useCallback(async () => {
    if (!passportDevice) return;
    
    // Создаем скрытый контейнер для рендеринга
    const printContainer = document.createElement('div');
    printContainer.style.position = 'absolute';
    printContainer.style.left = '-9999px';
    printContainer.style.width = '210mm';
    printContainer.style.padding = '20mm';
    printContainer.style.backgroundColor = 'white';
    printContainer.style.fontFamily = 'Arial, sans-serif';
    printContainer.style.fontSize = '12pt';
    printContainer.style.color = '#333';
    
    try {
      const deviceName = getDeviceName(passportDevice);
      
      printContainer.innerHTML = `
        <div style="text-align: center; border-bottom: 3px solid #667eea; padding-bottom: 20px; margin-bottom: 30px;">
          <h1 style="margin: 0; font-size: 24pt; color: #667eea;">ПАСПОРТ СЧЕТЧИКА</h1>
        </div>
        
        <div style="margin-bottom: 30px;">
          <h2 style="font-size: 18pt; color: #667eea; border-bottom: 2px solid #e0e0e0; padding-bottom: 10px; margin-bottom: 20px;">Основные данные</h2>
          <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f0f0f0;">
            <span style="font-weight: bold; width: 40%; color: #666;">Название счетчика:</span>
            <span style="width: 60%; text-align: right;">${escapeHtml(passportData.name)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f0f0f0;">
            <span style="font-weight: bold; width: 40%; color: #666;">Серийный номер:</span>
            <span style="width: 60%; text-align: right;">${escapeHtml(passportData.serialNumber)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f0f0f0;">
            <span style="font-weight: bold; width: 40%; color: #666;">Объект:</span>
            <span style="width: 60%; text-align: right;">${escapeHtml(passportData.object)}</span>
          </div>
        </div>
        
        <div style="margin-bottom: 30px;">
          <h2 style="font-size: 18pt; color: #667eea; border-bottom: 2px solid #e0e0e0; padding-bottom: 10px; margin-bottom: 20px;">Паспортные данные</h2>
          <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f0f0f0;">
            <span style="font-weight: bold; width: 40%; color: #666;">Дата выпуска:</span>
            <span style="width: 60%; text-align: right;">${escapeHtml(formatDateForDisplay(passportData.manufactureDate))}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f0f0f0;">
            <span style="font-weight: bold; width: 40%; color: #666;">Производитель:</span>
            <span style="width: 60%; text-align: right;">${escapeHtml(passportData.manufacturer)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f0f0f0;">
            <span style="font-weight: bold; width: 40%; color: #666;">Дата поверки:</span>
            <span style="width: 60%; text-align: right;">${escapeHtml(formatDateForDisplay(passportData.verificationDate))}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f0f0f0;">
            <span style="font-weight: bold; width: 40%; color: #666;">Дата следующей поверки:</span>
            <span style="width: 60%; text-align: right;">${escapeHtml(formatDateForDisplay(passportData.nextVerificationDate))}</span>
          </div>
        </div>
        
        <div style="margin-top: 50px; padding-top: 20px; border-top: 2px solid #e0e0e0; text-align: center; font-size: 10pt; color: #666;">
          <p>Документ сформирован: ${new Date().toLocaleDateString('ru-RU', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}</p>
        </div>
      `;
      
      document.body.appendChild(printContainer);
      
      // Конвертируем в canvas
      const canvas = await html2canvas(printContainer, {
        scale: 2,
        useCORS: true,
        logging: false,
      });
      
      // Удаляем временный контейнер сразу после успешной конвертации
      if (printContainer.parentNode) {
        document.body.removeChild(printContainer);
      }
      
      // Создаем PDF
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210;
      const pageHeight = 297;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;
      
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      
      // Сохраняем PDF
      const fileName = `Паспорт_${deviceName.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);
    } catch (error) {
      console.error('Ошибка при сохранении PDF:', error);
      alert('Ошибка при сохранении PDF. Пожалуйста, попробуйте снова.');
    } finally {
      // Гарантируем удаление временного контейнера в любом случае
      // (даже если произошла ошибка до добавления в DOM или после)
      if (printContainer.parentNode) {
        document.body.removeChild(printContainer);
      }
    }
  }, [passportDevice, passportData, getDeviceName, formatDateForDisplay, escapeHtml]);

  const getLastReading = (device: BeliotDevice): string => {
    let value: number | undefined;
    // Пробуем получить last_message_type.1.in1
    if (device.last_message_type && typeof device.last_message_type === 'object') {
      const msgType = device.last_message_type as any;
      if (msgType['1'] && msgType['1'].in1 !== undefined) {
        value = Number(msgType['1'].in1);
      }
    }
    // Альтернативные пути
    if (value === undefined && (device as any).last_message_type?.['1']?.in1 !== undefined) {
      value = Number((device as any).last_message_type['1'].in1);
    }
    // Округляем до одного знака после запятой
    if (value !== undefined && !isNaN(value)) {
      return value.toFixed(1);
    }
    return '-';
  };

  // Обработка клика на группу
  const handleGroupClick = (group: DeviceGroup) => {
    setSelectedGroup(group);
    setSelectedDevice(null);
    setDeviceReadings(null);
    setIsGroupsPanelOpen(false); // Закрываем панель групп на мобильных
  };

  // Обработка клика на устройство в таблице группы
  const handleDeviceClick = async (device: BeliotDevice) => {
    setSelectedDevice(device);
    setLoadingState(true);
    setDeviceReadings(null);
    setArchiveData(null);
    setIsArchiveOpen(false); // Закрываем архив при выборе нового устройства
    setError(null);

    const deviceId = device.device_id || device.id || device._id;
    if (!deviceId) {
      setError('ID устройства не найден');
      setLoadingState(false);
      return;
    }

    try {
      console.log(`🔄 Получение показаний устройства: ${deviceId}...`);
      const readings = await getDeviceReadings(deviceId.toString());
      
      console.log('✅ Показания получены:', readings);
      setDeviceReadings(readings);

      // Сохраняем текущие показания в Supabase для истории
      // Это позволит видеть данные в таблице Supabase сразу, без ожидания Railway скрипта
      try {
        if (readings.current?.value !== undefined && readings.current?.date) {
          const currentDateValue = readings.current.date;
          let currentDate: Date;
          
          if (currentDateValue && typeof currentDateValue === 'object' && 'getTime' in currentDateValue) {
            // Проверяем, что это Date объект
            const dateObj = currentDateValue as any;
            if (dateObj instanceof Date) {
              currentDate = dateObj;
            } else {
              currentDate = new Date(String(currentDateValue));
            }
          } else if (typeof currentDateValue === 'number') {
            // Если это timestamp в секундах, конвертируем в миллисекунды
            const timestamp = currentDateValue < 10000000000 ? currentDateValue * 1000 : currentDateValue;
            currentDate = new Date(timestamp);
          } else {
            currentDate = new Date(String(currentDateValue));
          }
          
          // Проверяем валидность даты перед сохранением
          if (!isNaN(currentDate.getTime()) && currentDate.getFullYear() > 2000) {
            // Округляем до начала часа
            const hourStart = new Date(currentDate);
            hourStart.setMinutes(0, 0, 0);
            hourStart.setSeconds(0, 0);
            hourStart.setMilliseconds(0);
            
            await saveBeliotReading({
              device_id: deviceId.toString(),
              reading_date: hourStart,
              reading_value: Number(readings.current.value),
              unit: 'м³',
              reading_type: 'hourly',
              source: 'api',
              period: 'current',
            });
            console.log('✅ Текущее показание сохранено в Supabase');
          } else {
            console.warn('⚠️ Некорректная дата текущего показания, пропускаем сохранение');
          }
        }

        if (readings.previous?.value !== undefined && readings.previous?.date) {
          const previousDateValue = readings.previous.date;
          let previousDate: Date;
          
          if (previousDateValue && typeof previousDateValue === 'object' && 'getTime' in previousDateValue) {
            // Проверяем, что это Date объект
            const dateObj = previousDateValue as any;
            if (dateObj instanceof Date) {
              previousDate = dateObj;
            } else {
              previousDate = new Date(String(previousDateValue));
            }
          } else if (typeof previousDateValue === 'number') {
            // Если это timestamp в секундах, конвертируем в миллисекунды
            const timestamp = previousDateValue < 10000000000 ? previousDateValue * 1000 : previousDateValue;
            previousDate = new Date(timestamp);
          } else {
            previousDate = new Date(String(previousDateValue));
          }
          
          // Проверяем валидность даты перед сохранением
          if (!isNaN(previousDate.getTime()) && previousDate.getFullYear() > 2000) {
            // Округляем до начала часа
            const hourStart = new Date(previousDate);
            hourStart.setMinutes(0, 0, 0);
            hourStart.setSeconds(0, 0);
            hourStart.setMilliseconds(0);
            
            await saveBeliotReading({
              device_id: deviceId.toString(),
              reading_date: hourStart,
              reading_value: Number(readings.previous.value),
              unit: 'м³',
              reading_type: 'hourly',
              source: 'api',
              period: 'previous',
            });
            console.log('✅ Предыдущее показание сохранено в Supabase');
          } else {
            console.warn('⚠️ Некорректная дата предыдущего показания, пропускаем сохранение');
          }
        }
      } catch (saveError: any) {
        // Не блокируем отображение показаний, если сохранение в Supabase не удалось
        console.warn('⚠️ Не удалось сохранить показания в Supabase (не критично):', saveError.message);
      }
    } catch (err: any) {
      console.error('❌ Ошибка получения показаний:', err);
      setError(err.message || 'Не удалось получить показания устройства');
    } finally {
      setLoadingState(false);
    }
  };

  // Установка периода для быстрого выбора



  /**
   * Преобразует объект состояния в массив строк таблицы
   */
  const flattenObject = (obj: any, prefix: string = ''): StateTableRow[] => {
    const rows: StateTableRow[] = [];
    
    if (obj === null || obj === undefined) {
      rows.push({
        key: prefix || 'null',
        value: 'null',
        type: 'null',
      });
      return rows;
    }
    
    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        if (typeof item === 'object' && item !== null) {
          rows.push(...flattenObject(item, `${prefix}[${index}]`));
        } else {
          rows.push({
            key: `${prefix}[${index}]`,
            value: String(item),
            type: typeof item,
          });
        }
      });
    } else if (typeof obj === 'object') {
      Object.keys(obj).forEach((key) => {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        const value = obj[key];
        
        if (value === null || value === undefined) {
          rows.push({
            key: fullKey,
            value: String(value),
            type: typeof value,
          });
        } else if (Array.isArray(value)) {
          rows.push(...flattenObject(value, fullKey));
        } else if (typeof value === 'object') {
          rows.push(...flattenObject(value, fullKey));
        } else {
          rows.push({
            key: fullKey,
            value: String(value),
            type: typeof value,
          });
        }
      });
    } else {
      rows.push({
        key: prefix || 'value',
        value: String(obj),
        type: typeof obj,
      });
    }
    
    return rows;
  };


  return (
    <div className="beliot-devices-admin">

      {/* Левая панель: Таблица счетчиков */}
      <div className={`devices-panel ${isGroupsPanelOpen ? 'mobile-open' : ''}`}>
        <div className="panel-header">
          {/* Кнопка закрытия на мобильных */}
          <button 
            className="mobile-close-button"
            onClick={() => setIsGroupsPanelOpen(false)}
            title="Закрыть"
          >
            ×
          </button>
          <h2>ОАО "Брестский ликёро-водочный завод "Белалко"</h2>
          <button
            onClick={handleGetDevices}
            disabled={loading}
            className="refresh-button"
            title="Обновить список"
          >
            🔄
          </button>
        </div>

        {/* Поиск */}
        <div className="search-container">
          <input
            type="text"
            placeholder="🔍 Поиск счетчиков..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="search-clear"
              title="Очистить поиск"
            >
              ×
            </button>
          )}
        </div>

        {/* Таблица групп */}
        <div className="devices-table-container">
          {loading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Загрузка счетчиков...</p>
              <p style={{ fontSize: '12px', color: '#999', marginTop: '8px' }}>
                Загрузка полных данных (включая tied_point)...
              </p>
            </div>
          ) : error ? (
            <div className="error-state">
              <strong>❌ Ошибка:</strong> {error}
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="empty-state">
              {searchQuery ? 'Группы не найдены по запросу' : 'Группы не загружены'}
            </div>
          ) : (
            <table className="devices-table">
              <thead>
                <tr>
                  <th>Группа</th>
                  <th>Количество</th>
                </tr>
              </thead>
              <tbody>
                {filteredGroups.map((group, index) => {
                  const isSelected = selectedGroup?.name === group.name;
                  
                  return (
                    <tr
                      key={group.name || index}
                      className={isSelected ? 'selected' : ''}
                      onClick={() => handleGroupClick(group)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="device-name">{group.name}</td>
                      <td className="device-status">
                        <span className="status-badge">{group.devices.length}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Информация о количестве */}
        {!loading && filteredGroups.length > 0 && (
          <div className="panel-footer">
            Найдено групп: {filteredGroups.length}
          </div>
        )}
      </div>

      {/* Правая панель: Таблица счетчиков группы и состояние */}
      <div className={`details-panel ${isDetailsPanelOpen ? 'mobile-open' : ''}`}>
        {selectedGroup ? (
          <>
            <div className="details-header">
              <h3>📊 {selectedGroup.name}</h3>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {syncing && (
                  <span style={{ fontSize: '12px', color: '#666' }}>🔄 Синхронизация...</span>
                )}
                <button
                  onClick={syncOverridesFromServer}
                  className="refresh-button"
                  title="Синхронизировать с сервером"
                  disabled={syncing}
                  style={{ fontSize: '14px', padding: '4px 8px' }}
                >
                  🔄
                </button>
                <button
                  onClick={() => {
                    setSelectedGroup(null);
                    setSelectedDevice(null);
                    setDeviceReadings(null);
                    setIsDetailsPanelOpen(false);
                  }}
                  className="close-button"
                  title="Закрыть"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="details-content">
              {/* Таблица счетчиков группы */}
              <div className="group-devices-section">
                <h4>Счетчики группы ({selectedGroup.devices.length})</h4>
                <div className="group-devices-table-container">
                  <table className="group-devices-table">
                    <thead>
                      <tr>
                        <th>Объект</th>
                        <th>Счётчик</th>
                        <th>Серийный номер</th>
                        <th>Показание</th>
                        <th>Документация</th>
                        <th>Архив</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedGroup.devices.map((device, index) => {
                        const deviceId = String(device.device_id || device.id || device._id);
                        const isSelected = selectedDevice === device;
                        
                        return (
                          <tr
                            key={deviceId || index}
                            className={isSelected ? 'selected' : ''}
                          >
                            <td>{getDeviceObject(device)}</td>
                            <td>{getDeviceName(device)}</td>
                            <td>{getDeviceSerialNumber(device)}</td>
                            <td className="reading-cell">{getLastReading(device)}</td>
                            <td className="actions-cell">
                              <button
                                className="passport-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenPassport(device);
                                }}
                                title="Открыть паспорт счетчика"
                              >
                                📄 Паспорт
                              </button>
                            </td>
                            <td className="actions-cell">
                              <button
                                className="archive-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedDevice(device);
                                  setIsArchiveOpen(true);
                                }}
                                title="Открыть архив"
                              >
                                <span className="archive-icon">☰</span>
                                <span className="archive-text">Архив</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="empty-details">
            <p>Выберите группу из таблицы для просмотра счетчиков</p>
          </div>
        )}
      </div>

      {/* Основной контент для мобильных */}
      <div className="mobile-main-content">
        {!selectedGroup ? (
          /* Список объектов (групп) */
          <div className="mobile-groups-list">
            <div className="mobile-groups-header">
              <h3>Объекты</h3>
              <button
                className="mobile-menu-toggle"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                title="Меню"
              >
                ☰
              </button>
            </div>
            
            {/* Выпадающее меню действий для списка объектов */}
            {isMobileMenuOpen && !selectedGroup && (
              <>
                <div 
                  className="mobile-menu-overlay"
                  onClick={() => setIsMobileMenuOpen(false)}
                />
                <div className="mobile-actions-menu">
                  <button
                    className="mobile-menu-item"
                    onClick={() => {
                      handleGetDevices();
                      setIsMobileMenuOpen(false);
                    }}
                    disabled={loading}
                  >
                    <span className="mobile-menu-icon">🔄</span>
                    <span className="mobile-menu-text">Обновить</span>
                  </button>
                </div>
              </>
            )}
            {loading ? (
              <div className="loading-state">
                <div className="spinner"></div>
                <p>Загрузка объектов...</p>
              </div>
            ) : error ? (
              <div className="error-state">
                <strong>❌ Ошибка:</strong> {error}
              </div>
            ) : filteredGroups.length === 0 ? (
              <div className="empty-state">
                {searchQuery ? 'Объекты не найдены по запросу' : 'Объекты не загружены'}
              </div>
            ) : (
              <div className="mobile-groups-container">
                {filteredGroups.map((group, index) => (
                  <div
                    key={group.name || index}
                    className="mobile-group-card"
                    onClick={() => handleGroupClick(group)}
                  >
                    <div className="mobile-group-name">{group.name}</div>
                    <div className="mobile-group-count">
                      Счетчиков: {group.devices.length}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : !selectedDevice ? (
          /* Таблица счетчиков выбранного объекта */
          <div className="mobile-devices-list">
            <div className="mobile-devices-header">
              <button
                className="mobile-back-button"
                onClick={() => {
                  setSelectedGroup(null);
                  setSelectedDevice(null);
                  setDeviceReadings(null);
                  setError(null);
                  setIsMobileMenuOpen(false);
                  setIsMobileSearchVisible(false);
                  setSearchQuery('');
                }}
              >
                ←
              </button>
              <h3>{selectedGroup.name}</h3>
              <button
                className="mobile-menu-toggle"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                title="Меню"
              >
                ☰
              </button>
            </div>
            
            {/* Выпадающее меню действий */}
            {isMobileMenuOpen && (
              <>
                <div 
                  className="mobile-menu-overlay"
                  onClick={() => setIsMobileMenuOpen(false)}
                />
                <div className="mobile-actions-menu">
                  <button
                    className="mobile-menu-item"
                    onClick={() => {
                      syncOverridesFromServer();
                      setIsMobileMenuOpen(false);
                    }}
                    disabled={syncing}
                  >
                    <span className="mobile-menu-icon">🔄</span>
                    <span className="mobile-menu-text">Синхронизировать</span>
                  </button>
                  <button
                    className="mobile-menu-item"
                    onClick={() => {
                      setIsMobileSearchVisible(true);
                      setIsMobileMenuOpen(false);
                      // Фокусируемся на поле поиска после небольшой задержки
                      setTimeout(() => {
                        const searchInput = document.querySelector('.mobile-search-input') as HTMLInputElement;
                        if (searchInput) {
                          searchInput.focus();
                        }
                      }, 100);
                    }}
                  >
                    <span className="mobile-menu-icon">🔍</span>
                    <span className="mobile-menu-text">Поиск</span>
                  </button>
                </div>
              </>
            )}
            {/* Поле поиска для мобильной версии */}
            {isMobileSearchVisible && (
              <div className="mobile-search-container">
                <input
                  type="text"
                  placeholder="🔍 Поиск счетчиков..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="mobile-search-input"
                  autoFocus
                />
                <button
                  className="mobile-search-close"
                  onClick={() => {
                    setIsMobileSearchVisible(false);
                    setSearchQuery('');
                  }}
                  title="Закрыть поиск"
                >
                  ×
                </button>
              </div>
            )}
            <div className="mobile-devices-cards-container">
              {(() => {
                const filteredDevices = selectedGroup.devices.filter((device) => {
                  // Фильтрация по поисковому запросу
                  if (!searchQuery.trim()) return true;
                  const query = searchQuery.toLowerCase();
                  const deviceName = getDeviceName(device).toLowerCase();
                  const deviceId = String(device.device_id || device.id || device._id).toLowerCase();
                  const address = (device.address || '').toLowerCase();
                  const serialNumber = (device.serialNumber || device.serial_number || '').toLowerCase();
                  return deviceName.includes(query) ||
                         deviceId.includes(query) ||
                         address.includes(query) ||
                         serialNumber.includes(query);
                });

                if (filteredDevices.length === 0 && searchQuery.trim()) {
                  return (
                    <div className="empty-state" style={{ textAlign: 'center', padding: '20px' }}>
                      Счетчики не найдены по запросу "{searchQuery}"
                    </div>
                  );
                }

                return filteredDevices.map((device, index) => {
                  const deviceId = String(device.device_id || device.id || device._id);
                  const isSelected = selectedDevice === device;
                  const isEditingName = editingCell?.deviceId === deviceId && editingCell?.field === 'name';
                  const isEditingSerial = editingCell?.deviceId === deviceId && editingCell?.field === 'serialNumber';

                  return (
                    <div
                      key={deviceId || index}
                      className={`mobile-device-card ${isSelected ? 'selected' : ''}`}
                      onClick={async (e) => {
                        if ((e.target as HTMLElement).tagName !== 'INPUT') {
                          await handleDeviceClick(device);
                        }
                      }}
                    >
                      <div className="mobile-device-card-header">
                        <div
                          className="mobile-device-name-editable"
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            setEditingCell({ deviceId, field: 'name' });
                          }}
                        >
                          {isEditingName ? (
                            <input
                              type="text"
                              className="mobile-editable-input"
                              value={getEditableValue(deviceId, 'name', getDeviceName(device))}
                              onChange={(e) => updateLocalValue(deviceId, 'name', e.target.value)}
                              onBlur={async () => {
                                await syncOverrideToSupabase(deviceId, 'name');
                                setEditingCell(null);
                              }}
                              onKeyDown={async (e) => {
                                if (e.key === 'Enter') {
                                  await syncOverrideToSupabase(deviceId, 'name');
                                  setEditingCell(null);
                                } else if (e.key === 'Escape') {
                                  setEditingCell(null);
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                              autoFocus
                            />
                          ) : (
                            <span className="mobile-device-name">{getDeviceName(device) || '-'}</span>
                          )}
                        </div>
                        <div className="mobile-device-reading">{getLastReading(device) || '-'}</div>
                      </div>

                      <div className="mobile-device-card-body">
                        <div className="mobile-device-info-row">
                          <span className="mobile-device-label">Серийный номер:</span>
                          <div
                            className="mobile-device-serial-editable"
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              setEditingCell({ deviceId, field: 'serialNumber' });
                            }}
                          >
                            {isEditingSerial ? (
                              <input
                                type="text"
                                className="mobile-editable-input"
                                value={getEditableValue(deviceId, 'serialNumber', getDeviceSerialNumber(device))}
                                onChange={(e) => updateLocalValue(deviceId, 'serialNumber', e.target.value)}
                                onBlur={async () => {
                                  await syncOverrideToSupabase(deviceId, 'serialNumber');
                                  setEditingCell(null);
                                }}
                                onKeyDown={async (e) => {
                                  if (e.key === 'Enter') {
                                    await syncOverrideToSupabase(deviceId, 'serialNumber');
                                    setEditingCell(null);
                                  } else if (e.key === 'Escape') {
                                    setEditingCell(null);
                                  }
                                }}
                                onClick={(e) => e.stopPropagation()}
                                autoFocus
                              />
                            ) : (
                              <span className="mobile-device-value">{getDeviceSerialNumber(device) || '-'}</span>
                            )}
                          </div>
                        </div>

                        <div className="mobile-device-info-row">
                          <span className="mobile-device-label">Объект:</span>
                          <span className="mobile-device-value">{getDeviceObject(device) || '-'}</span>
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        ) : (
          /* Показания выбранного счетчика */
          <div className="mobile-readings-list">
            <div className="mobile-readings-header">
              <button
                className="mobile-back-button"
                onClick={() => {
                  setSelectedDevice(null);
                  setDeviceReadings(null);
                  setError(null);
                  setIsMobileMenuOpen(false);
                }}
              >
                ←
              </button>
              <h3>{getDeviceName(selectedDevice) || selectedDevice.device_id || selectedDevice.id}</h3>
              <button
                className="mobile-menu-toggle"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                title="Меню"
              >
                ☰
              </button>
            </div>
            
            {/* Выпадающее меню действий для показаний */}
            {isMobileMenuOpen && selectedDevice && (
              <>
                <div 
                  className="mobile-menu-overlay"
                  onClick={() => setIsMobileMenuOpen(false)}
                />
                <div className="mobile-actions-menu">
                  <button
                    className="mobile-menu-item"
                    onClick={() => {
                      handleOpenPassport(selectedDevice);
                      setIsMobileMenuOpen(false);
                    }}
                  >
                    <span className="mobile-menu-icon">📄</span>
                    <span className="mobile-menu-text">Паспорт</span>
                  </button>
                  <button
                    className="mobile-menu-item"
                    onClick={() => {
                      setIsArchiveOpen(true);
                      setIsMobileMenuOpen(false);
                    }}
                  >
                    <span className="mobile-menu-icon">📊</span>
                    <span className="mobile-menu-text">Архив</span>
                  </button>
                </div>
              </>
            )}
            <div className="mobile-readings-content">
              {loadingState ? (
                <div className="loading-state">
                  <div className="spinner"></div>
                  <p>Загрузка показаний...</p>
                </div>
              ) : error ? (
                <div className="error-state">
                  <strong>❌ Ошибка:</strong> {error}
                </div>
              ) : deviceReadings ? (() => {
                const calculateVolume = (): number | null => {
                  if (deviceReadings.current?.value !== undefined && deviceReadings.previous?.value !== undefined) {
                    const current = Number(deviceReadings.current.value);
                    const previous = Number(deviceReadings.previous.value);
                    if (!isNaN(current) && !isNaN(previous)) {
                      return current - previous;
                    }
                  }
                  return null;
                };

                const calculatePeriod = (): string => {
                  if (deviceReadings.current?.date && deviceReadings.previous?.date) {
                    try {
                      const currentDate = new Date(deviceReadings.current.date);
                      const previousDate = new Date(deviceReadings.previous.date);
                      
                      if (isNaN(currentDate.getTime()) || isNaN(previousDate.getTime())) {
                        return '-';
                      }

                      const diffMs = Math.abs(currentDate.getTime() - previousDate.getTime());
                      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                      const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                      const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

                      if (diffDays > 0) {
                        return `${diffDays} дн. ${diffHours} ч.`;
                      } else if (diffHours > 0) {
                        return `${diffHours} ч. ${diffMinutes} мин.`;
                      } else {
                        return `${diffMinutes} мин.`;
                      }
                    } catch (e) {
                      return '-';
                    }
                  }
                  return '-';
                };

                const volume = calculateVolume();
                const period = calculatePeriod();

                return (
                  <div className="mobile-readings-cards">
                    {deviceReadings.current && (
                      <div className="mobile-reading-card current">
                        <div className="mobile-reading-badge current">Текущий</div>
                        <div className="mobile-reading-value">{deviceReadings.current.value !== undefined ? Number(deviceReadings.current.value).toFixed(1) : '-'}</div>
                        <div className="mobile-reading-unit">{deviceReadings.current.unit || 'м³'}</div>
                        <div className="mobile-reading-date">
                          {deviceReadings.current.date ? (() => {
                            let dateValue: string | number = deviceReadings.current.date;
                            // Если дата в секундах (Unix timestamp), конвертируем в миллисекунды
                            if (typeof dateValue === 'number' && dateValue < 10000000000) {
                              dateValue = dateValue * 1000;
                            }
                            const date = new Date(dateValue);
                            if (isNaN(date.getTime())) return '-';
                            const day = String(date.getDate()).padStart(2, '0');
                            const month = String(date.getMonth() + 1).padStart(2, '0');
                            const year = date.getFullYear();
                            const hours = String(date.getHours()).padStart(2, '0');
                            const minutes = String(date.getMinutes()).padStart(2, '0');
                            return `${day}.${month}.${year} ${hours}:${minutes}`;
                          })() : '-'}
                        </div>
                      </div>
                    )}
                    {deviceReadings.previous && (
                      <div className="mobile-reading-card previous">
                        <div className="mobile-reading-badge previous">Предыдущий</div>
                        <div className="mobile-reading-value">{deviceReadings.previous.value !== undefined ? Number(deviceReadings.previous.value).toFixed(1) : '-'}</div>
                        <div className="mobile-reading-unit">{deviceReadings.previous.unit || 'м³'}</div>
                        <div className="mobile-reading-date">
                          {deviceReadings.previous.date ? (() => {
                            let dateValue: string | number = deviceReadings.previous.date;
                            // Если дата в секундах (Unix timestamp), конвертируем в миллисекунды
                            if (typeof dateValue === 'number' && dateValue < 10000000000) {
                              dateValue = dateValue * 1000;
                            }
                            const date = new Date(dateValue);
                            if (isNaN(date.getTime())) return '-';
                            const day = String(date.getDate()).padStart(2, '0');
                            const month = String(date.getMonth() + 1).padStart(2, '0');
                            const year = date.getFullYear();
                            const hours = String(date.getHours()).padStart(2, '0');
                            const minutes = String(date.getMinutes()).padStart(2, '0');
                            return `${day}.${month}.${year} ${hours}:${minutes}`;
                          })() : '-'}
                        </div>
                      </div>
                    )}
                    {volume !== null && (
                      <div className="mobile-reading-card difference">
                        <div className="mobile-reading-badge difference">Разница</div>
                        <div className="mobile-reading-value difference-value">{volume.toFixed(1)}</div>
                        <div className="mobile-reading-unit">м³</div>
                        <div className="mobile-reading-period">Период: {period}</div>
                      </div>
                    )}
                    {!deviceReadings.current && !deviceReadings.previous && (
                      <div className="empty-state">
                        Показания не найдены
                      </div>
                    )}
                  </div>
                );
              })() : (
                <div className="empty-state">
                  Нажмите на счетчик в таблице для просмотра показаний
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Overlay для закрытия мобильных панелей */}
      {(isGroupsPanelOpen || isDetailsPanelOpen) && (
        <div 
          className="mobile-overlay"
          onClick={() => {
            setIsGroupsPanelOpen(false);
            setIsDetailsPanelOpen(false);
          }}
        />
      )}

      {/* Модальное окно архива */}
      {isArchiveOpen && (
        <>
          {/* Затемненный фон */}
          <div 
            className="archive-modal-overlay"
            onClick={() => setIsArchiveOpen(false)}
          />
          
          {/* Модальное окно */}
          <div className="archive-modal">
            <div className="archive-modal-header">
              <h3>Архивные данные</h3>
              <button
                className="archive-modal-close"
                onClick={() => setIsArchiveOpen(false)}
                title="Закрыть"
              >
                ×
              </button>
            </div>
            
            <div className="archive-modal-content">
              {/* Кнопка для раскрытия/сворачивания панели настроек */}
              {archiveDataLoaded && (
                <button
                  className="archive-settings-toggle-button"
                  onClick={() => setIsArchiveSettingsCollapsed(!isArchiveSettingsCollapsed)}
                  title={isArchiveSettingsCollapsed ? 'Показать настройки' : 'Скрыть настройки'}
                >
                  {isArchiveSettingsCollapsed ? '⚙️ Показать настройки' : '⬆️ Скрыть настройки'}
                </button>
              )}

              <div className={`archive-controls ${isArchiveSettingsCollapsed ? 'collapsed' : ''}`}>
                {/* Выбор диапазона дат */}
                <div className="archive-date-range">
                  <label>С:</label>
                  <input
                    type="date"
                    className="archive-date-input"
                    value={archiveStartDate}
                    onChange={(e) => {
                      setArchiveStartDate(e.target.value);
                      setArchiveDataLoaded(false);
                      setIsArchiveSettingsCollapsed(false);
                    }}
                  />
                  <label>По:</label>
                  <input
                    type="date"
                    className="archive-date-input"
                    value={archiveEndDate}
                    onChange={(e) => {
                      setArchiveEndDate(e.target.value);
                      setArchiveDataLoaded(false);
                      setIsArchiveSettingsCollapsed(false);
                    }}
                  />
                </div>

                {/* Выбор группировки */}
                <div className="archive-group-select">
                  <label>Группировка:</label>
                  <select
                    className="group-by-select"
                    value={archiveGroupBy}
                    onChange={(e) => handleGroupByChange(e.target.value as 'hour' | 'day' | 'week' | 'month' | 'year')}
                  >
                    <option value="hour">По часам</option>
                    <option value="day">По дням</option>
                    <option value="week">По неделям</option>
                    <option value="month">По месяцам</option>
                    <option value="year">По годам</option>
                  </select>
                </div>

                {/* Переключатель режима отображения (таблица/графики) */}
                <div className="archive-view-toggle archive-display-mode-toggle">
                  <button
                    className={`toggle-btn-small ${archiveDisplayMode === 'table' ? 'active' : ''}`}
                    onClick={() => setArchiveDisplayMode('table')}
                    title="Таблица"
                  >
                    📋 Таблица
                  </button>
                  <button
                    className={`toggle-btn-small ${archiveDisplayMode === 'chart' ? 'active' : ''}`}
                    onClick={() => setArchiveDisplayMode('chart')}
                    title="Графики"
                  >
                    📊 Графики
                  </button>
                </div>

                {/* Переключатель показания/объем — только для режима таблицы */}
                {archiveDisplayMode === 'table' && (
                  <div className="archive-view-toggle">
                    <button
                      className={`toggle-btn-small ${archiveViewType === 'readings' ? 'active' : ''}`}
                      onClick={() => setArchiveViewType('readings')}
                    >
                      Показания
                    </button>
                    <button
                      className={`toggle-btn-small ${archiveViewType === 'volume' ? 'active' : ''}`}
                      onClick={() => setArchiveViewType('volume')}
                    >
                      Объем (м³)
                    </button>
                  </div>
                )}

                {/* Размер пагинации */}
                <select
                  className="page-size-select"
                  value={archivePageSize}
                  onChange={(e) => {
                    const newSize = Number(e.target.value);
                    setArchivePageSize(newSize);
                  }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>

                {/* Кнопка загрузки данных */}
                {!archiveDataLoaded && (
                  <button
                    className="archive-load-button"
                    onClick={handleLoadArchiveData}
                    disabled={!currentDeviceId || archiveLoading}
                    title="Загрузить данные за выбранный период"
                  >
                    {archiveLoading ? 'Загрузка...' : '📥 Загрузить данные'}
                  </button>
                )}
              </div>
              
              {!archiveDataLoaded ? (
                <div className="empty-state" style={{ padding: '20px', fontSize: '14px', color: '#666' }}>
                  <p>Нажмите кнопку "Загрузить данные" для просмотра архива</p>
                  <p style={{ fontSize: '12px', color: '#999', marginTop: '8px' }}>
                    Период: {archiveStartDate} - {archiveEndDate} (с первого числа текущего месяца до сегодня)
                  </p>
                </div>
              ) : archiveLoading ? (
                <div className="loading-state">
                  <div className="spinner"></div>
                  <p>Загрузка архива...</p>
                </div>
              ) : archiveError ? (
                <div className="error-state">
                  <strong>❌ Ошибка:</strong> {archiveError.message || 'Не удалось загрузить архив'}
                </div>
              ) : archiveReadings.length === 0 ? (
                <div className="empty-state">
                  <p>Архивные данные не найдены</p>
                </div>
              ) : (
                <>
                  {archiveDisplayMode === 'chart' ? (
                    /* Режим графиков — комбинированный график */
                    <DeviceArchiveChart data={fullChartData} groupBy={archiveGroupBy} />
                  ) : (
                    /* Режим таблицы */
                    <>
                    <div className="archive-table-container">
                      <table className="archive-table">
                      <thead>
                        <tr>
                          <th>Период</th>
                          {archiveViewType === 'readings' ? (
                            <th>Показание</th>
                          ) : (
                            <th>Объем (м³)</th>
                          )}
                          <th>Единица</th>
                        </tr>
                      </thead>
                      <tbody>
                        {archiveDisplayedReadings.map((groupedReading: any, displayIndex) => {
                          const realIndex = archiveStartIndex + displayIndex;
                          const readingDate = groupedReading.groupDate;
                          const hasReading = !!groupedReading.reading;
                          
                          let dateLabel = '';
                          switch (archiveGroupBy) {
                            case 'hour':
                              dateLabel = readingDate.toLocaleString('ru-RU', {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              });
                              break;
                            case 'day':
                              dateLabel = readingDate.toLocaleDateString('ru-RU', {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit',
                              });
                              break;
                            case 'week':
                              const weekNum = Math.ceil(readingDate.getDate() / 7);
                              dateLabel = `Неделя ${weekNum}, ${readingDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}`;
                              break;
                            case 'month':
                              dateLabel = readingDate.toLocaleDateString('ru-RU', {
                                year: 'numeric',
                                month: 'long',
                              });
                              break;
                            case 'year':
                              dateLabel = readingDate.getFullYear().toString();
                              break;
                          }
                          
                          let consumption: number = 0;
                          if (hasReading && groupedReading.reading) {
                            if (archiveGroupBy === 'hour') {
                              let foundPreviousReading = null;
                              for (let i = realIndex + 1; i < archiveReadings.length; i++) {
                                const candidate = archiveReadings[i];
                                if (candidate?.reading) {
                                  foundPreviousReading = candidate;
                                  break;
                                }
                              }
                              
                              if (foundPreviousReading?.reading) {
                                const currentValue = Number(groupedReading.reading.reading_value);
                                const previousValue = Number(foundPreviousReading.reading.reading_value);
                                if (!isNaN(currentValue) && !isNaN(previousValue)) {
                                  consumption = currentValue - previousValue;
                                }
                              }
                            } else if (archiveGroupBy === 'day') {
                              const dayKey = groupedReading.groupKey;
                              const dayReadings = archiveReadingsRaw
                                ?.filter(r => {
                                  const rDate = new Date(r.reading_date);
                                  const rDayKey = `${rDate.getFullYear()}-${String(rDate.getMonth() + 1).padStart(2, '0')}-${String(rDate.getDate()).padStart(2, '0')}`;
                                  return rDayKey === dayKey;
                                }) || [];
                              
                              if (dayReadings.length > 0) {
                                const sorted = [...dayReadings].sort((a, b) => 
                                  new Date(a.reading_date).getTime() - new Date(b.reading_date).getTime()
                                );
                                
                                let previousHourValue: number | null = null;
                                if (archiveReadingsRaw) {
                                  const dayDate = new Date(sorted[0].reading_date);
                                  dayDate.setDate(dayDate.getDate() - 1);
                                  const prevDayKey = `${dayDate.getFullYear()}-${String(dayDate.getMonth() + 1).padStart(2, '0')}-${String(dayDate.getDate()).padStart(2, '0')}`;
                                  
                                  const prevDayReadings = archiveReadingsRaw.filter(r => {
                                    const rDate = new Date(r.reading_date);
                                    const rDayKey = `${rDate.getFullYear()}-${String(rDate.getMonth() + 1).padStart(2, '0')}-${String(rDate.getDate()).padStart(2, '0')}`;
                                    return rDayKey === prevDayKey;
                                  });
                                  
                                  if (prevDayReadings.length > 0) {
                                    const sortedPrevDay = [...prevDayReadings].sort((a, b) => 
                                      new Date(b.reading_date).getTime() - new Date(a.reading_date).getTime()
                                    );
                                    previousHourValue = Number(sortedPrevDay[0].reading_value);
                                  }
                                }
                                
                                for (let i = 0; i < sorted.length; i++) {
                                  const currentValue = Number(sorted[i].reading_value);
                                  const previousValue = i === 0 
                                    ? (previousHourValue !== null ? previousHourValue : Number(sorted[0].reading_value))
                                    : Number(sorted[i - 1].reading_value);
                                  
                                  if (!isNaN(currentValue) && !isNaN(previousValue)) {
                                    const hourConsumption = currentValue - previousValue;
                                    consumption += hourConsumption;
                                  }
                                }
                              }
                            } else if (archiveGroupBy === 'week') {
                              const weekKey = groupedReading.groupKey;
                              const [year, month, weekNum] = weekKey.split('-');
                              const monthNum = parseInt(month);
                              const weekStartDay = (parseInt(weekNum.replace('W', '')) - 1) * 7 + 1;
                              const weekEndDay = Math.min(weekStartDay + 6, new Date(parseInt(year), monthNum, 0).getDate());
                              
                              const weekReadings = archiveReadingsRaw
                                ?.filter(r => {
                                  const rDate = new Date(r.reading_date);
                                  return rDate.getFullYear() === parseInt(year) &&
                                         rDate.getMonth() + 1 === monthNum &&
                                         rDate.getDate() >= weekStartDay &&
                                         rDate.getDate() <= weekEndDay;
                                }) || [];
                              
                              if (weekReadings.length > 0) {
                                const sorted = [...weekReadings].sort((a, b) => 
                                  new Date(a.reading_date).getTime() - new Date(b.reading_date).getTime()
                                );
                                
                                let previousHourValue: number | null = null;
                                if (archiveReadingsRaw) {
                                  const weekStartDate = new Date(parseInt(year), monthNum - 1, weekStartDay);
                                  weekStartDate.setDate(weekStartDate.getDate() - 1);
                                  const prevDayKey = `${weekStartDate.getFullYear()}-${String(weekStartDate.getMonth() + 1).padStart(2, '0')}-${String(weekStartDate.getDate()).padStart(2, '0')}`;
                                  
                                  const prevDayReadings = archiveReadingsRaw.filter(r => {
                                    const rDate = new Date(r.reading_date);
                                    const rDayKey = `${rDate.getFullYear()}-${String(rDate.getMonth() + 1).padStart(2, '0')}-${String(rDate.getDate()).padStart(2, '0')}`;
                                    return rDayKey === prevDayKey;
                                  });
                                  
                                  if (prevDayReadings.length > 0) {
                                    const sortedPrevDay = [...prevDayReadings].sort((a, b) => 
                                      new Date(b.reading_date).getTime() - new Date(a.reading_date).getTime()
                                    );
                                    previousHourValue = Number(sortedPrevDay[0].reading_value);
                                  }
                                }
                                
                                for (let i = 0; i < sorted.length; i++) {
                                  const currentValue = Number(sorted[i].reading_value);
                                  const previousValue = i === 0 
                                    ? (previousHourValue !== null ? previousHourValue : Number(sorted[0].reading_value))
                                    : Number(sorted[i - 1].reading_value);
                                  
                                  if (!isNaN(currentValue) && !isNaN(previousValue)) {
                                    const hourConsumption = currentValue - previousValue;
                                    consumption += hourConsumption;
                                  }
                                }
                              }
                            } else if (archiveGroupBy === 'month') {
                              const monthKey = groupedReading.groupKey;
                              const [year, month] = monthKey.split('-');
                              
                              const monthReadings = archiveReadingsRaw
                                ?.filter(r => {
                                  const rDate = new Date(r.reading_date);
                                  return rDate.getFullYear() === parseInt(year) &&
                                         rDate.getMonth() + 1 === parseInt(month);
                                }) || [];
                              
                              if (monthReadings.length > 0) {
                                const sorted = [...monthReadings].sort((a, b) => 
                                  new Date(a.reading_date).getTime() - new Date(b.reading_date).getTime()
                                );
                                
                                let previousHourValue: number | null = null;
                                if (archiveReadingsRaw) {
                                  const monthStartDate = new Date(parseInt(year), parseInt(month) - 1, 1);
                                  monthStartDate.setDate(monthStartDate.getDate() - 1);
                                  const prevDayKey = `${monthStartDate.getFullYear()}-${String(monthStartDate.getMonth() + 1).padStart(2, '0')}-${String(monthStartDate.getDate()).padStart(2, '0')}`;
                                  
                                  const prevDayReadings = archiveReadingsRaw.filter(r => {
                                    const rDate = new Date(r.reading_date);
                                    const rDayKey = `${rDate.getFullYear()}-${String(rDate.getMonth() + 1).padStart(2, '0')}-${String(rDate.getDate()).padStart(2, '0')}`;
                                    return rDayKey === prevDayKey;
                                  });
                                  
                                  if (prevDayReadings.length > 0) {
                                    const sortedPrevDay = [...prevDayReadings].sort((a, b) => 
                                      new Date(b.reading_date).getTime() - new Date(a.reading_date).getTime()
                                    );
                                    previousHourValue = Number(sortedPrevDay[0].reading_value);
                                  }
                                }
                                
                                for (let i = 0; i < sorted.length; i++) {
                                  const currentValue = Number(sorted[i].reading_value);
                                  const previousValue = i === 0 
                                    ? (previousHourValue !== null ? previousHourValue : Number(sorted[0].reading_value))
                                    : Number(sorted[i - 1].reading_value);
                                  
                                  if (!isNaN(currentValue) && !isNaN(previousValue)) {
                                    const hourConsumption = currentValue - previousValue;
                                    consumption += hourConsumption;
                                  }
                                }
                              }
                            } else if (archiveGroupBy === 'year') {
                              const yearKey = groupedReading.groupKey;
                              
                              const yearReadings = archiveReadingsRaw
                                ?.filter(r => {
                                  const rDate = new Date(r.reading_date);
                                  return rDate.getFullYear() === parseInt(yearKey);
                                }) || [];
                              
                              if (yearReadings.length > 0) {
                                const sorted = [...yearReadings].sort((a, b) => 
                                  new Date(a.reading_date).getTime() - new Date(b.reading_date).getTime()
                                );
                                
                                let previousHourValue: number | null = null;
                                if (archiveReadingsRaw) {
                                  const yearStartDate = new Date(parseInt(yearKey), 0, 1);
                                  yearStartDate.setDate(yearStartDate.getDate() - 1);
                                  const prevDayKey = `${yearStartDate.getFullYear()}-${String(yearStartDate.getMonth() + 1).padStart(2, '0')}-${String(yearStartDate.getDate()).padStart(2, '0')}`;
                                  
                                  const prevDayReadings = archiveReadingsRaw.filter(r => {
                                    const rDate = new Date(r.reading_date);
                                    const rDayKey = `${rDate.getFullYear()}-${String(rDate.getMonth() + 1).padStart(2, '0')}-${String(rDate.getDate()).padStart(2, '0')}`;
                                    return rDayKey === prevDayKey;
                                  });
                                  
                                  if (prevDayReadings.length > 0) {
                                    const sortedPrevDay = [...prevDayReadings].sort((a, b) => 
                                      new Date(b.reading_date).getTime() - new Date(a.reading_date).getTime()
                                    );
                                    previousHourValue = Number(sortedPrevDay[0].reading_value);
                                  }
                                }
                                
                                for (let i = 0; i < sorted.length; i++) {
                                  const currentValue = Number(sorted[i].reading_value);
                                  const previousValue = i === 0 
                                    ? (previousHourValue !== null ? previousHourValue : Number(sorted[0].reading_value))
                                    : Number(sorted[i - 1].reading_value);
                                  
                                  if (!isNaN(currentValue) && !isNaN(previousValue)) {
                                    const hourConsumption = currentValue - previousValue;
                                    consumption += hourConsumption;
                                  }
                                }
                              }
                            }
                          }
                          
                          return (
                            <tr key={groupedReading.groupKey} className={`archive-row ${!hasReading ? 'no-data' : ''}`}>
                              <td style={{ minWidth: '180px', textAlign: 'left' }}>{dateLabel}</td>
                              {archiveViewType === 'readings' ? (
                                <td className="reading-value">
                                  {hasReading ? Number(groupedReading.reading.reading_value).toFixed(2) : '-'}
                                </td>
                              ) : (
                                <td className={`volume-value ${consumption > 0 ? 'positive' : ''}`}>
                                  {hasReading && !isNaN(consumption) ? (
                                    consumption > 0 ? `+${consumption.toFixed(2)}` : consumption.toFixed(2)
                                  ) : '-'}
                                </td>
                              )}
                              <td>{hasReading ? groupedReading.reading.unit : '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Навигация по страницам */}
                  {archiveTotalPages > 1 && (
                    <div className="archive-pagination">
                      <button
                        className="pagination-btn"
                        onClick={handlePreviousPage}
                        disabled={archiveCurrentPage === 1}
                        title="Предыдущая страница"
                      >
                        ←
                      </button>
                      <span className="pagination-info">
                        <span className="pagination-page-number">{archiveCurrentPage} / {archiveTotalPages}</span>
                        <span className="pagination-details">
                          ({archiveStartIndex + 1}-{Math.min(archiveEndIndex, archiveReadings.length)} из {archiveReadings.length})
                        </span>
                      </span>
                      <button
                        className="pagination-btn"
                        onClick={handleNextPage}
                        disabled={archiveCurrentPage >= archiveTotalPages}
                        title="Следующая страница"
                      >
                        →
                      </button>
                    </div>
                  )}
                    </>
                  )}
                  
                  <div className="archive-info">
                    <button
                      className="refresh-btn"
                      onClick={refreshArchive}
                      disabled={archiveLoading}
                    >
                      Обновить
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* Модальное окно паспорта счетчика */}
      {isPassportOpen && passportDevice && (
        <>
          {/* Затемненный фон */}
          <div 
            className="passport-modal-overlay"
            onClick={handleClosePassport}
          />
          
          {/* Модальное окно */}
          <div 
            className="passport-modal"
            style={{
              transform: passportModalPosition.x !== 0 || passportModalPosition.y !== 0
                ? `translate(calc(-50% + ${passportModalPosition.x}px), calc(-50% + ${passportModalPosition.y}px))`
                : 'translate(-50%, -50%)',
              cursor: isDraggingPassport ? 'grabbing' : 'default',
            }}
          >
            <div 
              className="passport-modal-header"
              onMouseDown={handlePassportModalMouseDown}
              style={{ cursor: isDraggingPassport ? 'grabbing' : 'grab' }}
            >
              <button
                className="passport-btn-back"
                onClick={handleClosePassport}
                title="Назад к списку счетчиков"
                onMouseDown={(e) => e.stopPropagation()}
              >
                ← Назад
              </button>
              <h3>Паспорт счетчика: {getDeviceName(passportDevice)}</h3>
              <div className="passport-modal-header-actions">
                <button
                  className="passport-btn-print"
                  onClick={handlePrintPassport}
                  title="Печать"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  🖨️ Печать
                </button>
                <button
                  className="passport-btn-pdf"
                  onClick={handleSavePassportAsPDF}
                  title="Сохранить в PDF"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  📄 PDF
                </button>
                <button
                  className="passport-modal-close"
                  onClick={handleClosePassport}
                  title="Закрыть"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  ×
                </button>
              </div>
            </div>
            
            <div className="passport-modal-content">
              {/* Основные данные */}
              <div className="passport-section">
                <h4>Основные данные</h4>
                <div className="passport-form-grid">
                  <div className="passport-form-field">
                    <label>Название счетчика:</label>
                    <input
                      type="text"
                      className="passport-input"
                      value={passportData.name}
                      onChange={(e) => setPassportData({ ...passportData, name: e.target.value })}
                      placeholder="Введите название"
                    />
                  </div>
                  
                  <div className="passport-form-field">
                    <label>Серийный номер:</label>
                    <input
                      type="text"
                      className="passport-input"
                      value={passportData.serialNumber}
                      onChange={(e) => setPassportData({ ...passportData, serialNumber: e.target.value })}
                      placeholder="Введите серийный номер"
                    />
                  </div>
                  
                  <div className="passport-form-field">
                    <label>Объект:</label>
                    <input
                      type="text"
                      className="passport-input"
                      value={passportData.object}
                      onChange={(e) => setPassportData({ ...passportData, object: e.target.value })}
                      placeholder="Введите объект"
                    />
                  </div>

                  <div className="passport-form-field">
                    <label>Роль в водном балансе:</label>
                    <select
                      className="passport-input"
                      value={passportData.deviceRole}
                      onChange={(e) => setPassportData({ ...passportData, deviceRole: e.target.value as 'source' | 'production' | 'domestic' | '' })}
                    >
                      <option value="">— не указана —</option>
                      <option value="source">🚰 Источник (скважина)</option>
                      <option value="production">🏭 Производство</option>
                      <option value="domestic">🏠 Хоз-питьевое водоснабжение</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Паспортные данные */}
              <div className="passport-section">
                <h4>Паспортные данные</h4>
                <div className="passport-form-grid">
                  <div className="passport-form-field">
                    <label>Дата выпуска:</label>
                    <input
                      type="date"
                      className="passport-input"
                      value={passportData.manufactureDate}
                      onChange={(e) => setPassportData({ ...passportData, manufactureDate: e.target.value })}
                    />
                  </div>
                  
                  <div className="passport-form-field">
                    <label>Производитель:</label>
                    <input
                      type="text"
                      className="passport-input"
                      value={passportData.manufacturer}
                      onChange={(e) => setPassportData({ ...passportData, manufacturer: e.target.value })}
                      placeholder="Введите производителя"
                    />
                  </div>
                  
                  <div className="passport-form-field">
                    <label>Дата поверки:</label>
                    <input
                      type="date"
                      className="passport-input"
                      value={passportData.verificationDate}
                      onChange={(e) => setPassportData({ ...passportData, verificationDate: e.target.value })}
                    />
                  </div>
                  
                  <div className="passport-form-field">
                    <label>Дата следующей поверки:</label>
                    <input
                      type="date"
                      className="passport-input"
                      value={passportData.nextVerificationDate}
                      onChange={(e) => setPassportData({ ...passportData, nextVerificationDate: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              
              {/* Кнопки действий */}
              <div className="passport-modal-actions">
                <button
                  className="passport-btn-save"
                  onClick={handleSavePassport}
                  disabled={passportSaving}
                >
                  {passportSaving ? 'Сохранение...' : '💾 Сохранить'}
                </button>
                <button
                  className="passport-btn-cancel"
                  onClick={handleClosePassport}
                  disabled={passportSaving}
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default BeliotDevicesTest;
