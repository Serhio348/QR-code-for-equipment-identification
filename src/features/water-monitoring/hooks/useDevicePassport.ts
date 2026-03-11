/**
 * useDevicePassport
 *
 * Управляет модальным окном паспорта счётчика:
 * состояние, перетаскивание, открытие/закрытие/сохранение/печать/PDF.
 * Также содержит вспомогательные геттеры: getDeviceName, getDeviceSerialNumber, getDeviceObject.
 */

import { useState, useCallback, useEffect } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { BeliotDevice } from '../services/beliotDeviceApi';
import {
  BeliotDeviceOverride,
  saveBeliotDeviceOverride,
} from '@/shared/services/api/supabaseBeliotOverridesApi';
import { OverrideField } from './useDeviceOverrides';

// ─── Типы ────────────────────────────────────────────────────────────────────

export type PassportData = {
  name: string;
  serialNumber: string;
  object: string;
  deviceRole: 'source' | 'production' | 'domestic' | '';
  manufactureDate: string;
  manufacturer: string;
  verificationDate: string;
  nextVerificationDate: string;
};

interface UseDevicePassportParams {
  syncedOverrides: Record<string, BeliotDeviceOverride>;
  getEditableValue: (deviceId: string, field: OverrideField, defaultValue: string) => string;
  updateLocalValue: (deviceId: string, field: OverrideField, value: string) => void;
  syncOverridesFromServer: () => Promise<void>;
  /** Дополнительный колбэк при закрытии (например, setIsMobileMenuOpen(false)) */
  onCloseExtra?: () => void;
}

// ─── Константы ───────────────────────────────────────────────────────────────

const EMPTY_PASSPORT_DATA: PassportData = {
  name: '',
  serialNumber: '',
  object: '',
  deviceRole: '',
  manufactureDate: '',
  manufacturer: '',
  verificationDate: '',
  nextVerificationDate: '',
};

// ─── Хук ─────────────────────────────────────────────────────────────────────

