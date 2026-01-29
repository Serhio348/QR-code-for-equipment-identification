/**
 * Типы для настроек экспорта акта технического освидетельствования
 */

/**
 * Размер документа
 */
export type InspectionSize = 'A4' | 'A5' | 'custom';

/**
 * Настройки экспорта акта освидетельствования
 */
export interface InspectionExportSettings {
  /** Размер документа */
  size: InspectionSize;
  /** Кастомная ширина (в мм, только для size='custom') */
  customWidth?: number;
  /** Кастомная высота (в мм, только для size='custom') */
  customHeight?: number;
  /** Верхний отступ (в мм) */
  paddingTop?: number;
  /** Нижний отступ (в мм) */
  paddingBottom?: number;
  /** Левый отступ (в мм) */
  paddingLeft?: number;
  /** Правый отступ (в мм) */
  paddingRight?: number;
}

/**
 * Настройки по умолчанию
 */
export const DEFAULT_INSPECTION_EXPORT_SETTINGS: InspectionExportSettings = {
  size: 'A4',
  paddingTop: 8,
  paddingBottom: 8,
  paddingLeft: 8,
  paddingRight: 8,
};
