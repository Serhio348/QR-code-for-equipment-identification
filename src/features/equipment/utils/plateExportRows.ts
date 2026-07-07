/**
 * plateExportRows.ts
 *
 * Какие строки таблицы показывать в PDF — по отдельным флагам настроек,
 * а не только через showSpecs.
 */

import { PlateExportSettings } from '@/shared/types/plateExport';
import { EquipmentSpecs } from '../types/equipment';
import { getAllSpecFieldsForType, SpecFieldConfig } from '../constants/equipmentSpecFields';
import { formatDate } from '@/shared/utils/dateFormatting';

export interface PlateExportRow {
  key: string;
  label: string;
  value: string;
  isDate?: boolean;
  isNotes?: boolean;
}

export interface PlateExportRowContext {
  specs: EquipmentSpecs;
  settings: PlateExportSettings;
  equipmentType?: string;
  commissioningDate?: string;
  lastMaintenanceDate?: string;
}

const isSpecCharacteristicVisible = (
  fieldKey: string,
  settings: PlateExportSettings,
): boolean => {
  if (!settings.showSpecs || fieldKey === 'inventoryNumber') {
    return false;
  }
  const selected = settings.selectedSpecFields;
  if (Array.isArray(selected)) {
    return selected.includes(fieldKey);
  }
  return true;
};

export const buildPlateExportRows = (context: PlateExportRowContext): PlateExportRow[] => {
  const { specs, settings, equipmentType = 'other', commissioningDate, lastMaintenanceDate } = context;
  const rows: PlateExportRow[] = [];
  const specFields = getAllSpecFieldsForType(equipmentType as Parameters<typeof getAllSpecFieldsForType>[0]);

  if (settings.showInventoryNumber && specs.inventoryNumber) {
    const inventoryField = specFields.find((field) => field.key === 'inventoryNumber');
    rows.push({
      key: 'inventoryNumber',
      label: inventoryField?.label ?? 'Инвентарный номер',
      value: String(specs.inventoryNumber),
    });
  }

  specFields.forEach((field: SpecFieldConfig) => {
    if (field.key === 'inventoryNumber') {
      return;
    }
    if (!isSpecCharacteristicVisible(field.key, settings)) {
      return;
    }

    const value = specs[field.key];
    if (!value && field.key !== 'nextTestDate') {
      return;
    }

    if (field.key === 'nextTestDate') {
      if (value) {
        rows.push({
          key: field.key,
          label: field.label,
          value: formatDate(value as string),
        });
      }
      return;
    }

    rows.push({
      key: field.key,
      label: field.label,
      value: String(value),
      isNotes: field.key === 'additionalNotes',
    });
  });

  if (commissioningDate && settings.showCommissioningDate) {
    rows.push({
      key: 'commissioningDate',
      label: 'Дата ввода в эксплуатацию',
      value: formatDate(commissioningDate),
      isDate: true,
    });
  }

  if (lastMaintenanceDate && settings.showLastMaintenanceDate) {
    rows.push({
      key: 'lastMaintenanceDate',
      label: 'Дата последнего обслуживания',
      value: formatDate(lastMaintenanceDate),
      isDate: true,
    });
  }

  return rows;
};

export const hasPlateExportTableContent = (context: PlateExportRowContext): boolean =>
  buildPlateExportRows(context).length > 0;
