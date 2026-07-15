/**
 * Компонент списка оборудования
 * Отображает все оборудование из базы данных в виде списка
 *
 * Пагинация и фильтры в URL (?page=&type=&status=&workshop=&q=),
 * чтобы при возврате с карточки открывалась та же страница списка.
 */

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Equipment } from '../types/equipment';
import { formatDate } from '@/shared/utils/dateFormatting';
import { EQUIPMENT_TYPE_OPTIONS } from '../constants/equipmentTypes';
import { useEquipmentData } from '../hooks/useEquipmentData';
import { useWorkshops } from '../../workshops/hooks/useWorkshops';
import { isDriveId } from '@/shared/utils/qrCodeParser';
import StatusBadge from '../../common/components/StatusBadge';
import QRScanner from '../../common/components/QRScanner/QRScanner';
import { logUserActivity } from '@/features/user-activity/services/activityLogsApi';
import './EquipmentList.css';

interface EquipmentListProps {
  onSelectEquipment?: (equipment: Equipment) => void;
}

function parsePositivePage(value: string | null): number {
  const page = Number.parseInt(value || '1', 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

const EquipmentList: React.FC<EquipmentListProps> = ({ onSelectEquipment }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: equipmentListData, loading, error, refetch } = useEquipmentData();
  const { workshops: workshopOptions = [] } = useWorkshops();

  const equipmentList = useMemo(() => {
    if (!equipmentListData) return [];
    return Array.isArray(equipmentListData) ? equipmentListData : [];
  }, [equipmentListData]);

  const filterType = searchParams.get('type') || 'all';
  const filterStatus = searchParams.get('status') || 'all';
  const filterWorkshop = searchParams.get('workshop') || 'all';
  const searchQuery = searchParams.get('q') || '';
  const currentPage = parsePositivePage(searchParams.get('page'));

  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const itemsPerPage = 6;

  const updateListParams = useCallback(
    (patch: Record<string, string | null>): void => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(patch)) {
          if (value === null || value === '' || value === 'all') {
            next.delete(key);
          } else {
            next.set(key, value);
          }
        }
        return next;
      }, { replace: true });
    },
    [setSearchParams]
  );

  const setFilterType = (value: string): void => {
    updateListParams({ type: value, page: '1' });
  };

  const setFilterStatus = (value: string): void => {
    updateListParams({ status: value, page: '1' });
  };

  const setFilterWorkshop = (value: string): void => {
    updateListParams({ workshop: value, page: '1' });
  };

  const setSearchQuery = (value: string): void => {
    updateListParams({ q: value.trim() ? value : null, page: '1' });
  };

  const setCurrentPage = (pageOrUpdater: number | ((prev: number) => number)): void => {
    const nextPage =
      typeof pageOrUpdater === 'function' ? pageOrUpdater(currentPage) : pageOrUpdater;
    updateListParams({ page: String(Math.max(1, nextPage)) });
  };

  const findEquipmentById = (id: string): Equipment | null => {
    if (isDriveId(id)) {
      const driveFolderId = id.replace('DRIVE:', '');
      return (
        equipmentList.find((eq) => {
          if (!eq.googleDriveUrl) return false;
          const url = eq.googleDriveUrl.toLowerCase();
          const searchId = driveFolderId.toLowerCase();
          return (
            url.includes(searchId) ||
            url.includes(`folders/${searchId}`) ||
            url.includes(`id=${searchId}`)
          );
        }) || null
      );
    }
    return equipmentList.find((eq) => eq.id === id) || null;
  };

  const handleScanSuccess = (scannedId: string): void => {
    console.debug('[EquipmentList] Отсканирован ID:', scannedId);

    const equipment = findEquipmentById(scannedId);

    if (equipment) {
      console.debug('[EquipmentList] Оборудование найдено:', equipment.name);

      logUserActivity(
        'qr_code_scan',
        `Сканирование QR-кода: "${equipment.name}"`,
        {
          entityType: 'equipment',
          entityId: equipment.id,
          metadata: {
            equipmentName: equipment.name,
            equipmentType: equipment.type,
            scannedId,
          },
        }
      ).catch(() => {});

      setIsScannerOpen(false);
      onSelectEquipment?.(equipment);
    } else {
      logUserActivity(
        'qr_code_scan',
        `Сканирование QR-кода: оборудование не найдено (ID: ${scannedId})`,
        {
          entityType: 'other',
          metadata: {
            scannedId,
            success: false,
          },
        }
      ).catch(() => {});

      alert(
        `Оборудование с ID "${scannedId}" не найдено в списке.\n\nВозможно, список нужно обновить.`
      );
      setIsScannerOpen(false);
    }
  };

  const handleScanError = (errorMessage: string): void => {
    console.error('[EquipmentList] Ошибка сканирования:', errorMessage);
  };

  const filteredEquipment = useMemo(() => {
    return equipmentList.filter((eq) => {
      if (filterType !== 'all' && eq.type !== filterType) {
        return false;
      }

      if (filterStatus !== 'all' && eq.status !== filterStatus) {
        return false;
      }

      if (filterWorkshop !== 'all') {
        const equipmentWorkshop = eq.specs?.workshop || eq.specs?.location || '';
        if (equipmentWorkshop !== filterWorkshop) {
          return false;
        }
      }

      if (eq.status === 'archived') {
        return false;
      }

      if (searchQuery && !eq.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }

      return true;
    });
  }, [equipmentList, filterType, filterStatus, filterWorkshop, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredEquipment.length / itemsPerPage) || 1);
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedEquipment = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredEquipment.slice(startIndex, endIndex);
  }, [filteredEquipment, safeCurrentPage, itemsPerPage]);

  useEffect(() => {
    if (currentPage !== safeCurrentPage) {
      updateListParams({ page: String(safeCurrentPage) });
    }
  }, [currentPage, safeCurrentPage, updateListParams]);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (searchQuery) {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }

      searchTimeoutRef.current = setTimeout(() => {
        logUserActivity(
          'equipment_search',
          `Поиск оборудования: "${searchQuery}"`,
          {
            entityType: 'other',
            metadata: {
              searchQuery,
              resultsCount: filteredEquipment.length,
            },
          }
        ).catch(() => {});
      }, 1000);
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, filteredEquipment.length]);

  const prevFilterRef = useRef({ type: filterType, status: filterStatus, workshop: filterWorkshop });
  useEffect(() => {
    const hasFilterChanged =
      prevFilterRef.current.type !== filterType ||
      prevFilterRef.current.status !== filterStatus ||
      prevFilterRef.current.workshop !== filterWorkshop;

    if (
      hasFilterChanged &&
      (filterType !== 'all' || filterStatus !== 'all' || filterWorkshop !== 'all')
    ) {
      logUserActivity(
        'equipment_filter',
        'Фильтрация списка оборудования',
        {
          entityType: 'other',
          metadata: {
            filterType: filterType !== 'all' ? filterType : undefined,
            filterStatus: filterStatus !== 'all' ? filterStatus : undefined,
            filterWorkshop: filterWorkshop !== 'all' ? filterWorkshop : undefined,
            resultsCount: filteredEquipment.length,
          },
        }
      ).catch(() => {});

      prevFilterRef.current = { type: filterType, status: filterStatus, workshop: filterWorkshop };
    }
  }, [filterType, filterStatus, filterWorkshop, filteredEquipment.length]);

  if (loading) {
    return (
      <div className="equipment-list">
        <div className="loading-message">
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div
              className="spinner"
              style={{
                width: '40px',
                height: '40px',
                border: '4px solid #f3f3f3',
                borderTop: '4px solid #667eea',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 20px',
              }}
            />
            <p>Загрузка списка оборудования...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="equipment-list">
        <div className="error-message">
          <p style={{ marginBottom: '10px', fontWeight: '600' }}>Ошибка загрузки данных</p>
          <p style={{ marginBottom: '20px' }}>{error}</p>
          <button onClick={refetch} className="retry-button">
            Попробовать снова
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="equipment-list">
      <div className="list-header">
        <div className="list-controls">
          <div className="search-box">
            <input
              type="text"
              placeholder="Поиск по названию..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>

          <button
            className="qr-scanner-button"
            onClick={() => setIsScannerOpen(true)}
            type="button"
            title="Сканировать QR-код"
          >
            📱 Сканировать QR
          </button>

          <select
            value={filterWorkshop}
            onChange={(e) => setFilterWorkshop(e.target.value)}
            className="filter-select"
          >
            <option value="all">Все участки</option>
            {workshopOptions && workshopOptions.length > 0 ? (
              workshopOptions.map((workshop: string) => (
                <option key={workshop} value={workshop}>
                  {workshop}
                </option>
              ))
            ) : (
              <option disabled>Загрузка участков...</option>
            )}
          </select>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="filter-select"
          >
            <option value="all">Все типы</option>
            {EQUIPMENT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="filter-select"
          >
            <option value="all">Все статусы</option>
            <option value="active">Активные</option>
            <option value="inactive">Неактивные</option>
          </select>
        </div>
      </div>

      <QRScanner
        isOpen={isScannerOpen}
        onScanSuccess={handleScanSuccess}
        onScanError={handleScanError}
        onClose={() => setIsScannerOpen(false)}
      />

      <div className="list-info">
        Найдено: {filteredEquipment.length} из {equipmentList.length}
        {totalPages > 1 && ` (Страница ${safeCurrentPage} из ${totalPages})`}
      </div>

      {filteredEquipment.length === 0 ? (
        <div className="empty-message">
          {equipmentList.length === 0
            ? 'Оборудование не найдено. Добавьте новое оборудование.'
            : 'Нет оборудования, соответствующего фильтрам.'}
        </div>
      ) : (
        <>
          <div className="equipment-cards">
            {paginatedEquipment.map((equipment) => (
              <div
                key={equipment.id}
                className="equipment-card"
                onClick={() => onSelectEquipment?.(equipment)}
              >
                <div className="card-header">
                  <h3 className="equipment-card-name">{equipment.name}</h3>
                  <StatusBadge status={equipment.status} />
                </div>

                <div className="card-body">
                  {equipment.specs?.inventoryNumber && (
                    <div className="card-info">
                      <span className="info-label">Инвентарный номер:</span>
                      <span className="info-value">{equipment.specs.inventoryNumber}</span>
                    </div>
                  )}

                  {equipment.commissioningDate && (
                    <div className="card-info">
                      <span className="info-label">Ввод в эксплуатацию:</span>
                      <span className="info-value">{formatDate(equipment.commissioningDate)}</span>
                    </div>
                  )}

                  {equipment.lastMaintenanceDate && (
                    <div className="card-info">
                      <span className="info-label">Последнее обслуживание:</span>
                      <span className="info-value">{formatDate(equipment.lastMaintenanceDate)}</span>
                    </div>
                  )}
                </div>

                <div className="card-footer">
                  <span className="equipment-id">ID: {equipment.id.substring(0, 8)}...</span>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={safeCurrentPage === 1}
                className="pagination-button"
                type="button"
              >
                ← Назад
              </button>
              <span className="pagination-info">
                Страница {safeCurrentPage} из {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={safeCurrentPage === totalPages}
                className="pagination-button"
                type="button"
              >
                Вперед →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default EquipmentList;
