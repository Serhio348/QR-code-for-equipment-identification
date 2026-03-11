/**
 * Компонент для отображения счетчиков через Beliot API
 * 
 * Админ-панель с таблицей счетчиков слева и состоянием справа при наведении
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  getCompanyDevices,
  getDeviceById,
  getDeviceReadings,
  BeliotDevice,
  DeviceReadings,
} from '../services/beliotDeviceApi';
import { useDeviceOverrides } from '../hooks/useDeviceOverrides';
import { useDevicePassport } from '../hooks/useDevicePassport';
import { saveBeliotReading } from '../services/supabaseBeliotReadingsApi';
import { useDeviceArchive } from '../hooks/useDeviceArchive';
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
          
          if (currentDateValue instanceof Date) {
            currentDate = currentDateValue;
          } else if (currentDateValue && typeof currentDateValue === 'object') {
            currentDate = new Date(String(currentDateValue));
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
          
          if (previousDateValue instanceof Date) {
            previousDate = previousDateValue;
          } else if (previousDateValue && typeof previousDateValue === 'object') {
            previousDate = new Date(String(previousDateValue));
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
