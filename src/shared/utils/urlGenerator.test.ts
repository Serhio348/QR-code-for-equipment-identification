import { describe, expect, it } from 'vitest';
import { generateQRCodeUrl, getEquipmentQrUrl, isGoogleDriveUrl } from './urlGenerator';

describe('equipment QR URL generation', () => {
  it('generates an application equipment URL', () => {
    expect(generateQRCodeUrl('equip-a', 'https://app.example.test'))
      .toBe('https://app.example.test/equipment/equip-a');
  });

  it('replaces stored Google Drive links with application links', () => {
    expect(getEquipmentQrUrl(
      'equip-a',
      'https://drive.google.com/drive/folders/folder-a',
      'https://app.example.test',
    )).toBe('https://app.example.test/equipment/equip-a');
  });

  it('keeps a custom non-Drive QR URL', () => {
    expect(getEquipmentQrUrl('equip-a', 'https://labels.example.test/equip-a'))
      .toBe('https://labels.example.test/equip-a');
  });

  it('detects Google Drive and Docs links', () => {
    expect(isGoogleDriveUrl('https://drive.google.com/drive/folders/a')).toBe(true);
    expect(isGoogleDriveUrl('https://docs.google.com/spreadsheets/d/a')).toBe(true);
    expect(isGoogleDriveUrl('https://app.example.test/equipment/a')).toBe(false);
  });
});
