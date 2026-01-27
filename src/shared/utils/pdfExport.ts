import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { PlateExportSettings } from '../types/plateExport';

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
      // Если selectedSpecFields определен (даже если пустой массив), применяем фильтрацию
      // undefined/null означает "показать все" (по умолчанию)
      // [] означает "скрыть все" (пользователь снял все галочки)
      // [field1, field2] означает "показать только выбранные"
      const selectedFields = settings.selectedSpecFields;
      if (selectedFields !== undefined && selectedFields !== null) {
        const allSpecRows = specsTable.querySelectorAll('[data-plate-field]');
        allSpecRows.forEach((row) => {
          const fieldKey = (row as HTMLElement).getAttribute('data-plate-field');
          if (fieldKey && fieldKey !== 'inventoryNumber' && fieldKey !== 'commissioningDate' && fieldKey !== 'lastMaintenanceDate') {
            // Если массив пустой, скрываем все поля; иначе показываем только выбранные
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
 * Экспорт элемента в PDF с учетом настроек размера
 */
export const exportToPDF = async (
  elementId: string,
  filename: string = 'equipment-plate.pdf',
  settings?: PlateExportSettings
) => {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Element with id "${elementId}" not found`);
  }

  // Сохраняем оригинальные стили
  const originalStyles: { [key: string]: string } = {};
  const originalDisplay: Map<HTMLElement, string> = new Map();
  const originalQrSvgAttrs: { width?: string; height?: string } = {};
  
  if (settings) {
    // Сохраняем текущие стили контейнера
    originalStyles.width = element.style.width;
    originalStyles.minHeight = element.style.minHeight;
    
    // Сохраняем display для всех элементов (используем getComputedStyle для получения реального значения)
    const allElements = element.querySelectorAll('[data-plate-element], [data-plate-field]');
    allElements.forEach((el) => {
      const htmlEl = el as HTMLElement;
      // Сохраняем inline стиль, если есть, иначе сохраняем computed style
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
    
    // Применяем настройки
    applyExportSettings(element, settings);
  }

  try {
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#ffffff',
      onclone: (clonedDoc) => {
        // Убеждаемся, что цвета сохраняются при клонировании
        const clonedElement = clonedDoc.getElementById(elementId);
        if (clonedElement && settings) {
          applyExportSettings(clonedElement, settings);
        }
      }
    });

    const imgData = canvas.toDataURL('image/png');
    
    // Определяем размер PDF на основе настроек
    let pdfWidth: number;
    let pdfHeight: number;
    let orientation: 'p' | 'l' = 'p';
    
    if (settings?.size === 'A5') {
      pdfWidth = 148; // A5 width in mm
      pdfHeight = 210; // A5 height in mm
    } else if (settings?.size === 'custom' && settings.customWidth && settings.customHeight) {
      pdfWidth = settings.customWidth;
      pdfHeight = settings.customHeight;
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
    
    const pdf = new jsPDF(orientation, 'mm', [pdfWidth, pdfHeight]);
    
    const actualPdfWidth = pdf.internal.pageSize.getWidth();
    const actualPdfHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = canvas.width;
    const imgHeight = canvas.height;
    
    // Масштабируем изображение, чтобы оно поместилось на страницу
    const ratio = Math.min(actualPdfWidth / imgWidth, actualPdfHeight / imgHeight);
    const scaledWidth = imgWidth * ratio;
    const scaledHeight = imgHeight * ratio;
    
    // Центрируем изображение
    const imgX = (actualPdfWidth - scaledWidth) / 2;
    const imgY = (actualPdfHeight - scaledHeight) / 2;

    pdf.addImage(imgData, 'PNG', imgX, imgY, scaledWidth, scaledHeight);
    pdf.save(filename);
  } catch (error) {
    console.error('Error exporting to PDF:', error);
    throw error;
  } finally {
    // Восстанавливаем оригинальные стили
    if (settings) {
      // Восстанавливаем размеры контейнера
      element.style.width = originalStyles.width || '';
      element.style.minHeight = originalStyles.minHeight || '';
      
      // Восстанавливаем display для всех элементов из Map
      originalDisplay.forEach((displayValue, htmlEl) => {
        // Если был inline стиль или computed style, восстанавливаем его
        if (displayValue && displayValue !== 'none') {
          htmlEl.style.display = displayValue;
        } else {
          // Удаляем inline стиль, чтобы вернуться к CSS стилям
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
};
