import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { InspectionExportSettings } from '../types/inspectionExport';

const MM_TO_PX = 3.78;

/**
 * Ожидает, пока элемент будет готов к рендерингу
 */
const waitForElementReady = async (element: HTMLElement, maxAttempts = 10): Promise<void> => {
  for (let i = 0; i < maxAttempts; i++) {
    if (element.offsetWidth > 0 && element.offsetHeight > 0) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Element not ready after ${maxAttempts} attempts`);
};

/**
 * Применяет настройки экспорта для акта освидетельствования
 */
const applyInspectionExportSettings = (element: HTMLElement, settings: InspectionExportSettings): void => {
  if (settings.size === 'custom' && settings.customWidth && settings.customHeight) {
    element.style.width = `${settings.customWidth * MM_TO_PX}px`;
    element.style.minHeight = `${settings.customHeight * MM_TO_PX}px`;
  } else if (settings.size === 'A5') {
    element.style.width = `${148 * MM_TO_PX}px`;
    element.style.minHeight = `${210 * MM_TO_PX}px`;
  } else {
    element.style.width = `${210 * MM_TO_PX}px`;
    element.style.minHeight = `${297 * MM_TO_PX}px`;
  }

  const paddingTop = settings.paddingTop ?? 10;
  const paddingBottom = settings.paddingBottom ?? 10;
  const paddingLeft = settings.paddingLeft ?? 10;
  const paddingRight = settings.paddingRight ?? 10;

  element.style.padding = `${paddingTop}mm ${paddingRight}mm ${paddingBottom}mm ${paddingLeft}mm`;
  element.style.boxSizing = 'border-box';
  element.style.margin = '0';
  element.style.height = 'auto';
  element.style.overflow = 'visible';
  element.style.display = 'block';
  element.style.visibility = 'visible';
  element.style.opacity = '1';
};

const resolveInspectionPdfSize = (
  settings: InspectionExportSettings,
): { pdfWidth: number; pdfHeight: number } => {
  if (settings.size === 'A5') {
    return { pdfWidth: 148, pdfHeight: 210 };
  }
  if (settings.size === 'custom' && settings.customWidth && settings.customHeight) {
    return { pdfWidth: settings.customWidth, pdfHeight: settings.customHeight };
  }
  return { pdfWidth: 210, pdfHeight: 297 };
};

/**
 * Экспорт акта освидетельствования в PDF
 */
export const exportToPDF = async (
  elementId: string,
  filename: string,
  settings: InspectionExportSettings,
): Promise<void> => {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Element with id "${elementId}" not found`);
  }

  const { pdfWidth, pdfHeight } = resolveInspectionPdfSize(settings);

  try {
    await waitForElementReady(element);

    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#ffffff',
      width: element.offsetWidth,
      windowWidth: element.offsetWidth,
      onclone: (clonedDoc) => {
        const clonedElement = clonedDoc.getElementById(elementId);
        if (clonedElement) {
          applyInspectionExportSettings(clonedElement, settings);
        }
      },
    });

    if (canvas.width === 0 || canvas.height === 0) {
      throw new Error('Failed to create canvas with valid dimensions');
    }

    const imgData = canvas.toDataURL('image/png');
    const orientation = pdfWidth > pdfHeight ? 'l' : 'p';
    const pdf = new jsPDF(orientation, 'mm', [pdfWidth, pdfHeight]);

    const actualPdfWidth = pdf.internal.pageSize.getWidth();
    const actualPdfHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = canvas.width;
    const imgHeight = canvas.height;

    const paddingTop = settings.paddingTop ?? 10;
    const paddingBottom = settings.paddingBottom ?? 10;
    const paddingLeft = settings.paddingLeft ?? 10;
    const paddingRight = settings.paddingRight ?? 10;

    const availableWidth = actualPdfWidth - paddingLeft - paddingRight;
    const availableHeight = actualPdfHeight - paddingTop - paddingBottom;

    const scale = 2;
    const pxToMm = 25.4 / 96;
    const imgWidthMm = (imgWidth / scale) * pxToMm;
    const imgHeightMm = (imgHeight / scale) * pxToMm;
    const widthRatio = availableWidth / imgWidthMm;
    const scaledHeightMm = imgHeightMm * widthRatio;

    if (scaledHeightMm <= availableHeight) {
      pdf.addImage(
        imgData,
        'PNG',
        paddingLeft,
        paddingTop,
        availableWidth,
        scaledHeightMm,
        undefined,
        'FAST',
      );
      pdf.save(filename);
      return;
    }

    let currentYPx = 0;
    let pageNumber = 0;
    const pageHeightPx = (availableHeight / pxToMm / widthRatio) * scale;

    while (currentYPx < imgHeight && pageNumber < 20) {
      if (pageNumber > 0) {
        pdf.addPage();
      }

      const remainingHeightPx = imgHeight - currentYPx;
      const heightForThisPagePx = Math.min(pageHeightPx, remainingHeightPx);

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = imgWidth;
      tempCanvas.height = Math.ceil(heightForThisPagePx);
      const tempCtx = tempCanvas.getContext('2d');

      if (tempCtx) {
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => {
            try {
              tempCtx.drawImage(
                img,
                0,
                currentYPx,
                imgWidth,
                heightForThisPagePx,
                0,
                0,
                imgWidth,
                heightForThisPagePx,
              );
              resolve();
            } catch (err) {
              reject(err);
            }
          };
          img.onerror = () => reject(new Error('Failed to load image'));
          img.src = imgData;
        });

        const croppedImgData = tempCanvas.toDataURL('image/png');
        const heightMm = (heightForThisPagePx / scale) * pxToMm * widthRatio;

        pdf.addImage(
          croppedImgData,
          'PNG',
          paddingLeft,
          paddingTop,
          availableWidth,
          heightMm,
          undefined,
          'FAST',
        );
      }

      currentYPx += heightForThisPagePx;
      pageNumber++;
    }

    pdf.save(filename);
  } catch (error) {
    console.error('Error exporting to PDF:', error);
    throw error;
  }
};

