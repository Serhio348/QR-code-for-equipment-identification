import { describe, expect, it } from 'vitest';
import { equipmentCardState, verifiedQrUrl } from './equipmentCardState';

describe('equipmentCardState', () => {
  it('keeps a missing record separate from a failed request', () => {
    expect(equipmentCardState({
      loading: false,
      notFound: true,
      loadError: null,
      hasEquipment: false,
    })).toBe('not-found');

    expect(equipmentCardState({
      loading: false,
      notFound: false,
      loadError: 'Failed to fetch',
      hasEquipment: false,
    })).toBe('error');

    expect(equipmentCardState({
      loading: true,
      notFound: false,
      loadError: null,
      hasEquipment: false,
    })).toBe('loading');
  });

  it('shows the plate only when the record itself is loaded', () => {
    expect(equipmentCardState({
      loading: false,
      notFound: false,
      loadError: null,
      hasEquipment: true,
    })).toBe('ready');
  });
});

describe('verifiedQrUrl', () => {
  it('uses only a link stored on this equipment', () => {
    expect(verifiedQrUrl(' https://example.test/qr ')).toBe('https://example.test/qr');
    expect(verifiedQrUrl('')).toBeNull();
    expect(verifiedQrUrl('   ')).toBeNull();
    expect(verifiedQrUrl(undefined)).toBeNull();
  });
});
