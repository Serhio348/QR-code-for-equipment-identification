/**
 * Типы для настроек экспорта таблички оборудования
 */

/**
 * Размер таблички
 */
export type PlateSize = 'A4' | 'A5' | 'custom';

/**
 * Шаблон таблички
 */
export type PlateTemplate = 'full' | 'minimal' | 'qr-only';

/**
 * Настройки экспорта таблички
 */
export interface PlateExportSettings {
  /** Размер таблички */
  size: PlateSize;
  /** Кастомная ширина (в мм, только для size='custom') */
  customWidth?: number;
  /** Кастомная высота (в мм, только для size='custom') */
  customHeight?: number;
  /** Шаблон таблички */
  template: PlateTemplate;
  /** Показывать название оборудования */
  showName: boolean;
  /** Показывать инвентарный номер */
  showInventoryNumber: boolean;
  /** Показывать характеристики */
  showSpecs: boolean;
  /** Показывать дату ввода в эксплуатацию */
  showCommissioningDate: boolean;
  /** Показывать дату последнего обслуживания */
  showLastMaintenanceDate: boolean;
  /** Показывать QR-код */
  showQRCode: boolean;
  /** Размер QR-кода (в пикселях) */
  qrCodeSize?: number;
  /** Показывать конкретные поля характеристик (если showSpecs = true) */
  selectedSpecFields?: string[];
}

/**
 * Настройки по умолчанию
 */
export const DEFAULT_EXPORT_SETTINGS: PlateExportSettings = {
  size: 'A4',
  template: 'full',
  showName: true,
  showInventoryNumber: true,
  showSpecs: true,
  showCommissioningDate: true,
  showLastMaintenanceDate: true,
  showQRCode: true,
  qrCodeSize: 200,
};

/**
 * Предустановленные шаблоны
 */
export const PLATE_TEMPLATES: Record<PlateTemplate, Partial<PlateExportSettings>> = {
  full: {
    template: 'full',
    showName: true,
    showInventoryNumber: true,
    showSpecs: true,
    showCommissioningDate: true,
    showLastMaintenanceDate: true,
    showQRCode: true,
    qrCodeSize: 200,
  },
  minimal: {
    template: 'minimal',
    showName: true,
    showInventoryNumber: true,
    showSpecs: false,
    showCommissioningDate: false,
    showLastMaintenanceDate: false,
    showQRCode: true,
    qrCodeSize: 150,
  },
  'qr-only': {
    template: 'qr-only',
    showName: false,
    showInventoryNumber: false,
    showSpecs: false,
    showCommissioningDate: false,
    showLastMaintenanceDate: false,
    showQRCode: true,
    qrCodeSize: 300,
  },
};
