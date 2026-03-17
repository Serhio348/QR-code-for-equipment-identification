/**
 * Компонент для отображения счетчиков через Beliot API
 * 
 * Админ-панель с таблицей счетчиков слева и состоянием справа при наведении
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  BeliotDevice,
  DeviceReadings,
} from '../services/beliotDeviceApi';
import { useDeviceOverrides } from '../hooks/useDeviceOverrides';
import { useDevicePassport } from '../hooks/useDevicePassport';
import { supabase } from '@/shared/config/supabase';
import { useDeviceArchive } from '../hooks/useDeviceArchive';
import DeviceArchiveModal from './DeviceArchiveModal';
import DevicePassportModal from './DevicePassportModal';
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

  // Идентификатор выбранного устройства
  const currentDeviceId = selectedDevice ? String(selectedDevice.device_id || selectedDevice.id || selectedDevice._id) : null;

  // Мобильное UI состояние
  const [isGroupsPanelOpen, setIsGroupsPanelOpen] = useState<boolean>(false);
  const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [isMobileSearchVisible, setIsMobileSearchVisible] = useState<boolean>(false);

  // Хук управления архивом показаний
  const {
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
    archiveReadingsRaw,
    archiveReadings,
    fullChartData,
    archiveLoading,
    archiveError,
    refreshArchive,
    archiveTotalPages,
    archiveStartIndex,
    archiveEndIndex,
    archiveDisplayedReadings,
    handleGroupByChange,
    handleLoadArchiveData,
    handlePreviousPage,
    handleNextPage,
  } = useDeviceArchive(currentDeviceId);

  // Хук управления переопределениями счётчиков
  const {
    syncedOverrides,
    syncing,
    syncOverridesFromServer,
    updateLocalValue,
    syncOverrideToSupabase,
    getEditableValue,
  } = useDeviceOverrides();
  
  // Состояние для отслеживания редактируемой ячейки (устаревшее, будет удалено)
  const [editingCell, setEditingCell] = useState<{ deviceId: string; field: 'name' | 'address' | 'serialNumber' | 'object' } | null>(null);

  // Хук управления паспортом счётчика: состояние, drag, open/close/save/print/PDF, геттеры
  const {
    isPassportOpen,
    passportDevice,
    passportData,
    setPassportData,
    passportSaving,
    passportModalPosition,
    isDraggingPassport,
    handleOpenPassport,
    handleClosePassport,
    handleSavePassport,
    handlePassportModalMouseDown,
    handlePrintPassport,
    handleSavePassportAsPDF,
    getDeviceName,
    getDeviceSerialNumber,
    getDeviceObject,
  } = useDevicePassport({
    syncedOverrides,
    getEditableValue,
    updateLocalValue,
    syncOverridesFromServer,
    onCloseExtra: () => setIsMobileMenuOpen(false),
  });

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

  const buildDevicesFromSupabase = async (): Promise<BeliotDevice[]> => {
    const { data: overrides, error: overridesError } = await supabase
      .from('beliot_device_overrides')
      .select('device_id, name, object_name, serial_number, address')
      .order('object_name', { ascending: true });

    if (overridesError) {
      throw new Error(`Не удалось загрузить устройства из Supabase: ${overridesError.message}`);
    }

    const ids = (overrides || []).map((o: any) => String(o.device_id));
    if (ids.length === 0) {
      return [];
    }

    // Берём последние показания, чтобы заполнить last_message_type.1.in1 (нужно для текущего UI).
    const { data: readings, error: readingsError } = await supabase
      .from('beliot_device_readings')
      .select('device_id, reading_date, reading_value')
      .in('device_id', ids)
      .order('reading_date', { ascending: false })
      .limit(Math.min(ids.length * 5, 500));

    if (readingsError) {
      throw new Error(`Не удалось загрузить показания из Supabase: ${readingsError.message}`);
    }

    const lastById: Record<string, { value: number; date: string }> = {};
    for (const r of readings || []) {
      const id = String((r as any).device_id);
      if (!lastById[id]) {
        lastById[id] = { value: Number((r as any).reading_value), date: String((r as any).reading_date) };
      }
    }

    return (overrides || []).map((o: any) => {
      const id = String(o.device_id);
      const last = lastById[id];
      return {
        device_id: id,
        name: o.name ?? null,
        object_name: o.object_name ?? null,
        address: o.address ?? null,
        serial_number: o.serial_number ?? null,
        tied_point: o.object_name ? { place: String(o.object_name) } : undefined,
        last_message_type: last ? { '1': { in1: last.value, date: last.date } } : undefined,
      } as unknown as BeliotDevice;
    });
  };

  const handleGetDevices = async () => {
    setLoading(true);
    setError(null);
    setDevices([]);
    setSelectedGroup(null);
    setSelectedDevice(null);
    setDeviceReadings(null);

    try {
      console.log('🔄 Загрузка устройств из Supabase...');
      const supabaseDevices = await buildDevicesFromSupabase();
      console.log('✅ Устройства загружены:', supabaseDevices.length);
      setDevices(supabaseDevices);
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



  const getLastReading = (device: BeliotDevice): string => {
    let value: number | undefined;
    // Пробуем получить last_message_type.1.in1
    if (device.last_message_type && typeof device.last_message_type === 'object') {
      const msgType = device.last_message_type as Record<string, Record<string, number>>;
      if (msgType['1'] && msgType['1'].in1 !== undefined) {
        value = Number(msgType['1'].in1);
      }
    }
    // Альтернативные пути
    if (value === undefined && device.last_message_type?.['1']?.in1 !== undefined) {
      value = Number(device.last_message_type['1'].in1);
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
    setIsArchiveOpen(false); // Закрываем архив при выборе нового устройства
    setError(null);

    const deviceId = device.device_id || device.id || device._id;
    if (!deviceId) {
      setError('ID устройства не найден');
      setLoadingState(false);
      return;
    }

    try {
      console.log(`🔄 Загрузка последних показаний из Supabase: ${deviceId}...`);
      const { data, error: readingsError } = await supabase
        .from('beliot_device_readings')
        .select('reading_date, reading_value, unit')
        .eq('device_id', String(deviceId))
        .order('reading_date', { ascending: false })
        .limit(2);

      if (readingsError) {
        throw new Error(`Не удалось загрузить показания из Supabase: ${readingsError.message}`);
      }

      const current = data?.[0];
      const previous = data?.[1];

      const readings: DeviceReadings = {
        current: current
          ? {
              period: 'current',
              date: String((current as any).reading_date),
              value: Number((current as any).reading_value),
              unit: String((current as any).unit || 'м³'),
            }
          : undefined,
        previous: previous
          ? {
              period: 'previous',
              date: String((previous as any).reading_date),
              value: Number((previous as any).reading_value),
              unit: String((previous as any).unit || 'м³'),
            }
          : undefined,
      };

      setDeviceReadings(readings);

      // Обновляем last_message_type, чтобы таблица показывала актуальное значение без перезагрузки списка
      if (readings.current?.value !== undefined) {
        const id = String(deviceId);
        setDevices((prev) =>
          prev.map((d) => {
            const did = String(d.device_id || d.id || d._id);
            if (did !== id) return d;
            return {
              ...d,
              last_message_type: { '1': { in1: readings.current!.value as any, date: readings.current!.date as any } },
            } as BeliotDevice;
          }),
        );
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
                            const rawDate = deviceReadings.current.date;
                            // Если дата в секундах (Unix timestamp), конвертируем в миллисекунды
                            const dateMs = typeof rawDate === 'number' && rawDate < 10000000000 ? rawDate * 1000 : rawDate;
                            const date = new Date(dateMs as string | number);
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
                            const rawDate = deviceReadings.previous.date;
                            // Если дата в секундах (Unix timestamp), конвертируем в миллисекунды
                            const dateMs = typeof rawDate === 'number' && rawDate < 10000000000 ? rawDate * 1000 : rawDate;
                            const date = new Date(dateMs as string | number);
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
        <DeviceArchiveModal
          currentDeviceId={currentDeviceId}
          archiveViewType={archiveViewType}
          setArchiveViewType={setArchiveViewType}
          archiveDisplayMode={archiveDisplayMode}
          setArchiveDisplayMode={setArchiveDisplayMode}
          archiveGroupBy={archiveGroupBy}
          archiveDataLoaded={archiveDataLoaded}
          setArchiveDataLoaded={setArchiveDataLoaded}
          archiveCurrentPage={archiveCurrentPage}
          archivePageSize={archivePageSize}
          setArchivePageSize={setArchivePageSize}
          archiveStartDate={archiveStartDate}
          setArchiveStartDate={setArchiveStartDate}
          archiveEndDate={archiveEndDate}
          setArchiveEndDate={setArchiveEndDate}
          isArchiveSettingsCollapsed={isArchiveSettingsCollapsed}
          setIsArchiveSettingsCollapsed={setIsArchiveSettingsCollapsed}
          archiveReadingsRaw={archiveReadingsRaw}
          archiveReadings={archiveReadings}
          fullChartData={fullChartData}
          archiveLoading={archiveLoading}
          archiveError={archiveError}
          refreshArchive={refreshArchive}
          archiveTotalPages={archiveTotalPages}
          archiveStartIndex={archiveStartIndex}
          archiveEndIndex={archiveEndIndex}
          archiveDisplayedReadings={archiveDisplayedReadings}
          handleGroupByChange={handleGroupByChange}
          handleLoadArchiveData={handleLoadArchiveData}
          handlePreviousPage={handlePreviousPage}
          handleNextPage={handleNextPage}
          onClose={() => setIsArchiveOpen(false)}
        />
      )}

      {/* Модальное окно паспорта счетчика */}
      {isPassportOpen && passportDevice && (
        <DevicePassportModal
          passportDevice={passportDevice}
          passportData={passportData}
          setPassportData={setPassportData}
          passportSaving={passportSaving}
          passportModalPosition={passportModalPosition}
          isDraggingPassport={isDraggingPassport}
          getDeviceName={getDeviceName}
          handleClosePassport={handleClosePassport}
          handleSavePassport={handleSavePassport}
          handlePassportModalMouseDown={handlePassportModalMouseDown}
          handlePrintPassport={handlePrintPassport}
          handleSavePassportAsPDF={handleSavePassportAsPDF}
        />
      )}
    </div>
  );
};

export default BeliotDevicesTest;
