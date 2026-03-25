import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { PlateExportSettings } from '../types/plateExport';
import { InspectionExportSettings } from '../types/inspectionExport';

/**
 * Ожидает, пока элемент будет готов к рендерингу
 */
const waitForElementReady = async (element: HTMLElement, maxAttempts = 10): Promise<void> => {
  for (let i = 0; i < maxAttempts; i++) {
    if (element.offsetWidth > 0 && element.offsetHeight > 0) {
      // Дополнительная задержка для завершения всех стилей
      await new Promise(resolve => setTimeout(resolve, 50));
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Element not ready after ${maxAttempts} attempts`);
};

/**
 * Применяет настройки экспорта к элементу через манипуляцию DOM
 */
const applyExportSettings = (element: HTMLElement, settings: PlateExportSettings) => {
  element.setAttribute('data-export-mode', 'true');

  // Применяем размеры таблички (в мм -> px) только для экспорта.
  // Важно: это НЕ размер страницы PDF, а размер таблички на листе.
  const mmToPx = 3.78;
  const plateWidthMm =
    settings.size === 'custom' && settings.customWidth ? settings.customWidth
      : settings.size === 'A5' ? 148
        : settings.size === 'A4' ? 210
          : 210;
  const plateHeightMm =
    settings.size === 'custom' && settings.customHeight ? settings.customHeight
      : settings.size === 'A5' ? 210
        : settings.size === 'A4' ? 297
          : 297;

  const minSideMm = Math.min(plateWidthMm, plateHeightMm);
  const isCompact = minSideMm <= 60; // 40×40 точно попадает сюда
  if (isCompact) {
    element.setAttribute('data-export-compact', 'true');
  } else {
    element.removeAttribute('data-export-compact');
  }

  const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);
  const minSidePx = minSideMm * mmToPx;
  const exportPaddingPx = clamp(Math.round(minSidePx * (isCompact ? 0.045 : 0.08)), 3, 16);
  const exportGapPx = clamp(Math.round(minSidePx * (isCompact ? 0.03 : 0.06)), 2, 14);
  const titleFontPx = clamp(Math.round(minSidePx * (isCompact ? 0.065 : 0.10)), 6, 22);
  const qrLabelFontPx = clamp(Math.round(minSidePx * (isCompact ? 0.042 : 0.055)), 4, 11);

  element.style.setProperty('--plate-export-padding', `${exportPaddingPx}px`);
  element.style.setProperty('--plate-export-gap', `${exportGapPx}px`);
  element.style.setProperty('--plate-export-title-font-size', `${titleFontPx}px`);
  element.style.setProperty('--plate-export-qr-label-font-size', `${qrLabelFontPx}px`);

  element.style.width = `${plateWidthMm * mmToPx}px`;
  element.style.minHeight = `${plateHeightMm * mmToPx}px`;
  element.style.height = `${plateHeightMm * mmToPx}px`;
  element.style.overflow = 'hidden';

  // Скрываем/показываем элементы
  const header = element.querySelector('[data-plate-element="header"]') as HTMLElement;
  if (header) {
    header.style.display = settings.showName ? '' : 'none';
  }

  const specsTable = element.querySelector('[data-plate-element="specs-table"]') as HTMLElement;
  if (specsTable) {
    if (!settings.showSpecs) {
      specsTable.style.display = 'none';
    } else {
      specsTable.style.display = '';
      
      // Скрываем инвентарный номер, если нужно
      const inventoryRow = specsTable.querySelector('[data-plate-field="inventoryNumber"]') as HTMLElement;
      if (inventoryRow) {
        inventoryRow.style.display = settings.showInventoryNumber ? '' : 'none';
      }
      
      // Скрываем даты, если нужно
      const commissioningRow = specsTable.querySelector('[data-plate-field="commissioningDate"]') as HTMLElement;
      if (commissioningRow) {
        commissioningRow.style.display = settings.showCommissioningDate ? '' : 'none';
      }
      
      const maintenanceRow = specsTable.querySelector('[data-plate-field="lastMaintenanceDate"]') as HTMLElement;
      if (maintenanceRow) {
        maintenanceRow.style.display = settings.showLastMaintenanceDate ? '' : 'none';
      }
      
      // Скрываем/показываем конкретные поля характеристик
      const selectedFields = settings.selectedSpecFields;
      if (selectedFields !== undefined && selectedFields !== null) {
        const allSpecRows = specsTable.querySelectorAll('[data-plate-field]');
        allSpecRows.forEach((row) => {
          const fieldKey = (row as HTMLElement).getAttribute('data-plate-field');
          if (fieldKey && fieldKey !== 'inventoryNumber' && fieldKey !== 'commissioningDate' && fieldKey !== 'lastMaintenanceDate') {
            (row as HTMLElement).style.display = selectedFields.includes(fieldKey) ? '' : 'none';
          }
        });
      }
    }
  }

  const qrSection = element.querySelector('[data-plate-element="qr-section"]') as HTMLElement;
  if (qrSection) {
    qrSection.style.display = settings.showQRCode ? '' : 'none';
    
    // Изменяем размер QR-кода
    if (settings.showQRCode) {
      // Подбор размера QR от доступного места (важно для 40×40),
      // иначе QR может обрезаться из-за overflow:hidden у таблички.
      const headerReservePx = settings.showName
        ? clamp(Math.round(titleFontPx * (isCompact ? 1.55 : 2.2) + exportPaddingPx * (isCompact ? 0.8 : 1.2)), 12, Math.round(minSidePx * 0.42))
        : 0;
      const qrSectionChromePx = isCompact ? clamp(Math.round(exportPaddingPx * 0.6), 2, 10) : exportPaddingPx;
      const qrLabelReservePx = isCompact ? clamp(Math.round(qrLabelFontPx * 4.2), 18, 60) : 0;
      const availableQrPx = clamp(
        Math.round(minSidePx - exportPaddingPx * 2 - headerReservePx - exportGapPx - qrSectionChromePx * 2 - qrLabelReservePx),
        40,
        300,
      );

      const qrSizePx = !settings.qrCodeAuto && settings.qrCodeSize
        ? settings.qrCodeSize
        : clamp(Math.round(availableQrPx * (isCompact ? 0.92 : 1.05)), 40, 260);

      element.style.setProperty('--plate-export-qr-size', `${qrSizePx}px`);
      const qrCodeSvg = qrSection.querySelector('svg');
      if (qrCodeSvg) {
        qrCodeSvg.setAttribute('width', qrSizePx.toString());
        qrCodeSvg.setAttribute('height', qrSizePx.toString());
        (qrCodeSvg as unknown as HTMLElement).style.width = `${qrSizePx}px`;
        (qrCodeSvg as unknown as HTMLElement).style.height = `${qrSizePx}px`;
      }

      // На маленьких табличках подпись под QR почти всегда мешает
      const qrLabel = qrSection.querySelector('.qr-label') as HTMLElement | null;
      if (qrLabel) {
        qrLabel.style.display = '';
      }
    }
  }
};

/**
 * Применяет настройки экспорта для акта освидетельствования
 */
const applyInspectionExportSettings = (element: HTMLElement, settings: InspectionExportSettings) => {
  // Применяем размеры - элемент должен занимать весь формат страницы
  const mmToPx = 3.78;

  if (settings.size === 'custom' && settings.customWidth && settings.customHeight) {
    element.style.width = `${settings.customWidth * mmToPx}px`;
    element.style.minHeight = `${settings.customHeight * mmToPx}px`;
  } else if (settings.size === 'A5') {
    element.style.width = `${148 * mmToPx}px`; // A5 width
    element.style.minHeight = `${210 * mmToPx}px`; // A5 height
  } else {
    // A4 по умолчанию
    element.style.width = `${210 * mmToPx}px`; // A4 width = 210mm
    element.style.minHeight = `${297 * mmToPx}px`; // A4 height = 297mm
  }

  // Применяем отступы (используем значения по умолчанию 10mm, если не указаны)
  const paddingTop = settings.paddingTop ?? 10;
  const paddingBottom = settings.paddingBottom ?? 10;
  const paddingLeft = settings.paddingLeft ?? 10;
  const paddingRight = settings.paddingRight ?? 10;

  element.style.padding = `${paddingTop}mm ${paddingRight}mm ${paddingBottom}mm ${paddingLeft}mm`;
  element.style.boxSizing = 'border-box';
  element.style.margin = '0';

  // Убедимся, что элемент может расширяться по высоте
  element.style.height = 'auto';
  element.style.overflow = 'visible';

  // КРИТИЧНО: Убедимся что элемент видим
  element.style.display = 'block';
  element.style.visibility = 'visible';
  element.style.opacity = '1';
};

/**
 * Экспорт элемента в PDF с учетом настроек размера
 */
export const exportToPDF = async (
  elementId: string,
  filename: string = 'equipment-plate.pdf',
  settings?: PlateExportSettings | InspectionExportSettings
) => {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Element with id "${elementId}" not found`);
  }

  // Определяем тип настроек
  const isInspectionSettings = settings && 'paddingTop' in settings;

  const plateSettings = (!isInspectionSettings ? (settings as PlateExportSettings | undefined) : undefined);
  const mmToPx = 3.78;
  const plateWidthMm =
    plateSettings?.size === 'custom' && plateSettings.customWidth ? plateSettings.customWidth
      : plateSettings?.size === 'A5' ? 148
        : 210;
  const plateHeightMm =
    plateSettings?.size === 'custom' && plateSettings.customHeight ? plateSettings.customHeight
      : plateSettings?.size === 'A5' ? 210
        : 297;
  const isPlateExport = !isInspectionSettings;

  try {
    // КРИТИЧНО: Ждем готовности элемента
    await waitForElementReady(element);

    console.log('Exporting element with dimensions:', {
      offsetWidth: element.offsetWidth,
      offsetHeight: element.offsetHeight,
      scrollHeight: element.scrollHeight,
      isInspectionSettings
    });

    // Создаем canvas с правильными настройками
    const exportWidthPx = isPlateExport ? Math.round(plateWidthMm * mmToPx) : element.offsetWidth;
    const exportHeightPx = isPlateExport ? Math.round(plateHeightMm * mmToPx) : element.scrollHeight;

    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#ffffff',
      width: exportWidthPx,
      height: exportHeightPx,
      windowWidth: exportWidthPx,
      onclone: (clonedDoc) => {
        // Убеждаемся, что цвета сохраняются при клонировании
        const clonedElement = clonedDoc.getElementById(elementId);
        if (clonedElement && settings) {
          if (isInspectionSettings) {
            applyInspectionExportSettings(clonedElement, settings as InspectionExportSettings);
          } else {
            applyExportSettings(clonedElement, settings as PlateExportSettings);
          }
        }
      }
    });

    // Проверяем что canvas не пустой
    if (canvas.width === 0 || canvas.height === 0) {
      console.error('Canvas has zero dimensions:', {
        width: canvas.width,
        height: canvas.height
      });
      throw new Error('Failed to create canvas with valid dimensions');
    }

    console.log('Canvas created:', {
      width: canvas.width,
      height: canvas.height
    });

    const imgData = canvas.toDataURL('image/png');
    
    // Определяем размер PDF на основе настроек
    let pdfWidth: number;
    let pdfHeight: number;
    let orientation: 'p' | 'l' = 'p';
    
    const size = (settings as any)?.size;

    if (isInspectionSettings) {
      if (size === 'A5') {
        pdfWidth = 148;
        pdfHeight = 210;
      } else if (size === 'custom' && (settings as any).customWidth && (settings as any).customHeight) {
        pdfWidth = (settings as any).customWidth;
        pdfHeight = (settings as any).customHeight;
      } else {
        pdfWidth = 210;
        pdfHeight = 297;
      }
    } else {
      // Для таблички: лист всегда A4, а настройки регулируют размер таблички на листе.
      pdfWidth = 210;
      pdfHeight = 297;
    }

    orientation = pdfWidth > pdfHeight ? 'l' : 'p';
    const pdf = new jsPDF(orientation, 'mm', [pdfWidth, pdfHeight]);
    
    const actualPdfWidth = pdf.internal.pageSize.getWidth();
    const actualPdfHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = canvas.width;
    const imgHeight = canvas.height;
    
    // Для акта освидетельствования используем логику с разбиением на страницы
    if (isInspectionSettings) {
      const inspectionSettings = settings as InspectionExportSettings;

      // Получаем отступы
      const paddingTop = inspectionSettings.paddingTop ?? 10;
      const paddingBottom = inspectionSettings.paddingBottom ?? 10;
      const paddingLeft = inspectionSettings.paddingLeft ?? 10;
      const paddingRight = inspectionSettings.paddingRight ?? 10;

      // Вычисляем доступную ширину и высоту на странице
      const availableWidth = actualPdfWidth - paddingLeft - paddingRight;
      const availableHeight = actualPdfHeight - paddingTop - paddingBottom;

      // Рассчитываем размеры изображения в мм
      const scale = 2; // html2canvas scale
      const dpi = 96; // стандартный DPI браузера
      const mmPerInch = 25.4;
      const pxToMm = mmPerInch / dpi;

      const imgWidthMm = (imgWidth / scale) * pxToMm;
      const imgHeightMm = (imgHeight / scale) * pxToMm;

      // Масштабируем по ширине
      const widthRatio = availableWidth / imgWidthMm;
      const scaledHeightMm = imgHeightMm * widthRatio;

      console.log('PDF dimensions:', {
        imgWidthMm,
        imgHeightMm,
        availableWidth,
        availableHeight,
        scaledHeightMm,
        willFitOnePage: scaledHeightMm <= availableHeight,
        canvasWidth: imgWidth,
        canvasHeight: imgHeight
      });

      // Если весь контент помещается на одной странице
      if (scaledHeightMm <= availableHeight) {
        console.log('Content fits on one page');
        pdf.addImage(
          imgData,
          'PNG',
          paddingLeft,
          paddingTop,
          availableWidth,
          scaledHeightMm,
          undefined,
          'FAST'
        );
      } else {
        // Разбиваем на несколько страниц
        console.log('Content needs multiple pages, splitting...');

        let currentYPx = 0;
        let pageNumber = 0;

        // Сколько пикселей canvas помещается на одной странице PDF
        const pageHeightPx = (availableHeight / pxToMm / widthRatio) * scale;

        console.log('Page split info:', {
          pageHeightPx,
          totalHeightPx: imgHeight,
          estimatedPages: Math.ceil(imgHeight / pageHeightPx)
        });

        while (currentYPx < imgHeight && pageNumber < 20) {
          if (pageNumber > 0) {
            pdf.addPage();
          }

          const remainingHeightPx = imgHeight - currentYPx;
          const heightForThisPagePx = Math.min(pageHeightPx, remainingHeightPx);

          console.log(`Creating page ${pageNumber + 1}:`, {
            currentYPx,
            heightForThisPagePx,
            remainingHeightPx
          });

          // Создаем временный canvas для части изображения
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = imgWidth;
          tempCanvas.height = Math.ceil(heightForThisPagePx);
          const tempCtx = tempCanvas.getContext('2d');

          if (tempCtx) {
            // Загружаем исходное изображение
            const img = new Image();
            await new Promise<void>((resolve, reject) => {
              img.onload = () => {
                try {
                  // Копируем нужную часть изображения
                  tempCtx.drawImage(
                    img,
                    0,                    // source x
                    currentYPx,           // source y (откуда берем)
                    imgWidth,             // source width
                    heightForThisPagePx,  // source height
                    0,                    // destination x
                    0,                    // destination y
                    imgWidth,             // destination width
                    heightForThisPagePx   // destination height
                  );
                  resolve();
                } catch (err) {
                  console.error('Error drawing to temp canvas:', err);
                  reject(err);
                }
              };
              img.onerror = () => {
                console.error('Error loading image for page split');
                reject(new Error('Failed to load image'));
              };
              img.src = imgData;
            });

            // Конвертируем часть canvas в PNG
            const croppedImgData = tempCanvas.toDataURL('image/png');

            // Рассчитываем высоту этой части в мм для PDF
            const heightMm = (heightForThisPagePx / scale) * pxToMm * widthRatio;

            console.log(`Adding page ${pageNumber + 1} to PDF:`, {
              width: availableWidth,
              height: heightMm
            });

            // Добавляем часть изображения на страницу
            pdf.addImage(
              croppedImgData,
              'PNG',
              paddingLeft,
              paddingTop,
              availableWidth,
              heightMm,
              undefined,
              'FAST'
            );
          }

          currentYPx += heightForThisPagePx;
          pageNumber++;
        }

        console.log(`Total pages created: ${pageNumber}`);
      }
    } else {
      // Для таблички оборудования корректно переводим px -> mm,
      // иначе размер в PDF "уплывает" (мм сравниваются с px).
      const scale = 2; // html2canvas scale (см. выше)
      const dpi = 96; // типичный DPI браузера
      const mmPerInch = 25.4;
      const pxToMm = mmPerInch / dpi;

      const imgWidthMm = (imgWidth / scale) * pxToMm;
      const imgHeightMm = (imgHeight / scale) * pxToMm;

      if (isPlateExport && plateSettings) {
        // Для таблички: кладём картинку размером таблички (мм) на лист A4 без растягивания.
        const x = Math.max(0, (actualPdfWidth - plateWidthMm) / 2);
        const y = Math.max(0, (actualPdfHeight - plateHeightMm) / 2);
        pdf.addImage(imgData, 'PNG', x, y, plateWidthMm, plateHeightMm);
      } else {
        const ratio = Math.min(actualPdfWidth / imgWidthMm, actualPdfHeight / imgHeightMm);
        const scaledWidthMm = imgWidthMm * ratio;
        const scaledHeightMm = imgHeightMm * ratio;

        // Центрируем изображение
        const imgX = (actualPdfWidth - scaledWidthMm) / 2;
        const imgY = (actualPdfHeight - scaledHeightMm) / 2;

        pdf.addImage(imgData, 'PNG', imgX, imgY, scaledWidthMm, scaledHeightMm);
      }
    }
    
    pdf.save(filename);
  } catch (error) {
    console.error('Error exporting to PDF:', error);
    throw error;
  } finally {
    // Ничего не восстанавливаем: экспортные стили применяются только к клону (html2canvas.onclone)
  }
};

