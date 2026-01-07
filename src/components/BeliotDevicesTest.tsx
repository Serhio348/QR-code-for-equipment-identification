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
} from '../services/api/beliotDevicesStorageApi';
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
  
  // Состояние для переключения между текущими (API) и историческими (Supabase) показаниями
  const [readingsView, setReadingsView] = useState<'current' | 'history'>('current');
  
  // Состояние для архивных данных (для будущего локального архива)
  const [archiveData, setArchiveData] = useState<any>(null);
  
  // Состояние для управления мобильными панелями
  const [isGroupsPanelOpen, setIsGroupsPanelOpen] = useState<boolean>(false);
  const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState<boolean>(false);
  
  // Хук для работы с историческими показаниями из Supabase
  const deviceId = selectedDevice ? String(selectedDevice.device_id || selectedDevice.id || selectedDevice._id) : null;
  const {
    readings: historicalReadings,
    stats: readingStats,
    loading: historicalLoading,
    error: historicalError,
    total: historicalTotal,
    hasMore: historicalHasMore,
    loadMore: loadMoreHistorical,
    refresh: refreshHistorical,
    loadStats,
  } = useBeliotDeviceReadings(deviceId, {
    reading_type: 'hourly',
    limit: 50,
  });
  
  // Загружаем статистику при переключении на исторический вид
  useEffect(() => {
    if (readingsView === 'history' && deviceId) {
      loadStats();
    }
  }, [readingsView, deviceId, loadStats]);
  
  // Хранилище пользовательских изменений (localStorage)
  const {
    updateOverride: updateLocalOverride,
    getOverride: getLocalOverride,
  } = useBeliotDevicesStorage();
  
  // Состояние для синхронизированных изменений из Google Sheets
  const [syncedOverrides, setSyncedOverrides] = useState<Record<string, BeliotDeviceOverride>>({});
  const [syncing, setSyncing] = useState<boolean>(false);
  
  // Состояние для отслеживания редактируемой ячейки
  const [editingCell, setEditingCell] = useState<{ deviceId: string; field: 'name' | 'address' | 'serialNumber' | 'object' } | null>(null);

  // Загрузка устройств и синхронизация при монтировании компонента
  useEffect(() => {
    handleGetDevices();
    syncOverridesFromServer();
  }, []);

  // Синхронизация изменений с Google Sheets
  const syncOverridesFromServer = useCallback(async () => {
    try {
      setSyncing(true);
      console.log('🔄 Синхронизация изменений счетчиков с Google Sheets...');
      const serverOverrides = await getBeliotDevicesOverrides();
      setSyncedOverrides(serverOverrides);
      console.log('✅ Синхронизация завершена:', Object.keys(serverOverrides).length, 'устройств');
    } catch (error: any) {
      console.error('❌ Ошибка синхронизации с Google Sheets:', error);
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

  // Синхронизация изменений с Google Sheets (вызывается при onBlur или Enter)
  const syncOverrideToSheets = useCallback(async (
    deviceId: string,
    field: 'name' | 'address' | 'serialNumber' | 'object'
  ) => {
    console.log('💾 syncOverrideToSheets вызван:', { deviceId, field });
    
    if (!deviceId) {
      console.error('❌ syncOverrideToSheets: deviceId не указан!', { deviceId, field });
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
      const currentOverride = getLocalOverride(deviceId) || {};
      const overrideData = {
        ...currentOverride,
      };
      console.log('💾 Отправка данных в Google Sheets:', { deviceId, overrideData });
      await saveBeliotDeviceOverride(deviceId, overrideData);
      console.log(`✅ Изменения для устройства ${deviceId} синхронизированы с Google Sheets`);
      
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
    
    // Приоритет 2: Google Sheets (синхронизированные изменения)
    const syncedOverride = syncedOverrides[id];
    if (syncedOverride && syncedOverride[field] !== undefined) {
      return syncedOverride[field]!;
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
          const currentDate = (currentDateValue && typeof currentDateValue === 'object' && 'getTime' in currentDateValue)
            ? currentDateValue as Date
            : new Date(String(currentDateValue));
          
          await saveBeliotReading({
            device_id: deviceId.toString(),
            reading_date: currentDate,
            reading_value: Number(readings.current.value),
            unit: 'м³',
            reading_type: 'hourly',
            source: 'api',
            period: 'current',
          });
          console.log('✅ Текущее показание сохранено в Supabase');
        }

        if (readings.previous?.value !== undefined && readings.previous?.date) {
          const previousDateValue = readings.previous.date;
          const previousDate = (previousDateValue && typeof previousDateValue === 'object' && 'getTime' in previousDateValue)
            ? previousDateValue as Date
            : new Date(String(previousDateValue));
          
          await saveBeliotReading({
            device_id: deviceId.toString(),
            reading_date: previousDate,
            reading_value: Number(readings.previous.value),
            unit: 'м³',
            reading_type: 'hourly',
            source: 'api',
            period: 'previous',
          });
          console.log('✅ Предыдущее показание сохранено в Supabase');
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
                                    await syncOverrideToSheets(deviceId, 'name');
                                    setEditingCell(null);
                                  }}
                                  onKeyDown={async (e) => {
                                    if (e.key === 'Enter') {
                                      await syncOverrideToSheets(deviceId, 'name');
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
                                    await syncOverrideToSheets(deviceId, 'serialNumber');
                                    setEditingCell(null);
                                  }}
                                  onKeyDown={async (e) => {
                                    if (e.key === 'Enter') {
                                      await syncOverrideToSheets(deviceId, 'serialNumber');
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
                                    await syncOverrideToSheets(deviceId, 'object');
                                    setEditingCell(null);
                                  }}
                                  onKeyDown={async (e) => {
                                    if (e.key === 'Enter') {
                                      await syncOverrideToSheets(deviceId, 'object');
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
                    <div className="readings-view-toggle">
                      <button
                        className={`toggle-btn ${readingsView === 'current' ? 'active' : ''}`}
                        onClick={() => setReadingsView('current')}
                        disabled={loadingState}
                      >
                        Текущие (API)
                      </button>
                      <button
                        className={`toggle-btn ${readingsView === 'history' ? 'active' : ''}`}
                        onClick={() => setReadingsView('history')}
                        disabled={historicalLoading}
                      >
                        История (Supabase)
                        {historicalTotal > 0 && (
                          <span className="badge">({historicalTotal})</span>
                        )}
                      </button>
                    </div>
                  </div>
                  {(readingsView === 'current' && loadingState) || (readingsView === 'history' && historicalLoading) ? (
                    <div className="loading-state">
                      <div className="spinner"></div>
                      <p>Загрузка показаний...</p>
                    </div>
                  ) : (readingsView === 'current' && error) || (readingsView === 'history' && historicalError) ? (
                    <div className="error-state">
                      <strong>❌ Ошибка:</strong> {readingsView === 'current' ? error : historicalError?.message || 'Не удалось загрузить показания'}
                    </div>
                  ) : readingsView === 'history' ? (
                    // Отображение исторических показаний из Supabase
                    <div className="readings-container">
                      {historicalReadings.length === 0 ? (
                        <div className="empty-state">
                          <p>Исторические показания не найдены</p>
                          <p className="hint">Показания будут доступны после настройки автоматического сбора через Railway</p>
                        </div>
                      ) : (
                        <>
                          {readingStats && (
                            <div className="reading-stats">
                              <h5>Статистика</h5>
                              <div className="stats-grid">
                                <div className="stat-item">
                                  <span className="stat-label">Записей:</span>
                                  <span className="stat-value">{readingStats.count}</span>
                                </div>
                                <div className="stat-item">
                                  <span className="stat-label">Мин:</span>
                                  <span className="stat-value">{readingStats.min_value.toFixed(2)}</span>
                                </div>
                                <div className="stat-item">
                                  <span className="stat-label">Макс:</span>
                                  <span className="stat-value">{readingStats.max_value.toFixed(2)}</span>
                                </div>
                                <div className="stat-item">
                                  <span className="stat-label">Среднее:</span>
                                  <span className="stat-value">{readingStats.avg_value.toFixed(2)}</span>
                                </div>
                                <div className="stat-item">
                                  <span className="stat-label">Потребление:</span>
                                  <span className="stat-value">{readingStats.total_consumption.toFixed(2)} м³</span>
                                </div>
                              </div>
                            </div>
                          )}
                          <table className="readings-table">
                            <thead>
                              <tr>
                                <th>Дата</th>
                                <th>Значение</th>
                                <th>Единица</th>
                                <th>Тип</th>
                                <th>Период</th>
                              </tr>
                            </thead>
                            <tbody>
                              {historicalReadings.map((reading, index) => {
                                const readingDate = new Date(reading.reading_date);
                                const prevReading = historicalReadings[index + 1];
                                const consumption = prevReading 
                                  ? reading.reading_value - prevReading.reading_value 
                                  : null;
                                
                                return (
                                  <tr key={reading.id} className="reading-row historical">
                                    <td>{readingDate.toLocaleString('ru-RU')}</td>
                                    <td className="reading-value">{reading.reading_value.toFixed(2)}</td>
                                    <td>{reading.unit}</td>
                                    <td>
                                      <span className={`type-badge ${reading.reading_type}`}>
                                        {reading.reading_type === 'hourly' ? 'Почасовой' : 'Ежедневный'}
                                      </span>
                                    </td>
                                    <td>
                                      {consumption !== null && consumption > 0 && (
                                        <span className="consumption-value">+{consumption.toFixed(2)} м³</span>
                                      )}
                                      {consumption === null && '-'}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          {historicalHasMore && (
                            <div className="load-more-container">
                              <button 
                                className="load-more-btn"
                                onClick={loadMoreHistorical}
                                disabled={historicalLoading}
                              >
                                Загрузить еще
                              </button>
                            </div>
                          )}
                          <div className="readings-info">
                            <p>Показано: {historicalReadings.length} из {historicalTotal}</p>
                            <button 
                              className="refresh-btn"
                              onClick={refreshHistorical}
                              disabled={historicalLoading}
                            >
                              Обновить
                            </button>
                          </div>
                        </>
                      )}
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

                    const calculatePeriod = (): string => {
                      if (deviceReadings.current?.date && deviceReadings.previous?.date) {
                        try {
                          // Конвертируем даты, если они в секундах (Unix timestamp)
                          let currentDateValue: string | number = deviceReadings.current.date;
                          let previousDateValue: string | number = deviceReadings.previous.date;
                          
                          if (typeof currentDateValue === 'number' && currentDateValue < 10000000000) {
                            currentDateValue = currentDateValue * 1000;
                          }
                          if (typeof previousDateValue === 'number' && previousDateValue < 10000000000) {
                            previousDateValue = previousDateValue * 1000;
                          }
                          
                          const currentDate = new Date(currentDateValue);
                          const previousDate = new Date(previousDateValue);
                          
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
                      <div className="readings-container">
                        <table className="readings-table">
                          <thead>
                            <tr>
                              <th>Период</th>
                              <th>Дата</th>
                              <th>Значение</th>
                              <th>Единица измерения</th>
                              <th>Объем</th>
                              <th>Период разницы</th>
                            </tr>
                          </thead>
                          <tbody>
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
                                <td>-</td>
                                <td>-</td>
                              </tr>
                            )}
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
                                <td>-</td>
                                <td>-</td>
                              </tr>
                            )}
                            {volume !== null && (
                              <tr className="reading-row difference">
                                <td className="period-badge difference">Разница</td>
                                <td>-</td>
                                <td className="reading-value difference-value">{volume.toFixed(2)}</td>
                                <td>м³</td>
                                <td className="volume-value">{volume.toFixed(2)}</td>
                                <td className="period-value">{period}</td>
                              </tr>
                            )}
                            {!deviceReadings.current && !deviceReadings.previous && (
                              <tr>
                                <td colSpan={6} className="no-readings">
                                  Показания не найдены
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
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
                                    await syncOverrideToSheets(deviceId, 'name');
                                    setEditingCell(null);
                                  }}
                                  onKeyDown={async (e) => {
                                    if (e.key === 'Enter') {
                                      await syncOverrideToSheets(deviceId, 'name');
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
                                    await syncOverrideToSheets(deviceId, 'serialNumber');
                                    setEditingCell(null);
                                  }}
                                  onKeyDown={async (e) => {
                                    if (e.key === 'Enter') {
                                      await syncOverrideToSheets(deviceId, 'serialNumber');
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
