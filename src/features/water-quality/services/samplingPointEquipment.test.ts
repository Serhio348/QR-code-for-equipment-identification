import { describe, expect, it } from 'vitest';
import { equipmentIdForSamplingPoint } from './samplingPointEquipment';

describe('equipmentIdForSamplingPoint', () => {
  it('replaces equipment from point A with an empty link on point B', () => {
    expect(equipmentIdForSamplingPoint({ equipmentId: 'pump-a' })).toBe('pump-a');
    expect(equipmentIdForSamplingPoint({ equipmentId: undefined })).toBe('');
    expect(equipmentIdForSamplingPoint(undefined)).toBe('');
  });
});