/**
 * Простая версия экспорта для акта освидетельствования (альтернатива)
 * Использует автоматическое разбиение jsPDF
 */
export const exportInspectionToPDF = async (
  elementId: string,
  filename: string = 'inspection-act.pdf',
  settings: InspectionExportSettings = {
    size: 'A4'
  }
) => {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Element with id "${elementId}" not found`);
  }

  // Сохраняем оригинальные стили
  const originalStyles: { [key: string]: string } = {
    width: element.style.width,
    minHeight: element.style.minHeight,
    padding: element.style.padding,
    boxSizing: element.style.boxSizing,
    margin: element.style.margin
  };

  try {
    // Применяем настройки
    applyInspectionExportSettings(element, settings);

    // КРИТИЧНО: Ждем готовности элемента
    await waitForElementReady(element);

    console.log('Exporting inspection with dimensions:', {
      offsetWidth: element.offsetWidth,
      offsetHeight: element.offsetHeight,
      scrollHeight: element.scrollHeight
    });

    // Создаем canvas
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#ffffff',
      width: element.offsetWidth,
      height: element.scrollHeight,
      windowWidth: element.scrollWidth
    });

    // Проверяем canvas
    if (canvas.width === 0 || canvas.height === 0) {
      console.error('Canvas has zero dimensions:', {
        width: canvas.width,
        height: canvas.height
      });
      throw new Error('Failed to create canvas with valid dimensions');
    }

    console.log('Canvas created successfully:', {
      width: canvas.width,
      height: canvas.height
    });

    const imgData = canvas.toDataURL('image/png');
    
    // Определяем размер PDF
    let pdfWidth: number;
    let pdfHeight: number;
    
    if (settings.size === 'A5') {
      pdfWidth = 148;
      pdfHeight = 210;
    } else if (settings.size === 'custom' && settings.customWidth && settings.customHeight) {
      pdfWidth = settings.customWidth;
      pdfHeight = settings.customHeight;
    } else {
      pdfWidth = 210;
      pdfHeight = 297;
    }
    
    // Создаем PDF
    const pdf = new jsPDF('p', 'mm', [pdfHeight, pdfWidth]);
    
    // Отступы
    const paddingTop = settings.paddingTop ?? 10;
    const paddingLeft = settings.paddingLeft ?? 10;
    const paddingRight = settings.paddingRight ?? 10;
    
    // Рассчитываем размеры
    const availableWidth = pdfWidth - paddingLeft - paddingRight;
    const scale = 2;
    const dpi = 96;
    const mmPerInch = 25.4;
    const pxToMm = mmPerInch / dpi;
    
    const imgWidthMm = (canvas.width / scale) * pxToMm;
    const imgHeightMm = (canvas.height / scale) * pxToMm;
    
    // Масштабируем по ширине
    const widthRatio = availableWidth / imgWidthMm;
    const scaledHeight = imgHeightMm * widthRatio;
    
    // Просто добавляем изображение - jsPDF сам разобьет на страницы если нужно
    pdf.addImage(
      imgData,
      'PNG',
      paddingLeft,
      paddingTop,
      availableWidth,
      scaledHeight,
      undefined,
      'FAST'
    );
    
    pdf.save(filename);
    
  } catch (error) {
    console.error('Error exporting inspection to PDF:', error);
    throw error;
  } finally {
    // Восстанавливаем стили
    element.style.width = originalStyles.width || '';
    element.style.minHeight = originalStyles.minHeight || '';
    element.style.padding = originalStyles.padding || '';
    element.style.boxSizing = originalStyles.boxSizing || '';
    element.style.margin = originalStyles.margin || '';
  }
};