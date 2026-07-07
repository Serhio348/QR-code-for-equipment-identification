/**
 * plateExportLayout.ts
 *
 * Расчёт размеров таблички для PDF-экспорта (html2canvas + jsPDF).
 */

import { PlateExportSettings } from '@/shared/types/plateExport';

export const MM_TO_PX = 3.78;

export type PlateExportLayoutMode = 'compact' | 'standard' | 'qr-only' | 'specs-only';

export interface PlateExportLayout {
  widthMm: number;
  heightMm: number;
  widthPx: number;
  heightPx: number;
  mode: PlateExportLayoutMode;
  isCompact: boolean;
  paddingPx: number;
  gapPx: number;
  titleFontPx: number;
  specFontPx: number;
  qrLabelFontPx: number;
  qrSizePx: number;
  qrColumnWidthPx: number | null;
  specsMaxWidthPx: number | null;
  /** Высота блока «таблица + QR» в standard-режиме */
  contentBlockHeightPx: number | null;
  rowHeightPx: number | null;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

export const resolvePlateDimensionsMm = (
  settings: PlateExportSettings,
): { widthMm: number; heightMm: number } => {
  const widthMm =
    settings.size === 'custom' && settings.customWidth ? settings.customWidth
      : settings.size === 'A5' ? 148
        : 210;
  const heightMm =
    settings.size === 'custom' && settings.customHeight ? settings.customHeight
      : settings.size === 'A5' ? 210
        : 297;
  return { widthMm, heightMm };
};

export const computePlateExportLayout = (
  settings: PlateExportSettings,
  hasTableContent = false,
  rowCount = 0,
): PlateExportLayout => {
  const { widthMm, heightMm } = resolvePlateDimensionsMm(settings);
  const minSideMm = Math.min(widthMm, heightMm);
  const isCompact = minSideMm <= 60;
  const isNarrow = widthMm <= 148;
  const minSidePx = minSideMm * MM_TO_PX;

  const paddingPx = clamp(Math.round(minSidePx * (isCompact ? 0.02 : 0.08)), 1, 16);
  const gapPx = clamp(Math.round(minSidePx * (isCompact ? 0.015 : 0.06)), 1, 14);
  const titleFontPx = clamp(Math.round(minSidePx * (isCompact ? 0.055 : 0.10)), 5, 22);
  const specFontPx = isCompact
    ? clamp(Math.round(minSidePx * 0.04), 4, 10)
    : isNarrow ? 10 : 11;
  const qrLabelFontPx = clamp(Math.round(minSidePx * (isCompact ? 0.042 : 0.055)), 4, 11);

  let mode: PlateExportLayoutMode;
  if (isCompact) {
    mode = 'compact';
  } else if (settings.showQRCode && hasTableContent) {
    mode = 'standard';
  } else if (settings.showQRCode) {
    mode = 'qr-only';
  } else {
    mode = 'specs-only';
  }

  const contentWidthPx = widthMm * MM_TO_PX - paddingPx * 2;
  const qrSectionPaddingPx = isCompact ? clamp(Math.round(paddingPx * 0.6), 2, 10) : 8;

  let qrSizePx = 0;
  let qrColumnWidthPx: number | null = null;
  let specsMaxWidthPx: number | null = null;

  if (settings.showQRCode) {
    const headerReservePx = settings.showName
      ? clamp(Math.round(titleFontPx * (isCompact ? 1.55 : 2.2) + paddingPx * (isCompact ? 0.8 : 1.2)), 12, Math.round(minSidePx * 0.42))
      : 0;

    if (!settings.qrCodeAuto && settings.qrCodeSize) {
      qrSizePx = settings.qrCodeSize;
      if (mode === 'standard') {
        qrColumnWidthPx = qrSizePx + qrSectionPaddingPx * 2;
        specsMaxWidthPx = Math.max(120, Math.round(contentWidthPx - qrColumnWidthPx - gapPx));
      }
    } else if (mode === 'compact') {
      const qrLabelReservePx = clamp(Math.round(qrLabelFontPx * 4.0), 16, 60);
      const availableQrPx = clamp(
        Math.round(minSidePx - paddingPx * 2 - headerReservePx - gapPx - qrSectionPaddingPx * 2 - qrLabelReservePx),
        40,
        300,
      );
      qrSizePx = clamp(Math.round(availableQrPx * 1.1), 40, 320);
    } else if (mode === 'standard') {
      qrColumnWidthPx = clamp(
        Math.round(contentWidthPx * 0.34 - gapPx),
        100,
        Math.round(contentWidthPx * 0.38),
      );
      const maxQrInColumn = qrColumnWidthPx - qrSectionPaddingPx * 2;
      qrSizePx = clamp(Math.round(maxQrInColumn * 0.92), 72, 130);
      specsMaxWidthPx = Math.round(contentWidthPx - qrColumnWidthPx - gapPx);
    } else {
      const availableQrPx = clamp(Math.round(contentWidthPx * 0.55), 120, 280);
      qrSizePx = clamp(Math.round(availableQrPx * 1.05), 100, 280);
    }
  }

  const rowHeightPx = mode === 'standard' && rowCount > 0
    ? clamp(Math.round(specFontPx * 2.6 + 14), 28, 52)
    : null;
  const contentBlockHeightPx = rowHeightPx ? rowCount * rowHeightPx : null;

  if (mode === 'standard' && rowCount > 0 && contentBlockHeightPx && qrSizePx > 0) {
    const qrLabelBlockPx = Math.round(qrLabelFontPx * 3.2) + 10;
    const maxQrForBlock = contentBlockHeightPx - qrLabelBlockPx - qrSectionPaddingPx * 2;
    qrSizePx = clamp(Math.min(qrSizePx, maxQrForBlock), 56, 130);
  }

  return {
    widthMm,
    heightMm,
    widthPx: Math.round(widthMm * MM_TO_PX),
    heightPx: Math.round(heightMm * MM_TO_PX),
    mode,
    isCompact,
    paddingPx,
    gapPx,
    titleFontPx,
    specFontPx,
    qrLabelFontPx,
    qrSizePx,
    qrColumnWidthPx,
    specsMaxWidthPx,
    contentBlockHeightPx,
    rowHeightPx,
  };
};

export const applyPlateExportElementStyles = (
  element: HTMLElement,
  layout: PlateExportLayout,
): void => {
  element.style.width = `${layout.widthPx}px`;
  element.style.minHeight = `${layout.heightPx}px`;
  element.style.height = layout.isCompact ? `${layout.heightPx}px` : 'auto';
  element.style.overflow = layout.isCompact ? 'hidden' : 'visible';
  element.style.setProperty('--plate-export-padding', `${layout.paddingPx}px`);
  element.style.setProperty('--plate-export-gap', `${layout.gapPx}px`);
  element.style.setProperty('--plate-export-title-font-size', `${layout.titleFontPx}px`);
  element.style.setProperty('--plate-export-spec-font-size', `${layout.specFontPx}px`);
  element.style.setProperty('--plate-export-qr-label-font-size', `${layout.qrLabelFontPx}px`);
  element.style.setProperty('--plate-export-qr-size', `${layout.qrSizePx}px`);

  if (layout.qrColumnWidthPx) {
    element.style.setProperty('--plate-export-qr-column-width', `${layout.qrColumnWidthPx}px`);
  }
  if (layout.specsMaxWidthPx) {
    element.style.setProperty('--plate-export-specs-max-width', `${layout.specsMaxWidthPx}px`);
  }
  if (layout.contentBlockHeightPx) {
    element.style.setProperty('--plate-export-content-height', `${layout.contentBlockHeightPx}px`);
  }
  if (layout.rowHeightPx) {
    element.style.setProperty('--plate-export-row-height', `${layout.rowHeightPx}px`);
  }

  if (layout.isCompact) {
    element.setAttribute('data-export-compact', 'true');
  }

  const qrSvg = element.querySelector('.plate-export-qr svg');
  if (qrSvg && layout.qrSizePx > 0) {
    qrSvg.setAttribute('width', layout.qrSizePx.toString());
    qrSvg.setAttribute('height', layout.qrSizePx.toString());
    (qrSvg as SVGElement).style.width = `${layout.qrSizePx}px`;
    (qrSvg as SVGElement).style.height = `${layout.qrSizePx}px`;
  }
};
