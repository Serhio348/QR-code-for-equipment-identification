/**
 * useEquipmentDates.ts
 * 
 * НАЗНАЧЕНИЕ:
 * Хук для управления датами оборудования на странице просмотра.
 * Содержит логику сохранения дат и управления состоянием.
 * 
 * ПРЕИМУЩЕСТВА:
 * - Инкапсулирует логику работы с датами
 * - Упрощает компонент EquipmentPage
 * - Легко тестировать отдельно
 */

import { useState, useEffect } from 'react';
import { Equipment } from '../types/equipment';
import { updateEquipment } from '../services/equipmentApi';
import { updateEquipmentCache } from './useEquipmentData';
import { normalizeDate } from '@/shared/utils/dateNormalization';

interface UseEquipmentDatesProps {
  equipment: Equipment | null;
}

interface UseEquipmentDatesResult {
  commissioningDate: string;
  lastMaintenanceDate: string;
  setCommissioningDate: (date: string) => void;
  setLastMaintenanceDate: (date: string) => void;
  saveDates: () => Promise<void>;
  saving: boolean;
  success: boolean;
  error: string | null;
}

/**
 * Хук для управления датами оборудования
 * 
 * ЛОГИКА:
 * - Инициализирует даты из оборудования при загрузке
 * - Предоставляет функции для изменения дат
 * - Сохраняет даты через API с обновлением кеша
 * - Управляет состояниями сохранения, успеха и ошибок
 */
export function useEquipmentDates({ equipment }: UseEquipmentDatesProps): UseEquipmentDatesResult {
  const [commissioningDate, setCommissioningDate] = useState<string>('');
  const [lastMaintenanceDate, setLastMaintenanceDate] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [success, setSuccess] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Инициализация дат при загрузке оборудования
  useEffect(() => {
    if (equipment) {
      const normalizedCommissioning = normalizeDate(equipment.commissioningDate);
      const normalizedMaintenance = normalizeDate(equipment.lastMaintenanceDate);
      
      setCommissioningDate(normalizedCommissioning);
      setLastMaintenanceDate(normalizedMaintenance);
    }
  }, [equipment]);

  /**
   * Сохранение дат через API
   */
  const saveDates = async () => {
    if (!equipment) {
      return;
    }
    
    setSaving(true);
    setSuccess(false);
    setError(null);
    
    try {
      // input type="date" уже возвращает YYYY-MM-DD, убираем возможное время
      const normalizedCommissioning = commissioningDate ? commissioningDate.split('T')[0].trim() : undefined;
      const normalizedMaintenance = lastMaintenanceDate ? lastMaintenanceDate.split('T')[0].trim() : undefined;
      
      console.log('💾 Сохранение дат:', {
        исходная_commissioning: commissioningDate,
        нормализованная_commissioning: normalizedCommissioning,
        исходная_maintenance: lastMaintenanceDate,
        нормализованная_maintenance: normalizedMaintenance
      });
      
      const updated = await updateEquipment(equipment.id, {
        commissioningDate: normalizedCommissioning,
        lastMaintenanceDate: normalizedMaintenance
      });
      
      // Обновляем кеш после сохранения
      updateEquipmentCache(updated);
      
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error('Ошибка сохранения:', err);
      setError(`Ошибка сохранения: ${err.message || 'Не удалось сохранить данные'}`);
      setTimeout(() => setError(null), 5000);
    } finally {
      setSaving(false);
    }
  };

  return {
    commissioningDate,
    lastMaintenanceDate,
    setCommissioningDate,
    setLastMaintenanceDate,
    saveDates,
    saving,
    success,
    error,
  };
}

