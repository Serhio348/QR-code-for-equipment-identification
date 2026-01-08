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
} from '../services/api/beliotDeviceApi';
import { useBeliotDevicesStorage } from '../hooks/useBeliotDevicesStorage';
import {
  getBeliotDevicesOverrides,
  saveBeliotDeviceOverride,
  BeliotDeviceOverride,
} from '../services/api/supabaseBeliotOverridesApi';
import { useBeliotDeviceReadings } from '../hooks/useBeliotDeviceReadings';
import { saveBeliotReading } from '../services/api/supabaseBeliotReadingsApi';
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
  const [archiveData, setArchiveData] = useState<any>(null);
  
  // Состояние для управления архивом текущих показаний
  const [isArchiveOpen, setIsArchiveOpen] = useState<boolean>(false);
  const [archiveViewType, setArchiveViewType] = useState<'readings' | 'volume'>('readings');
  const [archivePageSize, setArchivePageSize] = useState<number>(10);
  const [archiveGroupBy, setArchiveGroupBy] = useState<'hour' | 'day' | 'week' | 'month' | 'year'>('hour');
  const [archiveDataLoaded, setArchiveDataLoaded] = useState<boolean>(false);
  const [archiveCurrentPage, setArchiveCurrentPage] = useState<number>(1);
  const [archiveStartDate, setArchiveStartDate] = useState<string>(() => {
    // По умолчанию: начало текущих суток
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today.toISOString().split('T')[0];
  });
  const [archiveEndDate, setArchiveEndDate] = useState<string>(() => {
    // По умолчанию: конец текущих суток
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return today.toISOString().split('T')[0];
  });
  
  // Состояние для управления мобильными панелями
  const [isGroupsPanelOpen, setIsGroupsPanelOpen] = useState<boolean>(false);
  const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState<boolean>(false);
  
  // Функция для установки дат по умолчанию в зависимости от группировки
  const updateDefaultDates = useCallback((groupBy: 'hour' | 'day' | 'week' | 'month' | 'year') => {
    const today = new Date();
    
    switch (groupBy) {
      case 'hour':
        // Для часов: последние сутки
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);
        today.setHours(23, 59, 59, 999);
        setArchiveStartDate(yesterday.toISOString().split('T')[0]);
        setArchiveEndDate(today.toISOString().split('T')[0]);
        break;
      case 'day':
        // Для дней: текущий месяц
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        setArchiveStartDate(monthStart.toISOString().split('T')[0]);
        setArchiveEndDate(today.toISOString().split('T')[0]);
        break;
      case 'week':
        // Для недель: текущий месяц
        const weekMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        setArchiveStartDate(weekMonthStart.toISOString().split('T')[0]);
        setArchiveEndDate(today.toISOString().split('T')[0]);
        break;
      case 'month':
        // Для месяцев: текущий год
        const yearStart = new Date(today.getFullYear(), 0, 1);
        setArchiveStartDate(yearStart.toISOString().split('T')[0]);
        setArchiveEndDate(today.toISOString().split('T')[0]);
        break;
      case 'year':
        // Для лет: последние 5 лет
        const fiveYearsAgo = new Date(today.getFullYear() - 5, 0, 1);
        setArchiveStartDate(fiveYearsAgo.toISOString().split('T')[0]);
        setArchiveEndDate(today.toISOString().split('T')[0]);
        break;
    }
    // Сбрасываем флаг загрузки при изменении группировки
    setArchiveDataLoaded(false);
  }, []);
  
  // Хук для работы с архивными данными текущего устройства
  // autoLoad: false - не загружаем автоматически, только по кнопке
  const currentDeviceId = selectedDevice ? String(selectedDevice.device_id || selectedDevice.id || selectedDevice._id) : null;
  const {
    readings: archiveReadingsRaw,
    loading: archiveLoading,
    error: archiveError,
    refresh: refreshArchive,
  } = useBeliotDeviceReadings((isArchiveOpen && archiveDataLoaded) ? currentDeviceId : null, {
    reading_type: 'hourly',
    limit: archivePageSize,
    start_date: archiveStartDate ? `${archiveStartDate}T00:00:00.000Z` : undefined,
    end_date: archiveEndDate ? `${archiveEndDate}T23:59:59.999Z` : undefined,
    autoLoad: false, // Не загружаем автоматически
  });
  
  // Обработчик изменения группировки
  const handleGroupByChange = useCallback((newGroupBy: 'hour' | 'day' | 'week' | 'month' | 'year') => {
    setArchiveGroupBy(newGroupBy);
    updateDefaultDates(newGroupBy);
  }, [updateDefaultDates]);
  
  // Обработчик загрузки данных
  const handleLoadArchiveData = useCallback(() => {
    if (!currentDeviceId) return;
    setArchiveDataLoaded(true);
    // Данные загрузятся автоматически, так как currentDeviceId теперь передается в хук
    refreshArchive();
  }, [currentDeviceId, refreshArchive]);

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
      let consumption = 0;
      
      if (groupReadings && groupReadings.length > 0) {
        // Сортируем показания в группе по дате (от старых к новым)
        const sorted = [...groupReadings].sort((a, b) => 
          new Date(a.reading_date).getTime() - new Date(b.reading_date).getTime()
        );
        
        // Берем последнее показание в группе как основное
        reading = sorted[sorted.length - 1];
        const firstReading = sorted[0];
        
        // Вычисляем потребление (разница между первым и последним показанием в группе)
        if (sorted.length > 1) {
          consumption = Number(reading.reading_value) - Number(firstReading.reading_value);
        }
      }
      
      allPeriods.push({
        groupKey: key,
        groupDate: periodDate,
        reading,
        consumption,
      });
    }

    // Сортируем по дате (от новых к старым - по убыванию)
    return allPeriods.sort((a, b) => b.groupDate.getTime() - a.groupDate.getTime());
  }, []);

  // Группированные показания со всеми периодами в диапазоне
  const archiveReadings = useMemo(() => {
    if (!archiveStartDate || !archiveEndDate) return [];
    
    const startDateStr = `${archiveStartDate}T00:00:00.000Z`;
    const endDateStr = `${archiveEndDate}T23:59:59.999Z`;
    
    return groupReadings(archiveReadingsRaw, archiveGroupBy, startDateStr, endDateStr);
  }, [archiveReadingsRaw, archiveGroupBy, archiveStartDate, archiveEndDate, groupReadings]);
  
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
    if (isArchiveOpen && currentDeviceId && archiveDataLoaded) {
      // При изменении диапазона дат перезагружаем данные
      refreshArchive();
    }
  }, [archiveStartDate, archiveEndDate, currentDeviceId, isArchiveOpen, archiveDataLoaded, refreshArchive]);
  
  // При открытии/закрытии архива сбрасываем флаг загрузки
  useEffect(() => {
    if (!isArchiveOpen) {
      setArchiveDataLoaded(false);
      setArchiveCurrentPage(1);
    } else {
      // При открытии архива также сбрасываем флаг, чтобы показать кнопку загрузки
      setArchiveDataLoaded(false);
      setArchiveCurrentPage(1);
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
  
  // Состояние для отслеживания редактируемой ячейки
  const [editingCell, setEditingCell] = useState<{ deviceId: string; field: 'name' | 'address' | 'serialNumber' | 'object' } | null>(null);

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
                        <th>Счётчик</th>
                        <th>Серийный номер</th>
                        <th>Объект</th>
                        <th>Показание</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedGroup.devices.map((device, index) => {
                        const deviceId = String(device.device_id || device.id || device._id);
                        const isSelected = selectedDevice === device;
                        const isEditingName = editingCell?.deviceId === deviceId && editingCell?.field === 'name';
                        const isEditingSerial = editingCell?.deviceId === deviceId && editingCell?.field === 'serialNumber';
                        
                        return (
                          <tr
                            key={deviceId || index}
                            className={isSelected ? 'selected' : ''}
                            onClick={(e) => {
                              // Не вызываем handleDeviceClick если кликнули на редактируемую ячейку
                              if ((e.target as HTMLElement).tagName !== 'INPUT') {
                                handleDeviceClick(device);
                              }
                            }}
                            style={{ cursor: 'pointer' }}
                          >
                            <td
                              className="editable-cell"
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                setEditingCell({ deviceId, field: 'name' });
                              }}
                            >
                              {isEditingName ? (
                                <input
                                  type="text"
                                  className="editable-input"
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
                                <span className="editable-text">{getDeviceName(device)}</span>
                              )}
                            </td>
                            <td
                              className="editable-cell"
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                setEditingCell({ deviceId, field: 'serialNumber' });
                              }}
                            >
                              {isEditingSerial ? (
                                <input
                                  type="text"
                                  className="editable-input"
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
                                <span className="editable-text">{getDeviceSerialNumber(device)}</span>
                              )}
                            </td>
                            <td
                              className="editable-cell"
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                setEditingCell({ deviceId, field: 'object' });
                              }}
                            >
                              {editingCell?.deviceId === deviceId && editingCell?.field === 'object' ? (
                                <input
                                  type="text"
                                  className="editable-input"
                                  value={getEditableValue(deviceId, 'object', getDeviceObject(device))}
                                  onChange={(e) => updateLocalValue(deviceId, 'object', e.target.value)}
                                  onBlur={async () => {
                                    await syncOverrideToSupabase(deviceId, 'object');
                                    setEditingCell(null);
                                  }}
                                  onKeyDown={async (e) => {
                                    if (e.key === 'Enter') {
                                      await syncOverrideToSupabase(deviceId, 'object');
                                      setEditingCell(null);
                                    } else if (e.key === 'Escape') {
                                      setEditingCell(null);
                                    }
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  autoFocus
                                />
                              ) : (
                                <span className="editable-text">{getDeviceObject(device)}</span>
                              )}
                            </td>
                            <td className="reading-cell">{getLastReading(device)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Показания выбранного счетчика */}
              {selectedDevice && (
                <div className="device-state-section">
                  <div className="section-header-with-actions">
                    <h4>Показания счетчика: {selectedDevice.name || selectedDevice.device_id || selectedDevice.id}</h4>
                  </div>
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
                    // Вычисляем разницу значений и период между датами
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

                    const volume = calculateVolume();

                    return (
                      <div className="readings-container">
                        <table className="readings-table">
                          <thead>
                            <tr>
                              <th>Период</th>
                              <th>Дата</th>
                              <th>Значение</th>
                              <th>Единица измерения</th>
                              <th>Архив</th>
                            </tr>
                          </thead>
                          <tbody>
                            {deviceReadings.previous && (
                              <tr className="reading-row previous">
                                <td className="period-badge previous">Предыдущий</td>
                                <td>
                                  {deviceReadings.previous.date ? (() => {
                                    let dateValue: string | number = deviceReadings.previous.date;
                                    // Если дата в секундах (Unix timestamp), конвертируем в миллисекунды
                                    if (typeof dateValue === 'number' && dateValue < 10000000000) {
                                      dateValue = dateValue * 1000;
                                    }
                                    const date = new Date(dateValue);
                                    if (isNaN(date.getTime())) return '-';
                                    return date.toLocaleString('ru-RU');
                                  })() : '-'}
                                </td>
                                <td className="reading-value">{deviceReadings.previous.value !== undefined ? deviceReadings.previous.value : '-'}</td>
                                <td>{deviceReadings.previous.unit || 'м³'}</td>
                                <td rowSpan={(deviceReadings.current ? 1 : 0) + (volume !== null ? 1 : 0) + 1}>
                                  <button
                                    className={`archive-btn ${isArchiveOpen ? 'active' : ''}`}
                                    onClick={() => setIsArchiveOpen(!isArchiveOpen)}
                                    title="Показать архив"
                                  >
                                    <span className="archive-icon">☰</span>
                                    <span className="archive-text">Архив</span>
                                  </button>
                                </td>
                              </tr>
                            )}
                            {deviceReadings.current && (
                              <tr className="reading-row current">
                                <td className="period-badge current">Текущий</td>
                                <td>
                                  {deviceReadings.current.date ? (() => {
                                    let dateValue: string | number = deviceReadings.current.date;
                                    // Если дата в секундах (Unix timestamp), конвертируем в миллисекунды
                                    if (typeof dateValue === 'number' && dateValue < 10000000000) {
                                      dateValue = dateValue * 1000;
                                    }
                                    const date = new Date(dateValue);
                                    if (isNaN(date.getTime())) return '-';
                                    return date.toLocaleString('ru-RU');
                                  })() : '-'}
                                </td>
                                <td className="reading-value">{deviceReadings.current.value !== undefined ? deviceReadings.current.value : '-'}</td>
                                <td>{deviceReadings.current.unit || 'м³'}</td>
                                {!deviceReadings.previous && (
                                  <td rowSpan={(volume !== null ? 1 : 0) + 1}>
                                    <button
                                      className={`archive-btn ${isArchiveOpen ? 'active' : ''}`}
                                      onClick={() => setIsArchiveOpen(!isArchiveOpen)}
                                      title="Показать архив"
                                    >
                                      <span className="archive-icon">☰</span>
                                      <span className="archive-text">Архив</span>
                                    </button>
                                  </td>
                                )}
                              </tr>
                            )}
                            {volume !== null && (
                              <tr className="reading-row difference">
                                <td className="period-badge difference">Разница</td>
                                <td>-</td>
                                <td className="reading-value difference-value">{volume.toFixed(2)}</td>
                                <td>м³</td>
                                {!deviceReadings.previous && !deviceReadings.current && (
                                  <td>
                                    <button
                                      className={`archive-btn ${isArchiveOpen ? 'active' : ''}`}
                                      onClick={() => setIsArchiveOpen(!isArchiveOpen)}
                                      title="Показать архив"
                                    >
                                      <span className="archive-icon">☰</span>
                                      <span className="archive-text">Архив</span>
                                    </button>
                                  </td>
                                )}
                              </tr>
                            )}
                            {!deviceReadings.current && !deviceReadings.previous && (
                              <tr>
                                <td colSpan={4} className="no-readings">
                                  Показания не найдены
                                </td>
                                <td>
                                  <button
                                    className={`archive-btn ${isArchiveOpen ? 'active' : ''}`}
                                    onClick={() => setIsArchiveOpen(!isArchiveOpen)}
                                    title="Показать архив"
                                  >
                                    <span className="archive-icon">☰</span>
                                    <span className="archive-text">Архив</span>
                                  </button>
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                        
                        {/* Архивная таблица */}
                        {isArchiveOpen && (
                          <div className="archive-section">
                            <div className="archive-header">
                              <h5>Архивные данные</h5>
                              <div className="archive-controls">
                                {/* Выбор диапазона дат */}
                                <div className="archive-date-range">
                                  <label>С:</label>
                                  <input
                                    type="date"
                                    className="archive-date-input"
                                    value={archiveStartDate}
                                    onChange={(e) => {
                                      setArchiveStartDate(e.target.value);
                                      setArchiveDataLoaded(false); // Сбрасываем флаг загрузки при изменении даты
                                    }}
                                  />
                                  <label>По:</label>
                                  <input
                                    type="date"
                                    className="archive-date-input"
                                    value={archiveEndDate}
                                    onChange={(e) => {
                                      setArchiveEndDate(e.target.value);
                                      setArchiveDataLoaded(false); // Сбрасываем флаг загрузки при изменении даты
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
                                
                                {/* Переключатель показания/объем */}
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
                            </div>
                            
                            {!archiveDataLoaded ? (
                              <div className="empty-state">
                                <p>Нажмите кнопку "Загрузить данные" для просмотра архива</p>
                                <p style={{ fontSize: '12px', color: '#999', marginTop: '8px' }}>
                                  Период: {archiveStartDate} - {archiveEndDate} ({archiveGroupBy === 'hour' ? 'последние сутки' : archiveGroupBy === 'day' ? 'текущий месяц' : archiveGroupBy === 'week' ? 'текущий месяц' : archiveGroupBy === 'month' ? 'текущий год' : 'последние 5 лет'})
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
                                      // Вычисляем реальный индекс в полном массиве для получения предыдущего показания
                                      const realIndex = archiveStartIndex + displayIndex;
                                      const readingDate = groupedReading.groupDate;
                                      const hasReading = !!groupedReading.reading;
                                      
                                      // Форматируем дату в зависимости от группировки (всегда отображаем дату, даже если нет данных)
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
                                      
                                      // Потребление: разница между текущим и предыдущим показанием
                                      // Для всех группировок (hour, day, week, month, year) используем фактический подсчет
                                      let consumption = 0;
                                      if (hasReading) {
                                        // Ищем предыдущее показание с данными
                                        // Так как сортировка от новых к старым, предыдущее по времени = следующее по индексу
                                        let foundPreviousReading = null;
                                        for (let i = realIndex + 1; i < archiveReadings.length; i++) {
                                          if (archiveReadings[i]?.reading) {
                                            foundPreviousReading = archiveReadings[i];
                                            break;
                                          }
                                        }
                                        
                                        if (foundPreviousReading?.reading) {
                                          // Есть предыдущее показание - вычисляем разницу (текущее - предыдущее)
                                          // Так как сортировка от новых к старым, текущее больше предыдущего
                                          consumption = Number(groupedReading.reading.reading_value) - Number(foundPreviousReading.reading.reading_value);
                                        } else {
                                          // Это последнее (самое старое) показание - потребление равно 0
                                          consumption = 0;
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
                                              {hasReading && consumption !== 0 ? (consumption > 0 ? `+${consumption.toFixed(2)}` : consumption.toFixed(2)) : '-'}
                                            </td>
                                          )}
                                          <td>{hasReading ? groupedReading.reading.unit : '-'}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                                
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
                                      Страница {archiveCurrentPage} из {archiveTotalPages}
                                      <span style={{ marginLeft: '8px', fontSize: '12px', color: '#666' }}>
                                        (Показано {archiveStartIndex + 1}-{Math.min(archiveEndIndex, archiveReadings.length)} из {archiveReadings.length})
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
                        )}
                      </div>
                    );
                  })() : (
                    <div className="empty-state">
                      Нажмите на счетчик в таблице для просмотра показаний
                    </div>
                  )}
                  
                  {/* Архивные данные (будут загружаться из локального архива) */}
                  {archiveData && (
                    <div className="archive-data-section">
                      <h5>Архивные данные за период</h5>
                      <p style={{ color: '#666', fontStyle: 'italic' }}>
                        Функционал локального архива будет реализован позже
                      </p>
                    </div>
                  )}
                </div>
              )}
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
            </div>
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
                }}
              >
                назад
              </button>
              <h3>{selectedGroup.name}</h3>
            </div>
            <div className="group-devices-table-container">
              <table className="group-devices-table">
                <thead>
                  <tr>
                    <th>Счётчик</th>
                    <th>Показание</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedGroup.devices.map((device, index) => {
                    const deviceId = String(device.device_id || device.id || device._id);
                    const isSelected = selectedDevice === device;
                    const isEditingName = editingCell?.deviceId === deviceId && editingCell?.field === 'name';
                    const isEditingSerial = editingCell?.deviceId === deviceId && editingCell?.field === 'serialNumber';
                    
                    return (
                      <tr
                        key={deviceId || index}
                        className={isSelected ? 'selected' : ''}
                        onClick={async (e) => {
                          if ((e.target as HTMLElement).tagName !== 'INPUT') {
                            await handleDeviceClick(device);
                            // На мобильных не открываем боковую панель, показываем в основном контенте
                          }
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        <td className="device-info-cell">
                          <div className="device-name-container">
                            <div
                              className="editable-cell device-name-editable"
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                setEditingCell({ deviceId, field: 'name' });
                              }}
                            >
                              {isEditingName ? (
                                <input
                                  type="text"
                                  className="editable-input"
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
                                <span className="editable-text device-name-text">{getDeviceName(device) || '-'}</span>
                              )}
                            </div>
                            <div
                              className="editable-cell device-serial-editable"
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                setEditingCell({ deviceId, field: 'serialNumber' });
                              }}
                            >
                              {isEditingSerial ? (
                                <input
                                  type="text"
                                  className="editable-input"
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
                                <span className="editable-text device-serial-text">{getDeviceSerialNumber(device) || '-'}</span>
                              )}
                            </div>
                            <div className="device-object-text">
                              {getDeviceObject(device) || '-'}
                            </div>
                          </div>
                        </td>
                        <td className="reading-cell">{getLastReading(device) || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
                }}
              >
                назад
              </button>
              <h3>{getDeviceName(selectedDevice) || selectedDevice.device_id || selectedDevice.id}</h3>
            </div>
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
    </div>
  );
};

export default BeliotDevicesTest;