export function useDevicePassport({
  syncedOverrides,
  getEditableValue,
  updateLocalValue,
  syncOverridesFromServer,
  onCloseExtra,
}: UseDevicePassportParams) {

  // ── Состояние модального окна ──────────────────────────────────────────────

  const [isPassportOpen, setIsPassportOpen] = useState<boolean>(false);
  const [passportDevice, setPassportDevice] = useState<BeliotDevice | null>(null);
  const [passportData, setPassportData] = useState<PassportData>(EMPTY_PASSPORT_DATA);
  const [passportSaving, setPassportSaving] = useState<boolean>(false);

  // ── Состояние перетаскивания ───────────────────────────────────────────────

  const [passportModalPosition, setPassportModalPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDraggingPassport, setIsDraggingPassport] = useState<boolean>(false);
  const [dragStartPassport, setDragStartPassport] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // ── Вспомогательные функции ────────────────────────────────────────────────

  /** Экранирование HTML для предотвращения XSS */
  const escapeHtml = useCallback((text: string | undefined | null): string => {
    if (!text) return '—';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }, []);

  /** Форматирование даты для отображения (DD.MM.YYYY) */
  const formatDateForDisplay = useCallback((dateStr: string | undefined): string => {
    if (!dateStr) return '—';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return '—';
      return date.toLocaleDateString('ru-RU', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    } catch {
      return '—';
    }
  }, []);

  // ── Геттеры данных устройства ──────────────────────────────────────────────

  const getDeviceName = useCallback((device: BeliotDevice): string => {
    const deviceId = String(device.device_id || device.id || device._id);
    const editableValue = getEditableValue(deviceId, 'name', '');
    if (editableValue) return editableValue;
    return device.name || '-';
  }, [getEditableValue]);

  const getDeviceSerialNumber = useCallback((device: BeliotDevice): string => {
    const deviceId = String(device.device_id || device.id || device._id);
    const editableValue = getEditableValue(deviceId, 'serialNumber', '');
    if (editableValue) return editableValue;

    // Явные поля серийного номера (на случай если API вернёт их напрямую)
    if (device.serial_number) return String(device.serial_number);
    if (device.serialNumber) return String(device.serialNumber);
    if (device.serial) return String(device.serial);
    if (device.sn) return String(device.sn);
    if (device.factory_number) return String(device.factory_number);
    if (device.factoryNumber) return String(device.factoryNumber);

    // Проверяем в объекте модели
    if (device.model && typeof device.model === 'object') {
      const m = device.model as Record<string, unknown>;
      if (m.serial_number) return String(m.serial_number);
      if (m.serialNumber) return String(m.serialNumber);
      if (m.serial) return String(m.serial);
      if (m.sn) return String(m.sn);
    }

    // Извлекаем из поля name (например, "MTK-40N тДЦ13001660")
    if (device.name) {
      const name = device.name.trim();
      const m1 = name.match(/(?:тДЦ|ТДЦ)\s*(\d{6,})/i);
      if (m1) return m1[1];
      const m2 = name.match(/\s+(\d{6,})$/);
      if (m2) return m2[1];
      const m3 = name.match(/(?:[^\d]|^)(\d{6,})(?:[^\d]|$)/);
      if (m3) return m3[1];
      const m4 = name.match(/(\d{6,})/);
      if (m4) return m4[1];
    }

    return '-';
  }, [getEditableValue]);

  const getDeviceObject = useCallback((device: BeliotDevice): string => {
    const deviceId = String(device.device_id || device.id || device._id);
    const editableValue = getEditableValue(deviceId, 'object', '');
    if (editableValue) return editableValue;

    if (device.tied_point?.place) return device.tied_point.place;
    if (device.object_name) return device.object_name;
    if (device.facility_passport_name) return device.facility_passport_name;
    if (device.building_name) return device.building_name;
    return '-';
  }, [getEditableValue]);

  // ── Закрытие ───────────────────────────────────────────────────────────────

  const handleClosePassport = useCallback(() => {
    setIsPassportOpen(false);
    setPassportDevice(null);
    setPassportData(EMPTY_PASSPORT_DATA);
    onCloseExtra?.();
  }, [onCloseExtra]);

  // ── Открытие ───────────────────────────────────────────────────────────────

  const handleOpenPassport = useCallback((device: BeliotDevice) => {
    const deviceId = String(device.device_id || device.id || device._id);
    setPassportDevice(device);

    /** Форматирует ISO-дату в YYYY-MM-DD для input[type="date"] */
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

    const override = syncedOverrides[deviceId];
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

    // Сбрасываем позицию при каждом открытии
    setPassportModalPosition({ x: 0, y: 0 });
    setIsDraggingPassport(false);
    setIsPassportOpen(true);
  }, [syncedOverrides, getEditableValue, getDeviceName, getDeviceSerialNumber, getDeviceObject]);

  // ── Сохранение ─────────────────────────────────────────────────────────────

  const handleSavePassport = useCallback(async () => {
    if (!passportDevice) return;

    const deviceId = String(passportDevice.device_id || passportDevice.id || passportDevice._id);
    setPassportSaving(true);

    try {
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

      await saveBeliotDeviceOverride(deviceId, overrideData);

      // Обновляем localStorage для быстрого доступа
      if (passportData.name) updateLocalValue(deviceId, 'name', passportData.name);
      if (passportData.serialNumber) updateLocalValue(deviceId, 'serialNumber', passportData.serialNumber);
      if (passportData.object) updateLocalValue(deviceId, 'object', passportData.object);

      // Синхронизируем кэш с Supabase и закрываем окно
      await syncOverridesFromServer();
      handleClosePassport();
    } catch (error: any) {
      console.error('Ошибка сохранения паспорта:', error);
      alert(`Ошибка сохранения: ${error.message}`);
    } finally {
      setPassportSaving(false);
    }
  }, [passportDevice, passportData, updateLocalValue, syncOverridesFromServer, handleClosePassport]);

  // ── Перетаскивание ─────────────────────────────────────────────────────────

  const handlePassportModalMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Перетаскивание только за заголовок, исключая кнопки
    if (
      (e.target as HTMLElement).closest('.passport-modal-header') &&
      !(e.target as HTMLElement).closest('.passport-modal-close') &&
      !(e.target as HTMLElement).closest('.passport-btn-back') &&
      !(e.target as HTMLElement).closest('.passport-btn-print') &&
      !(e.target as HTMLElement).closest('.passport-btn-pdf') &&
      !(e.target as HTMLElement).closest('button')
    ) {
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

    const handleMouseUp = () => setIsDraggingPassport(false);

    if (isDraggingPassport) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingPassport, dragStartPassport]);

  // ── Печать ─────────────────────────────────────────────────────────────────

  const handlePrintPassport = useCallback(() => {
    if (!passportDevice) return;

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
              @page { margin: 20mm; size: A4; }
              body { margin: 0; padding: 0; font-family: Arial, sans-serif; font-size: 12pt; color: #000; }
            }
            body { font-family: Arial, sans-serif; max-width: 210mm; margin: 0 auto; padding: 20px; color: #333; }
            .passport-header { text-align: center; border-bottom: 3px solid #667eea; padding-bottom: 20px; margin-bottom: 30px; }
            .passport-header h1 { margin: 0; font-size: 24pt; color: #667eea; }
            .passport-section { margin-bottom: 30px; page-break-inside: avoid; }
            .passport-section h2 { font-size: 18pt; color: #667eea; border-bottom: 2px solid #e0e0e0; padding-bottom: 10px; margin-bottom: 20px; }
            .passport-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f0f0f0; }
            .passport-label { font-weight: bold; width: 40%; color: #666; }
            .passport-value { width: 60%; text-align: right; }
            .passport-footer { margin-top: 50px; padding-top: 20px; border-top: 2px solid #e0e0e0; text-align: center; font-size: 10pt; color: #666; }
          </style>
        </head>
        <body>
          <div class="passport-header"><h1>ПАСПОРТ СЧЕТЧИКА</h1></div>
          <div class="passport-section">
            <h2>Основные данные</h2>
            <div class="passport-row"><span class="passport-label">Название счетчика:</span><span class="passport-value">${escapeHtml(passportData.name)}</span></div>
            <div class="passport-row"><span class="passport-label">Серийный номер:</span><span class="passport-value">${escapeHtml(passportData.serialNumber)}</span></div>
            <div class="passport-row"><span class="passport-label">Объект:</span><span class="passport-value">${escapeHtml(passportData.object)}</span></div>
          </div>
          <div class="passport-section">
            <h2>Паспортные данные</h2>
            <div class="passport-row"><span class="passport-label">Дата выпуска:</span><span class="passport-value">${escapeHtml(formatDateForDisplay(passportData.manufactureDate))}</span></div>
            <div class="passport-row"><span class="passport-label">Производитель:</span><span class="passport-value">${escapeHtml(passportData.manufacturer)}</span></div>
            <div class="passport-row"><span class="passport-label">Дата поверки:</span><span class="passport-value">${escapeHtml(formatDateForDisplay(passportData.verificationDate))}</span></div>
            <div class="passport-row"><span class="passport-label">Дата следующей поверки:</span><span class="passport-value">${escapeHtml(formatDateForDisplay(passportData.nextVerificationDate))}</span></div>
          </div>
          <div class="passport-footer">
            <p>Документ сформирован: ${new Date().toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 250);
  }, [passportDevice, passportData, getDeviceName, formatDateForDisplay, escapeHtml]);

  // ── Сохранение в PDF ───────────────────────────────────────────────────────

  const handleSavePassportAsPDF = useCallback(async () => {
    if (!passportDevice) return;

    const printContainer = document.createElement('div');
    printContainer.style.cssText = 'position:absolute;left:-9999px;width:210mm;padding:20mm;background:#fff;font-family:Arial,sans-serif;font-size:12pt;color:#333;';

    try {
      const deviceName = getDeviceName(passportDevice);

      printContainer.innerHTML = `
        <div style="text-align:center;border-bottom:3px solid #667eea;padding-bottom:20px;margin-bottom:30px;">
          <h1 style="margin:0;font-size:24pt;color:#667eea;">ПАСПОРТ СЧЕТЧИКА</h1>
        </div>
        <div style="margin-bottom:30px;">
          <h2 style="font-size:18pt;color:#667eea;border-bottom:2px solid #e0e0e0;padding-bottom:10px;margin-bottom:20px;">Основные данные</h2>
          <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f0f0f0;">
            <span style="font-weight:bold;width:40%;color:#666;">Название счетчика:</span>
            <span style="width:60%;text-align:right;">${escapeHtml(passportData.name)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f0f0f0;">
            <span style="font-weight:bold;width:40%;color:#666;">Серийный номер:</span>
            <span style="width:60%;text-align:right;">${escapeHtml(passportData.serialNumber)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f0f0f0;">
            <span style="font-weight:bold;width:40%;color:#666;">Объект:</span>
            <span style="width:60%;text-align:right;">${escapeHtml(passportData.object)}</span>
          </div>
        </div>
        <div style="margin-bottom:30px;">
          <h2 style="font-size:18pt;color:#667eea;border-bottom:2px solid #e0e0e0;padding-bottom:10px;margin-bottom:20px;">Паспортные данные</h2>
          <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f0f0f0;">
            <span style="font-weight:bold;width:40%;color:#666;">Дата выпуска:</span>
            <span style="width:60%;text-align:right;">${escapeHtml(formatDateForDisplay(passportData.manufactureDate))}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f0f0f0;">
            <span style="font-weight:bold;width:40%;color:#666;">Производитель:</span>
            <span style="width:60%;text-align:right;">${escapeHtml(passportData.manufacturer)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f0f0f0;">
            <span style="font-weight:bold;width:40%;color:#666;">Дата поверки:</span>
            <span style="width:60%;text-align:right;">${escapeHtml(formatDateForDisplay(passportData.verificationDate))}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f0f0f0;">
            <span style="font-weight:bold;width:40%;color:#666;">Дата следующей поверки:</span>
            <span style="width:60%;text-align:right;">${escapeHtml(formatDateForDisplay(passportData.nextVerificationDate))}</span>
          </div>
        </div>
        <div style="margin-top:50px;padding-top:20px;border-top:2px solid #e0e0e0;text-align:center;font-size:10pt;color:#666;">
          <p>Документ сформирован: ${new Date().toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
        </div>
      `;

      document.body.appendChild(printContainer);

      const canvas = await html2canvas(printContainer, { scale: 2, useCORS: true, logging: false });

      if (printContainer.parentNode) document.body.removeChild(printContainer);

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

      const fileName = `Паспорт_${deviceName.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);
    } catch (error) {
      console.error('Ошибка при сохранении PDF:', error);
      alert('Ошибка при сохранении PDF. Пожалуйста, попробуйте снова.');
    } finally {
      // Гарантируем удаление временного контейнера в любом случае
      if (printContainer.parentNode) document.body.removeChild(printContainer);
    }
  }, [passportDevice, passportData, getDeviceName, formatDateForDisplay, escapeHtml]);

  // ─────────────────────────────────────────────────────────────────────────

  return {
    // Состояние модального окна
    isPassportOpen,
    setIsPassportOpen,
    passportDevice,
    passportData,
    setPassportData,
    passportSaving,
    passportModalPosition,
    isDraggingPassport,
    // Обработчики
    handleOpenPassport,
    handleClosePassport,
    handleSavePassport,
    handlePassportModalMouseDown,
    handlePrintPassport,
    handleSavePassportAsPDF,
    // Геттеры данных устройства
    getDeviceName,
    getDeviceSerialNumber,
    getDeviceObject,
    // Утилиты форматирования
    escapeHtml,
    formatDateForDisplay,
  };
}