/**
 * Альтернативный экспорт акта освидетельствования (прямое применение стилей к DOM)
 */
export const exportInspectionToPDF = async (
  elementId: string,
  filename: string = 'inspection-act.pdf',
  settings: InspectionExportSettings = { size: 'A4' },
): Promise<void> => {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Element with id "${elementId}" not found`);
  }

  const originalStyles: Record<string, string> = {
    width: element.style.width,
    minHeight: element.style.minHeight,
    padding: element.style.padding,
    boxSizing: element.style.boxSizing,
    margin: element.style.margin,
  };

  try {
    applyInspectionExportSettings(element, settings);
    await waitForElementReady(element);

    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#ffffff',
      width: element.offsetWidth,
      height: element.scrollHeight,
      windowWidth: element.scrollWidth,
    });

    if (canvas.width === 0 || canvas.height === 0) {
      throw new Error('Failed to create canvas with valid dimensions');
    }

    const imgData = canvas.toDataURL('image/png');
    const { pdfWidth, pdfHeight } = resolveInspectionPdfSize(settings);
    const pdf = new jsPDF('p', 'mm', [pdfHeight, pdfWidth]);

    const paddingTop = settings.paddingTop ?? 10;
    const paddingLeft = settings.paddingLeft ?? 10;
    const paddingRight = settings.paddingRight ?? 10;
    const availableWidth = pdfWidth - paddingLeft - paddingRight;

    const scale = 2;
    const pxToMm = 25.4 / 96;
    const imgWidthMm = (canvas.width / scale) * pxToMm;
    const imgHeightMm = (canvas.height / scale) * pxToMm;
    const widthRatio = availableWidth / imgWidthMm;
    const scaledHeight = imgHeightMm * widthRatio;

    pdf.addImage(
      imgData,
      'PNG',
      paddingLeft,
      paddingTop,
      availableWidth,
      scaledHeight,
      undefined,
      'FAST',
    );

    pdf.save(filename);
  } catch (error) {
    console.error('Error exporting inspection to PDF:', error);
    throw error;
  } finally {
    element.style.width = originalStyles.width || '';
    element.style.minHeight = originalStyles.minHeight || '';
    element.style.padding = originalStyles.padding || '';
    element.style.boxSizing = originalStyles.boxSizing || '';
    element.style.margin = originalStyles.margin || '';
  }
};
