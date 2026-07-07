/**
 * exportEquipmentPlatePdf.ts
 *
 * Экспорт таблички оборудования в PDF через off-screen HTML + html2canvas + jsPDF.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { PlateExportSettings } from '@/shared/types/plateExport';
import { EquipmentSpecs } from '../types/equipment';
import EquipmentPlateExport from '../components/EquipmentPlateExport';
import { buildPlateExportRows, PlateExportRowContext } from './plateExportRows';
import {
  applyPlateExportElementStyles,
  computePlateExportLayout,
} from './plateExportLayout';

const DEFAULT_QR_URL = 'https://drive.google.com/drive/folders/1t90itk12veviwYM1LH7DZ15G4slpPnon';
const EXPORT_ROOT_ID = 'equipment-plate-export-root';

export interface EquipmentPlateExportInput {
  specs: EquipmentSpecs;
  equipmentName?: string;
  equipmentType?: string;
  commissioningDate?: string;
  lastMaintenanceDate?: string;
  qrCodeUrl?: string;
}

const waitForElementReady = async (element: HTMLElement, maxAttempts = 20): Promise<void> => {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (element.offsetWidth > 0 && element.offsetHeight > 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Export plate element is not ready');
};

const cleanupExportRoot = (): void => {
  const existing = document.getElementById(EXPORT_ROOT_ID);
  if (existing) {
    existing.remove();
  }
};

export const exportEquipmentPlateToPDF = async (
  input: EquipmentPlateExportInput,
  settings: PlateExportSettings,
  filename: string,
): Promise<void> => {
  cleanupExportRoot();

  const rowContext: PlateExportRowContext = {
    specs: input.specs,
    settings,
    equipmentType: input.equipmentType,
    commissioningDate: input.commissioningDate,
    lastMaintenanceDate: input.lastMaintenanceDate,
  };

  const tableRows = buildPlateExportRows(rowContext);
  const layout = computePlateExportLayout(settings, tableRows.length > 0, tableRows.length);
  const displayName = input.equipmentName || input.specs.name || 'Оборудование';
  const urlForQR = input.qrCodeUrl || DEFAULT_QR_URL;

  const mountNode = document.createElement('div');
  mountNode.id = EXPORT_ROOT_ID;
  mountNode.style.position = 'fixed';
  mountNode.style.left = '0';
  mountNode.style.top = '0';
  mountNode.style.zIndex = '-1';
  mountNode.style.opacity = '1';
  mountNode.style.pointerEvents = 'none';
  document.body.appendChild(mountNode);

  const root = createRoot(mountNode);

  try {
    flushSync(() => {
      root.render(
        React.createElement(EquipmentPlateExport, {
          settings,
          layout,
          tableRows,
          equipmentName: displayName,
          qrCodeUrl: urlForQR,
        }),
      );
    });

    const plateElement = mountNode.querySelector('#equipment-plate-export') as HTMLElement | null;
    if (!plateElement) {
      throw new Error('Export plate element not found');
    }

    applyPlateExportElementStyles(plateElement, layout);
    await waitForElementReady(plateElement);

    const exportScale = layout.isCompact ? 5 : 2;
    const canvas = await html2canvas(plateElement, {
      scale: exportScale,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#ffffff',
      width: layout.widthPx,
      height: layout.isCompact ? layout.heightPx : plateElement.offsetHeight,
      windowWidth: layout.widthPx,
      ...(layout.isCompact ? { windowHeight: layout.heightPx } : {}),
    });

    if (canvas.width === 0 || canvas.height === 0) {
      throw new Error('Failed to capture plate image');
    }

    const imgData = canvas.toDataURL('image/png');
    const orientation = layout.widthMm > layout.heightMm ? 'l' : 'p';
    const pdf = new jsPDF(orientation, 'mm', [layout.widthMm, layout.heightMm]);

    const pageWidthMm = pdf.internal.pageSize.getWidth();
    const pageHeightMm = pdf.internal.pageSize.getHeight();
    const pxToMm = 25.4 / 96;
    const imgHeightMm = (canvas.height / exportScale) * pxToMm;
    const renderWidthMm = layout.widthMm;
    const renderHeightMm = layout.isCompact
      ? layout.heightMm
      : Math.max(layout.heightMm, imgHeightMm);
    const x = Math.max(0, (pageWidthMm - renderWidthMm) / 2);
    const y = Math.max(0, (pageHeightMm - renderHeightMm) / 2);

    pdf.addImage(imgData, 'PNG', x, y, renderWidthMm, renderHeightMm);
    pdf.save(filename);
  } finally {
    root.unmount();
    cleanupExportRoot();
  }
};
