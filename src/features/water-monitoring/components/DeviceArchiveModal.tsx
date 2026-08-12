/**
 * DeviceArchiveModal
 *
 * Модальное окно архивных данных счётчика:
 * настройки диапазона дат, группировки, режима отображения,
 * таблица с пагинацией и график.
 */

import React from 'react';
import type { BeliotDeviceReading } from '../services/supabaseBeliotReadingsApi';
import {
  ArchiveGroupBy,
  ArchiveViewType,
  ArchiveDisplayMode,
  ArchiveChartPoint,
  GroupedReading,
  computeArchivePeriodVolume,
} from '../hooks/useDeviceArchive';
import DeviceArchiveChart from './DeviceArchiveChart';

interface DeviceArchiveModalProps {
  currentDeviceId: string | null;
  // Состояние
  archiveViewType: ArchiveViewType;
  setArchiveViewType: (v: ArchiveViewType) => void;
  archiveDisplayMode: ArchiveDisplayMode;
  setArchiveDisplayMode: (v: ArchiveDisplayMode) => void;
  archiveGroupBy: ArchiveGroupBy;
  archiveDataLoaded: boolean;
  setArchiveDataLoaded: (v: boolean) => void;
  archiveCurrentPage: number;
  archivePageSize: number;
  setArchivePageSize: (v: number) => void;
  archiveStartDate: string;
  setArchiveStartDate: (v: string) => void;
  archiveEndDate: string;
  setArchiveEndDate: (v: string) => void;
  isArchiveSettingsCollapsed: boolean;
  setIsArchiveSettingsCollapsed: (v: boolean) => void;
  // Данные
  archiveReadingsRaw: BeliotDeviceReading[] | null;
  archiveReadings: GroupedReading[];
  fullChartData: ArchiveChartPoint[];
  archiveLoading: boolean;
  archiveError: Error | null;
  refreshArchive: () => void;
  // Пагинация
  archiveTotalPages: number;
  archiveStartIndex: number;
  archiveEndIndex: number;
  archiveDisplayedReadings: GroupedReading[];
  // Обработчики
  handleGroupByChange: (groupBy: ArchiveGroupBy) => void;
  handleLoadArchiveData: () => void;
  handlePreviousPage: () => void;
  handleNextPage: () => void;
  onClose: () => void;
}

const DeviceArchiveModal: React.FC<DeviceArchiveModalProps> = ({
  currentDeviceId,
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
  archiveLoading, archiveError,
  refreshArchive,
  archiveTotalPages,
  archiveStartIndex, archiveEndIndex,
  archiveDisplayedReadings,
  handleGroupByChange,
  handleLoadArchiveData,
  handlePreviousPage, handleNextPage,
  onClose,
}) => {
  const rawReadings = archiveReadingsRaw ?? [];

  return (
    <>
      {/* Затемнённый фон */}
      <div className="archive-modal-overlay" onClick={onClose} />

      {/* Модальное окно */}
      <div className="archive-modal">
        <div className="archive-modal-header">
          <h3>Архивные данные</h3>
          <button className="archive-modal-close" onClick={onClose} title="Закрыть">
            ×
          </button>
        </div>

        <div className="archive-modal-content">
          {/* Кнопка раскрытия/сворачивания настроек (только если данные загружены) */}
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
            {/* Диапазон дат */}
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

            {/* Группировка */}
            <div className="archive-group-select">
              <label>Группировка:</label>
              <select
                className="group-by-select"
                value={archiveGroupBy}
                onChange={(e) => handleGroupByChange(e.target.value as ArchiveGroupBy)}
              >
                <option value="hour">По часам</option>
                <option value="day">По дням</option>
                <option value="week">По неделям</option>
                <option value="month">По месяцам</option>
                <option value="year">По годам</option>
              </select>
            </div>

            {/* Режим отображения: таблица / график */}
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

            {/* Переключатель показания / объём (только для таблицы) */}
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

            {/* Размер страницы */}
            <select
              className="page-size-select"
              value={archivePageSize}
              onChange={(e) => setArchivePageSize(Number(e.target.value))}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>

            <button
              type="button"
              className="archive-load-button"
              onClick={() => void handleLoadArchiveData()}
              disabled={!currentDeviceId || archiveLoading}
              title="Перезагрузить данные за выбранный период"
            >
              {archiveLoading ? 'Загрузка...' : '🔄 Обновить данные'}
            </button>
          </div>

          {/* Основное содержимое */}
          {archiveError && !archiveLoading ? (
            <div className="error-state">
              <strong>❌ Ошибка:</strong> {archiveError.message || 'Не удалось загрузить архив'}
            </div>
          ) : !archiveDataLoaded || archiveLoading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Загрузка архива...</p>
              <p style={{ fontSize: '12px', color: '#999', marginTop: '8px' }}>
                Период: {archiveStartDate} — {archiveEndDate}
              </p>
            </div>
          ) : archiveReadings.length === 0 ? (
            <div className="empty-state">
              <p>Архивные данные не найдены</p>
            </div>
          ) : (
            <>
              {archiveDisplayMode === 'chart' ? (
                /* Режим графика */
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
                        {archiveDisplayedReadings.map((groupedReading, displayIndex) => {
                          const realIndex = archiveStartIndex + displayIndex;
                          // Таблица — свежие сверху (desc); archiveReadings — по возрастанию
                          const ascendingIndex = archiveReadings.length - 1 - realIndex;
                          const readingDate = groupedReading.groupDate;
                          const hasReading = !!groupedReading.reading;

                          let dateLabel = '';
                          switch (archiveGroupBy) {
                            case 'hour':
                              dateLabel = readingDate.toLocaleString('ru-RU', {
                                year: 'numeric', month: '2-digit', day: '2-digit',
                                hour: '2-digit', minute: '2-digit',
                              });
                              break;
                            case 'day':
                              dateLabel = readingDate.toLocaleDateString('ru-RU', {
                                year: 'numeric', month: '2-digit', day: '2-digit',
                              });
                              break;
                            case 'week': {
                              const weekNum = Math.ceil(readingDate.getDate() / 7);
                              dateLabel = `Неделя ${weekNum}, ${readingDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}`;
                              break;
                            }
                            case 'month':
                              dateLabel = readingDate.toLocaleDateString('ru-RU', {
                                year: 'numeric', month: 'long',
                              });
                              break;
                            case 'year':
                              dateLabel = readingDate.getFullYear().toString();
                              break;
                          }

                          const consumption = hasReading
                            ? computeArchivePeriodVolume(
                                groupedReading,
                                ascendingIndex,
                                archiveGroupBy,
                                archiveReadings,
                                rawReadings,
                              )
                            : 0;

                          return (
                            <tr
                              key={groupedReading.groupKey}
                              className={`archive-row ${!hasReading ? 'no-data' : ''}`}
                            >
                              <td style={{ minWidth: '180px', textAlign: 'left' }}>{dateLabel}</td>
                              {archiveViewType === 'readings' ? (
                                <td className="reading-value">
                                  {hasReading ? Number(groupedReading.reading!.reading_value).toFixed(2) : '-'}
                                </td>
                              ) : (
                                <td className={`volume-value ${consumption > 0 ? 'positive' : ''}`}>
                                  {hasReading && !isNaN(consumption)
                                    ? consumption > 0 ? `+${consumption.toFixed(2)}` : consumption.toFixed(2)
                                    : '-'}
                                </td>
                              )}
                              <td>{hasReading ? groupedReading.reading!.unit : '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Пагинация */}
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
                <button className="refresh-btn" onClick={refreshArchive} disabled={archiveLoading}>
                  Обновить
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default DeviceArchiveModal;
