/**
 * samplingPointEquipment.ts
 *
 * Связь оборудования берётся из выбранной точки и сбрасывается, если у точки её нет.
 */

export function equipmentIdForSamplingPoint(
  point: { equipmentId?: string | null } | undefined,
): string {
  return point?.equipmentId?.trim() || '';
}
