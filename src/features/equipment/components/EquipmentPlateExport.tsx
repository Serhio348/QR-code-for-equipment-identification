/**
 * EquipmentPlateExport.tsx
 *
 * Отдельный HTML-шаблон таблички только для PDF-экспорта.
 * Фиксированная вёрстка без media queries и без UI экранной таблички.
 */

import React from 'react';
import { PlateExportSettings } from '@/shared/types/plateExport';
import { PlateExportLayout } from '../utils/plateExportLayout';
import { PlateExportRow } from '../utils/plateExportRows';
import QRCodeComponent from '../../common/components/QRCode';
import './EquipmentPlateExport.css';

export interface EquipmentPlateExportProps {
  settings: PlateExportSettings;
  layout: PlateExportLayout;
  tableRows: PlateExportRow[];
  equipmentName: string;
  qrCodeUrl: string;
}

const EquipmentPlateExport: React.FC<EquipmentPlateExportProps> = ({
  settings,
  layout,
  tableRows,
  equipmentName,
  qrCodeUrl,
}) => {
  const isStandard = layout.mode === 'standard';

  return (
    <div
      className="equipment-plate-export"
      id="equipment-plate-export"
      lang="ru"
      data-layout-mode={layout.mode}
      data-export-compact={layout.isCompact ? 'true' : undefined}
    >
      {settings.showName && (
        <div className="plate-export-header">
          <h1 className="plate-export-title">{equipmentName}</h1>
        </div>
      )}

      <div className={`plate-export-content${isStandard ? ' plate-export-content--row' : ''}`}>
        {tableRows.length > 0 && (
          <div className="plate-export-specs">
            <table>
              <tbody>
                {tableRows.map((row) => (
                  <tr key={row.key} className={row.isDate ? 'plate-export-date-row' : undefined}>
                    <td className="plate-export-label">{row.label}:</td>
                    <td className={row.isNotes ? 'plate-export-value plate-export-notes' : 'plate-export-value'}>
                      {row.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {settings.showQRCode && layout.qrSizePx > 0 && (
          <div className="plate-export-qr">
            <QRCodeComponent url={qrCodeUrl} size={layout.qrSizePx} />
            <p className="plate-export-qr-label">Отсканируйте для получения дополнительной информации</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default EquipmentPlateExport;
