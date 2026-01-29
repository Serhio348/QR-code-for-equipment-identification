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
  // Применяем размеры
  if (settings.size === 'custom' && settings.customWidth && settings.customHeight) {
    const mmToPx = 3.78;
    element.style.width = `${settings.customWidth * mmToPx}px`;
    element.style.minHeight = `${settings.customHeight * mmToPx}px`;
  } else if (settings.size === 'A5') {
    element.style.width = '560px';
    element.style.minHeight = '794px';
  }

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
    if (settings.showQRCode && settings.qrCodeSize) {
      const qrCodeSvg = qrSection.querySelector('svg');
      if (qrCodeSvg) {
        qrCodeSvg.setAttribute('width', settings.qrCodeSize.toString());
        qrCodeSvg.setAttribute('height', settings.qrCodeSize.toString());
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

  // Сохраняем оригинальные стили
  const originalStyles: { [key: string]: string } = {};
  const originalDisplay: Map<HTMLElement, string> = new Map();
  const originalQrSvgAttrs: { width?: string; height?: string } = {};
  
  // Определяем тип настроек
  const isInspectionSettings = settings && 'paddingTop' in settings;
  
  if (settings) {
    // Сохраняем текущие стили контейнера
    originalStyles.width = element.style.width;
    originalStyles.minHeight = element.style.minHeight;
    originalStyles.padding = element.style.padding;
    originalStyles.boxSizing = element.style.boxSizing;
    originalStyles.margin = element.style.margin;
    originalStyles.height = element.style.height;
    originalStyles.overflow = element.style.overflow;
    
    if (isInspectionSettings) {
      // Применяем настройки для акта освидетельствования
      applyInspectionExportSettings(element, settings as InspectionExportSettings);
    } else {
      // Сохраняем display для всех элементов
      const allElements = element.querySelectorAll('[data-plate-element], [data-plate-field]');
      allElements.forEach((el) => {
        const htmlEl = el as HTMLElement;
        const inlineDisplay = htmlEl.style.display;
        const computedDisplay = window.getComputedStyle(htmlEl).display;
        originalDisplay.set(htmlEl, inlineDisplay || computedDisplay);
      });
      
      // Сохраняем размеры QR-кода SVG
      const qrSection = element.querySelector('[data-plate-element="qr-section"]') as HTMLElement;
      if (qrSection) {
        const qrCodeSvg = qrSection.querySelector('svg');
        if (qrCodeSvg) {
          originalQrSvgAttrs.width = qrCodeSvg.getAttribute('width') || undefined;
          originalQrSvgAttrs.height = qrCodeSvg.getAttribute('height') || undefined;
        }
      }
      
      // Применяем настройки для таблички оборудования
      applyExportSettings(element, settings as PlateExportSettings);
    }
  }

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
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#ffffff',
      width: element.offsetWidth,
      height: element.scrollHeight, // Используем полную высоту контента
      windowWidth: element.scrollWidth,
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
    
    if (size === 'A5') {
      pdfWidth = 148; // A5 width in mm
      pdfHeight = 210; // A5 height in mm
    } else if (size === 'custom' && (settings as any).customWidth && (settings as any).customHeight) {
      pdfWidth = (settings as any).customWidth;
      pdfHeight = (settings as any).customHeight;
      // Если ширина больше высоты, используем альбомную ориентацию
      if (pdfWidth > pdfHeight) {
        orientation = 'l';
        // Меняем местами для jsPDF
        const temp = pdfWidth;
        pdfWidth = pdfHeight;
        pdfHeight = temp;
      }
    } else {
      // A4 по умолчанию
      pdfWidth = 210; // A4 width in mm
      pdfHeight = 297; // A4 height in mm
    }
    
    const pdf = new jsPDF(orientation, 'mm', [pdfHeight, pdfWidth]);
    
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
      // Для таблички оборудования используем масштабирование и центрирование
      const ratio = Math.min(actualPdfWidth / imgWidth, actualPdfHeight / imgHeight);
      const scaledWidth = imgWidth * ratio;
      const scaledHeight = imgHeight * ratio;
      
      // Центрируем изображение
      const imgX = (actualPdfWidth - scaledWidth) / 2;
      const imgY = (actualPdfHeight - scaledHeight) / 2;

      pdf.addImage(imgData, 'PNG', imgX, imgY, scaledWidth, scaledHeight);
    }
    
    pdf.save(filename);
  } catch (error) {
    console.error('Error exporting to PDF:', error);
    throw error;
  } finally {
    // Восстанавливаем оригинальные стили
    if (settings) {
      element.style.width = originalStyles.width || '';
      element.style.minHeight = originalStyles.minHeight || '';
      element.style.padding = originalStyles.padding || '';
      element.style.boxSizing = originalStyles.boxSizing || '';
      element.style.margin = originalStyles.margin || '';
      element.style.height = originalStyles.height || '';
      element.style.overflow = originalStyles.overflow || '';
      
      if (!isInspectionSettings) {
        // Восстанавливаем display для всех элементов из Map
        originalDisplay.forEach((displayValue, htmlEl) => {
          if (displayValue && displayValue !== 'none') {
            htmlEl.style.display = displayValue;
          } else {
            htmlEl.style.display = '';
          }
        });
        
        // Восстанавливаем размер QR-кода
        const qrSection = element.querySelector('[data-plate-element="qr-section"]') as HTMLElement;
        if (qrSection) {
          const qrCodeSvg = qrSection.querySelector('svg');
          if (qrCodeSvg) {
            if (originalQrSvgAttrs.width) {
              qrCodeSvg.setAttribute('width', originalQrSvgAttrs.width);
            } else {
              qrCodeSvg.removeAttribute('width');
            }
            if (originalQrSvgAttrs.height) {
              qrCodeSvg.setAttribute('height', originalQrSvgAttrs.height);
            } else {
              qrCodeSvg.removeAttribute('height');
            }
          }
        }
      }
    }
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