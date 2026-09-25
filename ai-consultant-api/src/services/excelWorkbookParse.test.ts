/**
 * excelWorkbookParse.test.ts
 *
 * SEC-09: парсинг xlsx через exceljs (без уязвимого npm xlsx).
 */

import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';

describe('SEC-09 exceljs workbook parse', () => {
  it('reads xlsx buffer into sheet rows', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Invoice');
    sheet.addRow(['Период', 'Сумма']);
    sheet.addRow(['2026-03', 1185.22]);

    const raw = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(raw);

    const loaded = new ExcelJS.Workbook();
    await loaded.xlsx.load(buffer as unknown as Parameters<typeof loaded.xlsx.load>[0]);

    expect(loaded.worksheets).toHaveLength(1);
    expect(loaded.worksheets[0].name).toBe('Invoice');
    expect(loaded.worksheets[0].getRow(2).getCell(2).value).toBe(1185.22);
  });
});
