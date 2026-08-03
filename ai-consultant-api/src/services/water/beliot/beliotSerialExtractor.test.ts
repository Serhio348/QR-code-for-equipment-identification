/**
 * beliotSerialExtractor.test.ts
 *
 * Проверяет извлечение заводского номера из разных форматов Beliot.
 */

import { describe, expect, it } from 'vitest';
import { extractBeliotSerialNumber } from './beliotSerialExtractor.js';

describe('extractBeliotSerialNumber', () => {
  it('prefers an explicit provider field', () => {
    expect(extractBeliotSerialNumber({
      serial_number: '13001660',
      name: 'MTK-40N №99999999',
    })).toBe('13001660');
  });

  it('supports device and model serial fields', () => {
    expect(extractBeliotSerialNumber({ device_serial_number: '12345678' })).toBe('12345678');
    expect(extractBeliotSerialNumber({
      model: { serialNumber: '87654321' },
    })).toBe('87654321');
  });

  it('extracts a labeled serial number from the device name', () => {
    expect(extractBeliotSerialNumber({ name: 'MTK-40N №13001699' })).toBe('13001699');
  });

  it('does not treat a model number as a serial number', () => {
    expect(extractBeliotSerialNumber({ name: 'MTK-40N' })).toBeNull();
  });
});
